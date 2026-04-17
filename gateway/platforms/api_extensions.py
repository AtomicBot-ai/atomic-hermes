"""API extensions for hermes-agent api_server platform.

Adds configuration, provider management, model switching, skills, memory,
and MCP endpoints. All routes delegate to existing hermes-cli functions --
no logic is duplicated.

Loaded by api_server.py via a try/except import in APIServerAdapter.connect().
If this file is absent, hermes-agent works as stock upstream.
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from gateway.platforms.api_profile_shared import (
    deep_merge as _deep_merge,
    extract_active_model as _extract_active_model,
    mask_key as _mask_key,
    oauth_poll_token as _oauth_poll_token,
    oauth_request_device_code as _oauth_request_device_code,
)

logger = logging.getLogger(__name__)

try:
    from aiohttp import web
except ImportError:
    web = None  # type: ignore[assignment]


def build_desktop_openai_warmup_agent_for_gateway(**kwargs: Any) -> Any:
    """Stable entry point for desktop local-LLM warmup (gateway context).

    Delegates to ``agent.local_llm_warmup.build_desktop_openai_warmup_agent`` with
    ``agent_alignment`` defaulting to ``api_server``.
    """
    from agent.local_llm_warmup import build_desktop_openai_warmup_agent

    merged = dict(kwargs)
    merged.setdefault("agent_alignment", "api_server")
    return build_desktop_openai_warmup_agent(**merged)


def _get_hermes_home() -> Path:
    try:
        from hermes_constants import get_hermes_home

        return get_hermes_home()
    except ImportError:
        return Path.home() / ".hermes"


def _get_version() -> str:
    try:
        from hermes_cli import __version__

        return __version__
    except ImportError:
        return "unknown"


def _openai_error(
    message: str,
    err_type: str = "invalid_request_error",
    param: Optional[str] = None,
    code: Optional[str] = None,
) -> Dict[str, Any]:
    """OpenAI-style error envelope."""
    return {
        "error": {
            "message": message,
            "type": err_type,
            "param": param,
            "code": code,
        }
    }


# ---------------------------------------------------------------------------
# Skills helpers (shared by route handlers and worker)
# ---------------------------------------------------------------------------


def _get_installed_skill_names() -> set:
    """Return a set of installed skill names by scanning SKILLS_DIR."""
    try:
        from tools.skills_tool import _parse_frontmatter, SKILLS_DIR
        from agent.skill_utils import get_external_skills_dirs

        names: set = set()
        dirs_to_scan: list = []
        if SKILLS_DIR.exists():
            dirs_to_scan.append(SKILLS_DIR)
        dirs_to_scan.extend(get_external_skills_dirs())

        for scan_dir in dirs_to_scan:
            for skill_md in scan_dir.rglob("SKILL.md"):
                if any(part in (".git", ".github", ".hub") for part in skill_md.parts):
                    continue
                try:
                    content = skill_md.read_text(encoding="utf-8")[:4000]
                    frontmatter, _ = _parse_frontmatter(content)
                    names.add(frontmatter.get("name", skill_md.parent.name))
                except Exception:
                    continue
        return names
    except Exception:
        return set()


def _list_skills_enriched() -> list:
    """Return enriched skill list with enabled/category/author/tags/emoji.

    Uses ``_find_all_skills(skip_disabled=True)`` which returns ALL skills
    regardless of disabled state, then marks each with ``enabled``.
    """
    from tools.skills_tool import _parse_frontmatter, _parse_tags, SKILLS_DIR
    from agent.skill_utils import get_disabled_skill_names, get_external_skills_dirs

    disabled = get_disabled_skill_names()

    skills = []
    seen_names: set = set()

    dirs_to_scan: list = []
    if SKILLS_DIR.exists():
        dirs_to_scan.append(SKILLS_DIR)
    dirs_to_scan.extend(get_external_skills_dirs())

    for scan_dir in dirs_to_scan:
        for skill_md in scan_dir.rglob("SKILL.md"):
            if any(part in (".git", ".github", ".hub") for part in skill_md.parts):
                continue
            try:
                content = skill_md.read_text(encoding="utf-8")[:4000]
                frontmatter, body = _parse_frontmatter(content)

                name = frontmatter.get("name", skill_md.parent.name)
                if name in seen_names:
                    continue
                seen_names.add(name)

                description = frontmatter.get("description", "")
                if not description:
                    for line in body.strip().split("\n"):
                        line = line.strip()
                        if line and not line.startswith("#"):
                            description = line[:200]
                            break

                skill_dir = str(skill_md.parent)
                cmd_slug = name.lower().replace(" ", "-").replace("_", "-")

                skills.append({
                    "trigger": f"/{cmd_slug}" if cmd_slug else "",
                    "name": name,
                    "description": description,
                    "path": skill_dir,
                    "dirName": Path(skill_dir).name,
                    "enabled": name not in disabled,
                    "category": frontmatter.get("category", ""),
                    "author": frontmatter.get("author", ""),
                    "tags": _parse_tags(frontmatter.get("tags")),
                    "emoji": frontmatter.get("emoji", ""),
                })
            except Exception:
                continue

    return skills


def _toggle_skill(name: str, enabled: bool) -> None:
    """Enable or disable a skill by updating config.yaml."""
    from hermes_cli.skills_config import get_disabled_skills, save_disabled_skills
    from hermes_cli.config import load_config

    config = load_config()
    disabled = get_disabled_skills(config)
    if enabled:
        disabled.discard(name)
    else:
        disabled.add(name)
    save_disabled_skills(config, disabled)

    try:
        from agent.prompt_builder import clear_skills_system_prompt_cache

        clear_skills_system_prompt_cache()
    except ImportError:
        pass


def _install_skill(identifier: str) -> dict:
    """Install a skill from the hub."""
    try:
        from hermes_cli.skills_hub import do_install

        do_install(identifier, skip_confirm=True)
        try:
            from agent.prompt_builder import clear_skills_system_prompt_cache

            clear_skills_system_prompt_cache()
        except ImportError:
            pass
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _uninstall_skill(name: str) -> dict:
    """Uninstall a skill."""
    try:
        from hermes_cli.skills_hub import do_uninstall

        do_uninstall(name, skip_confirm=True)
        try:
            from agent.prompt_builder import clear_skills_system_prompt_cache

            clear_skills_system_prompt_cache()
        except ImportError:
            pass
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _update_skill(name: str, content: str) -> dict:
    """Update a skill's SKILL.md content on disk."""
    from tools.skills_tool import SKILLS_DIR, _parse_frontmatter
    from agent.skill_utils import get_external_skills_dirs

    all_dirs = []
    if SKILLS_DIR.exists():
        all_dirs.append(SKILLS_DIR)
    all_dirs.extend(get_external_skills_dirs())

    if not all_dirs:
        return {"ok": False, "error": "Skills directory does not exist"}

    skill_md = None

    for search_dir in all_dirs:
        direct_path = search_dir / name
        if direct_path.is_dir() and (direct_path / "SKILL.md").exists():
            skill_md = direct_path / "SKILL.md"
            break

    if not skill_md:
        for search_dir in all_dirs:
            for found in search_dir.rglob("SKILL.md"):
                if found.parent.name == name:
                    skill_md = found
                    break
            if skill_md:
                break

    if not skill_md or not skill_md.exists():
        return {"ok": False, "error": f"Skill '{name}' not found"}

    fm, _ = _parse_frontmatter(content)
    if not fm.get("name"):
        return {"ok": False, "error": "YAML frontmatter must contain a 'name' field"}

    try:
        skill_md.write_text(content, encoding="utf-8")
    except Exception as e:
        return {"ok": False, "error": f"Failed to write: {e}"}

    try:
        from agent.prompt_builder import clear_skills_system_prompt_cache

        clear_skills_system_prompt_cache()
    except ImportError:
        pass

    return {"ok": True}


def _search_hub(query: str, limit: int = 30, offset: int = 0) -> dict:
    """Search the skills hub via unified_search (returns SkillMeta objects)."""
    try:
        from tools.skills_hub import GitHubAuth, create_source_router, unified_search

        auth = GitHubAuth()
        sources = create_source_router(auth)
        fetch_cap = 500
        results = unified_search(query, sources, limit=fetch_cap)

        installed_names = _get_installed_skill_names()

        items = []
        for r in results:
            items.append({
                "slug": r.name,
                "name": r.name,
                "displayName": r.name,
                "description": r.description,
                "summary": r.description,
                "source": r.source,
                "identifier": r.identifier,
                "trust_level": r.trust_level,
                "repo": r.repo,
                "tags": r.tags,
                "installed": r.name in installed_names,
                "author": r.extra.get("author", ""),
                "emoji": r.extra.get("emoji", ""),
                "downloads": r.extra.get("installs") or r.extra.get("downloads"),
                "stars": r.extra.get("stargazers_count") or r.extra.get("stars"),
            })

        total = len(items)
        page = items[offset : offset + limit]
        return {
            "ok": True,
            "results": page,
            "total": total,
            "hasMore": offset + limit < total,
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "results": [], "total": 0}


# ---------------------------------------------------------------------------
# Route handlers
# ---------------------------------------------------------------------------


class _ConfigRoutes:
    """Namespace for route handler methods. Holds a reference to the adapter."""

    def __init__(self, adapter: Any):
        self._adapter = adapter
        self._running_completions: Dict[str, Dict[str, Any]] = {}

    def _check_auth(self, request: "web.Request") -> Optional["web.Response"]:
        return self._adapter._check_auth(request)

    def _profile_id(self, request: "web.Request") -> str:
        return self._adapter._resolve_request_profile(request)

    def _profile_headers(self, request: "web.Request") -> Dict[str, str]:
        return {"X-Hermes-Profile": self._profile_id(request)}

    def _use_host_profile(self, request: "web.Request") -> bool:
        return self._adapter._is_host_profile(self._profile_id(request))

    async def _profile_call(
        self,
        request: "web.Request",
        method: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        profile_id = self._profile_id(request)
        return await self._adapter._worker_call(profile_id, method, params or {})

    @staticmethod
    def _derive_chat_session_id(
        system_prompt: Optional[str],
        first_user_message: str,
    ) -> str:
        """Derive a stable session id from the first user turn."""
        seed = f"{system_prompt or ''}\n{first_user_message}"
        digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16]
        return f"api-{digest}"

    @staticmethod
    def _build_stream_chunk(
        completion_id: str,
        created: int,
        model: str,
        *,
        delta: Optional[Dict[str, Any]] = None,
        finish_reason: Optional[str] = None,
        usage: Optional[Dict[str, Any]] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Build an OpenAI-compatible chat completion chunk."""
        chunk: Dict[str, Any] = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "delta": delta or {},
                    "finish_reason": finish_reason,
                }
            ],
        }
        if usage is not None:
            chunk["usage"] = usage
        if extra:
            chunk.update(extra)
        return chunk

    @staticmethod
    def _build_usage_payload(result: Dict[str, Any]) -> Dict[str, Any]:
        """Build OpenAI-style usage payload with Hermes extensions."""
        prompt_tokens = int(
            result.get("prompt_tokens") or result.get("input_tokens") or 0
        )
        completion_tokens = int(
            result.get("completion_tokens") or result.get("output_tokens") or 0
        )
        total_tokens = int(
            result.get("total_tokens") or (prompt_tokens + completion_tokens)
        )
        reasoning_tokens = int(result.get("reasoning_tokens") or 0)
        return {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "reasoning_tokens": reasoning_tokens,
        }

    @staticmethod
    def _extract_final_assistant_payload(result: Dict[str, Any]) -> Dict[str, Any]:
        """Extract the last assistant message with reasoning metadata."""
        messages = result.get("messages") or []
        final_message: Dict[str, Any] = {
            "role": "assistant",
            "content": result.get("final_response", "") or "",
        }
        finish_reason = "stop"

        for msg in reversed(messages):
            if msg.get("role") != "assistant":
                continue
            final_message["content"] = msg.get("content") or final_message["content"]
            if msg.get("reasoning"):
                final_message["reasoning"] = msg["reasoning"]
            elif result.get("last_reasoning"):
                final_message["reasoning"] = result["last_reasoning"]
            if msg.get("reasoning_details"):
                final_message["reasoning_details"] = msg["reasoning_details"]
            if msg.get("finish_reason"):
                finish_reason = msg["finish_reason"]
            break
        else:
            if result.get("last_reasoning"):
                final_message["reasoning"] = result["last_reasoning"]

        return {
            "message": final_message,
            "finish_reason": finish_reason,
        }

    async def _run_chat_completion(
        self,
        *,
        user_message: str,
        history: List[Dict[str, str]],
        system_prompt: Optional[str],
        session_id: str,
        stream_delta_callback=None,
        reasoning_callback=None,
        tool_progress_callback=None,
        agent_ref: Optional[list] = None,
        approval_stream_q=None,
    ) -> Dict[str, Any]:
        """Run a chat completion through the shared agent stack."""
        loop = asyncio.get_running_loop()

        def _run() -> Dict[str, Any]:
            agent = self._adapter._create_agent(
                ephemeral_system_prompt=system_prompt,
                session_id=session_id,
                stream_delta_callback=stream_delta_callback,
                reasoning_callback=reasoning_callback,
                tool_progress_callback=tool_progress_callback,
            )
            if agent_ref is not None:
                agent_ref[0] = agent

            if approval_stream_q is not None:
                from tools.approval import (
                    register_gateway_notify,
                    reset_current_session_key,
                    set_current_session_key,
                    unregister_gateway_notify,
                )

                def _approval_notify(approval_data: dict) -> None:
                    approval_stream_q.put(("exec_approval_requested", approval_data))

                token = set_current_session_key(session_id)
                register_gateway_notify(session_id, _approval_notify)
                try:
                    return agent.run_conversation(
                        user_message=user_message,
                        conversation_history=history,
                        task_id="default",
                    )
                finally:
                    unregister_gateway_notify(session_id)
                    reset_current_session_key(token)
            else:
                return agent.run_conversation(
                    user_message=user_message,
                    conversation_history=history,
                    task_id="default",
                )

        return await loop.run_in_executor(None, _run)

    async def _write_extended_chat_completion_stream(
        self,
        request,
        *,
        completion_id: str,
        created: int,
        model: str,
        session_id: str,
        stream_q,
        agent_task,
        agent_ref: Optional[list] = None,
    ):
        """Write an OpenAI-compatible SSE stream with Hermes extensions."""
        import queue as _q

        headers = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Hermes-Session-Id": session_id,
            "X-Hermes-Completion-Id": completion_id,
        }
        response = web.StreamResponse(status=200, headers=headers)
        await response.prepare(request)

        self._running_completions[completion_id] = {
            "agent_ref": agent_ref,
            "agent_task": agent_task,
        }

        async def _write_event(
            event_name: Optional[str], payload: Dict[str, Any]
        ) -> None:
            prefix = f"event: {event_name}\n" if event_name else ""
            await response.write(f"{prefix}data: {json.dumps(payload)}\n\n".encode())

        try:
            await _write_event(
                None,
                self._build_stream_chunk(
                    completion_id,
                    created,
                    model,
                    delta={"role": "assistant"},
                ),
            )
            await _write_event(
                "session_id",
                {
                    "id": completion_id,
                    "object": "chat.completion.session",
                    "created": created,
                    "model": model,
                    "session_id": session_id,
                },
            )

            loop = asyncio.get_event_loop()
            while True:
                try:
                    item = await loop.run_in_executor(
                        None, lambda: stream_q.get(timeout=0.5)
                    )
                except _q.Empty:
                    if agent_task.done():
                        while True:
                            try:
                                item = stream_q.get_nowait()
                            except _q.Empty:
                                item = None
                            if item is None:
                                break
                            kind, payload = item
                            if kind == "content":
                                await _write_event(
                                    None,
                                    self._build_stream_chunk(
                                        completion_id,
                                        created,
                                        model,
                                        delta={"content": payload},
                                    ),
                                )
                            elif kind == "reasoning":
                                await _write_event(
                                    "reasoning_delta",
                                    self._build_stream_chunk(
                                        completion_id,
                                        created,
                                        model,
                                        delta={"reasoning": payload},
                                        extra={"session_id": session_id},
                                    ),
                                )
                            elif kind == "tool_progress":
                                await _write_event(
                                    "tool_progress",
                                    self._build_stream_chunk(
                                        completion_id,
                                        created,
                                        model,
                                        delta={"tool_progress": payload},
                                        extra={"session_id": session_id},
                                    ),
                                )
                            elif kind == "exec_approval_requested":
                                await _write_event(
                                    "exec_approval_requested",
                                    {
                                        "command": payload.get("command", ""),
                                        "description": payload.get("description", ""),
                                        "session_id": session_id,
                                    },
                                )
                        break
                    continue

                if item is None:
                    break

                kind, payload = item
                if kind == "content":
                    await _write_event(
                        None,
                        self._build_stream_chunk(
                            completion_id,
                            created,
                            model,
                            delta={"content": payload},
                        ),
                    )
                elif kind == "reasoning":
                    await _write_event(
                        "reasoning_delta",
                        self._build_stream_chunk(
                            completion_id,
                            created,
                            model,
                            delta={"reasoning": payload},
                            extra={"session_id": session_id},
                        ),
                    )
                elif kind == "tool_progress":
                    await _write_event(
                        "tool_progress",
                        self._build_stream_chunk(
                            completion_id,
                            created,
                            model,
                            delta={"tool_progress": payload},
                            extra={"session_id": session_id},
                        ),
                    )
                elif kind == "exec_approval_requested":
                    await _write_event(
                        "exec_approval_requested",
                        {
                            "command": payload.get("command", ""),
                            "description": payload.get("description", ""),
                            "session_id": session_id,
                        },
                    )

            result = await agent_task
            usage = self._build_usage_payload(result)
            final_payload = self._extract_final_assistant_payload(result)
            final_message = final_payload["message"]
            finish_reason = final_payload["finish_reason"]

            if final_message.get("reasoning_details"):
                await _write_event(
                    "reasoning_details",
                    {
                        "id": completion_id,
                        "object": "chat.completion.reasoning_details",
                        "created": created,
                        "model": model,
                        "session_id": session_id,
                        "reasoning_details": final_message["reasoning_details"],
                    },
                )

            await _write_event(
                "usage",
                {
                    "id": completion_id,
                    "object": "chat.completion.usage",
                    "created": created,
                    "model": model,
                    "session_id": session_id,
                    "usage": usage,
                },
            )
            await _write_event(
                "final_message",
                {
                    "id": completion_id,
                    "object": "chat.completion",
                    "created": created,
                    "model": model,
                    "session_id": session_id,
                    "choices": [
                        {
                            "index": 0,
                            "message": final_message,
                            "finish_reason": finish_reason,
                        }
                    ],
                    "usage": usage,
                },
            )
            await _write_event(
                None,
                self._build_stream_chunk(
                    completion_id,
                    created,
                    model,
                    finish_reason=finish_reason,
                    usage=usage,
                    extra={"session_id": session_id},
                ),
            )
            await response.write(b"data: [DONE]\n\n")
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError):
            agent = agent_ref[0] if agent_ref else None
            if agent is not None:
                try:
                    agent.interrupt("SSE client disconnected")
                except Exception:
                    pass
            if not agent_task.done():
                agent_task.cancel()
                try:
                    await agent_task
                except (asyncio.CancelledError, Exception):
                    pass
            logger.info(
                "[api_extensions] Extended SSE client disconnected: %s", completion_id
            )
        finally:
            self._running_completions.pop(completion_id, None)

        return response

    async def _write_worker_extended_chat_completion_stream(
        self,
        request,
        *,
        profile_id: str,
        completion_id: str,
        created: int,
        model: str,
        session_id: str,
        user_message: str,
        history: List[Dict[str, str]],
        system_prompt: Optional[str],
    ):
        """Write the extended SSE stream using a profile worker."""
        headers = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Hermes-Session-Id": session_id,
            "X-Hermes-Profile": profile_id,
        }
        response = web.StreamResponse(status=200, headers=headers)
        await response.prepare(request)

        async def _write_event(
            event_name: Optional[str], payload: Dict[str, Any]
        ) -> None:
            prefix = f"event: {event_name}\n" if event_name else ""
            await response.write(f"{prefix}data: {json.dumps(payload)}\n\n".encode())

        await _write_event(
            None,
            self._build_stream_chunk(
                completion_id,
                created,
                model,
                delta={"role": "assistant"},
            ),
        )
        await _write_event(
            "session_id",
            {
                "id": completion_id,
                "object": "chat.completion.session",
                "created": created,
                "model": model,
                "session_id": session_id,
            },
        )

        final_result = None
        try:
            async for message in self._adapter._worker_stream(
                profile_id,
                {
                    "user_message": user_message,
                    "conversation_history": history,
                    "ephemeral_system_prompt": system_prompt,
                    "session_id": session_id,
                },
            ):
                if message.get("kind") == "event":
                    kind = message.get("event")
                    payload = message.get("payload")
                    if kind == "content":
                        await _write_event(
                            None,
                            self._build_stream_chunk(
                                completion_id,
                                created,
                                model,
                                delta={"content": payload},
                            ),
                        )
                    elif kind == "reasoning":
                        await _write_event(
                            "reasoning_delta",
                            self._build_stream_chunk(
                                completion_id,
                                created,
                                model,
                                delta={"reasoning": payload},
                                extra={"session_id": session_id},
                            ),
                        )
                    elif kind == "tool_progress":
                        await _write_event(
                            "tool_progress",
                            self._build_stream_chunk(
                                completion_id,
                                created,
                                model,
                                delta={"tool_progress": payload},
                                extra={"session_id": session_id},
                            ),
                        )
                    elif kind == "exec_approval_requested":
                        await _write_event(
                            "exec_approval_requested",
                            {
                                "command": payload.get("command", "")
                                if isinstance(payload, dict)
                                else "",
                                "description": payload.get("description", "")
                                if isinstance(payload, dict)
                                else "",
                                "session_id": session_id,
                            },
                        )
                    continue
                final_result = message["result"]["result"]
        except Exception as exc:
            await _write_event("error", {"error": str(exc)})
            await _write_event(
                None,
                self._build_stream_chunk(
                    completion_id, created, model, finish_reason="stop"
                ),
            )
            await response.write(b"data: [DONE]\n\n")
            return response

        usage = self._build_usage_payload(final_result or {})
        final_payload = self._extract_final_assistant_payload(final_result or {})
        final_message = final_payload["message"]
        finish_reason = final_payload["finish_reason"]
        if final_message.get("reasoning_details"):
            await _write_event(
                "reasoning_details",
                {
                    "id": completion_id,
                    "object": "chat.completion.reasoning_details",
                    "created": created,
                    "model": model,
                    "session_id": session_id,
                    "reasoning_details": final_message["reasoning_details"],
                },
            )
        await _write_event(
            "usage",
            {
                "id": completion_id,
                "object": "chat.completion.usage",
                "created": created,
                "model": model,
                "session_id": session_id,
                "usage": usage,
            },
        )
        await _write_event(
            "final_message",
            {
                "id": completion_id,
                "object": "chat.completion",
                "created": created,
                "model": model,
                "session_id": session_id,
                "choices": [
                    {
                        "index": 0,
                        "message": final_message,
                        "finish_reason": finish_reason,
                    }
                ],
                "usage": usage,
            },
        )
        await _write_event(
            None,
            self._build_stream_chunk(
                completion_id,
                created,
                model,
                finish_reason=finish_reason,
                usage=usage,
                extra={"session_id": session_id},
            ),
        )
        await response.write(b"data: [DONE]\n\n")
        return response

    # -- POST /api/v1/chat/completions ----------------------------------------

    async def handle_chat_completions_v1(self, request):
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err
        profile_id = self._profile_id(request)

        try:
            body = await request.json()
        except Exception:
            return web.json_response(
                _openai_error("Invalid JSON in request body"), status=400
            )

        messages = body.get("messages")
        if not messages or not isinstance(messages, list):
            return web.json_response(
                _openai_error("Missing or invalid 'messages' field"),
                status=400,
            )

        stream = bool(body.get("stream", False))
        system_prompt = None
        conversation_messages: List[Dict[str, str]] = []

        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role == "system":
                system_prompt = (
                    content if system_prompt is None else f"{system_prompt}\n{content}"
                )
            elif role in ("user", "assistant"):
                conversation_messages.append({"role": role, "content": content})

        user_message = ""
        history: List[Dict[str, str]] = []
        if conversation_messages:
            user_message = conversation_messages[-1].get("content", "")
            history = conversation_messages[:-1]

        if not user_message:
            return web.json_response(
                _openai_error("No user message found in messages"),
                status=400,
            )

        provided_session_id = request.headers.get("X-Hermes-Session-Id", "").strip()
        if provided_session_id:
            if not self._adapter._api_key:
                return web.json_response(
                    _openai_error(
                        "Session continuation requires API key authentication. "
                        "Configure API_SERVER_KEY to enable this feature."
                    ),
                    status=403,
                )
            if re.search(r"[\r\n\x00]", provided_session_id):
                return web.json_response(
                    _openai_error("Invalid session ID"), status=400
                )
            session_id = provided_session_id
            try:
                if self._use_host_profile(request):
                    db = self._adapter._ensure_session_db()
                    if db is not None:
                        history = db.get_messages_as_conversation(session_id)
                else:
                    history = await self._profile_call(
                        request,
                        "get_session_history",
                        {"session_id": session_id},
                    )
            except Exception as exc:
                logger.warning(
                    "[api_extensions] Failed to load session history for %s: %s",
                    session_id,
                    exc,
                )
                history = []
        else:
            first_user = ""
            for cm in conversation_messages:
                if cm.get("role") == "user":
                    first_user = cm.get("content", "")
                    break
            session_id = self._derive_chat_session_id(system_prompt, first_user)

        completion_id = f"chatcmpl-{uuid.uuid4().hex[:29]}"
        model_name = body.get("model", self._adapter._advertised_model_name(profile_id))
        created = int(time.time())

        if stream:
            if not self._use_host_profile(request):
                return await self._write_worker_extended_chat_completion_stream(
                    request,
                    profile_id=profile_id,
                    completion_id=completion_id,
                    created=created,
                    model=model_name,
                    session_id=session_id,
                    user_message=user_message,
                    history=history,
                    system_prompt=system_prompt,
                )
            import queue as _q

            stream_q: _q.Queue = _q.Queue()

            def _on_content_delta(delta: Optional[str]) -> None:
                if delta is not None:
                    stream_q.put(("content", delta))

            def _on_reasoning_delta(delta: Optional[str]) -> None:
                if delta:
                    stream_q.put(("reasoning", delta))

            def _on_tool_progress(event_type, name, preview, args, **kwargs) -> None:
                if event_type != "tool.started" or not name or name.startswith("_"):
                    return
                try:
                    from agent.display import get_tool_emoji

                    emoji = get_tool_emoji(name)
                except Exception:
                    emoji = ""
                stream_q.put((
                    "tool_progress",
                    {
                        "tool": name,
                        "emoji": emoji,
                        "label": preview or name,
                    },
                ))

            agent_ref = [None]
            agent_task = asyncio.ensure_future(
                self._run_chat_completion(
                    user_message=user_message,
                    history=history,
                    system_prompt=system_prompt,
                    session_id=session_id,
                    stream_delta_callback=_on_content_delta,
                    reasoning_callback=_on_reasoning_delta,
                    tool_progress_callback=_on_tool_progress,
                    agent_ref=agent_ref,
                    approval_stream_q=stream_q,
                )
            )
            return await self._write_extended_chat_completion_stream(
                request,
                completion_id=completion_id,
                created=created,
                model=model_name,
                session_id=session_id,
                stream_q=stream_q,
                agent_task=agent_task,
                agent_ref=agent_ref,
            )

        try:
            if self._use_host_profile(request):
                result = await self._run_chat_completion(
                    user_message=user_message,
                    history=history,
                    system_prompt=system_prompt,
                    session_id=session_id,
                )
            else:
                payload = await self._profile_call(
                    request,
                    "run_agent",
                    {
                        "user_message": user_message,
                        "conversation_history": history,
                        "ephemeral_system_prompt": system_prompt,
                        "session_id": session_id,
                    },
                )
                result = payload["result"]
        except Exception as exc:
            logger.exception("[api_extensions] Error running extended chat completion")
            return web.json_response(
                _openai_error(f"Internal server error: {exc}", err_type="server_error"),
                status=500,
            )

        usage = self._build_usage_payload(result)
        final_payload = self._extract_final_assistant_payload(result)
        response_data = {
            "id": completion_id,
            "object": "chat.completion",
            "created": created,
            "model": model_name,
            "session_id": session_id,
            "choices": [
                {
                    "index": 0,
                    "message": final_payload["message"],
                    "finish_reason": final_payload["finish_reason"],
                }
            ],
            "usage": usage,
        }
        return web.json_response(
            response_data,
            headers={"X-Hermes-Session-Id": session_id, "X-Hermes-Profile": profile_id},
        )

    # -- POST /api/v1/chat/completions/{completion_id}/cancel -----------------

    async def handle_cancel_completion(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        completion_id = request.match_info.get("completion_id", "")
        entry = self._running_completions.pop(completion_id, None)
        if entry is None:
            return web.json_response({"status": "not_found"}, status=404)

        agent = entry.get("agent_ref", [None])[0]
        agent_task = entry.get("agent_task")

        if agent is not None:
            try:
                agent.interrupt("Cancelled by user")
            except Exception:
                pass

        if agent_task is not None and not agent_task.done():
            agent_task.cancel()
            try:
                await agent_task
            except (asyncio.CancelledError, Exception):
                pass

        logger.info(
            "[api_extensions] Completion cancelled by client: %s", completion_id
        )
        return web.json_response({"status": "cancelled"})

    # -- POST /api/approval/resolve -------------------------------------------

    async def handle_approval_resolve(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        try:
            body = await request.json()
        except Exception:
            return web.json_response(_openai_error("Invalid JSON body"), status=400)

        session_id = body.get("session_id", "")
        decision = body.get("decision", "")
        if not session_id or decision not in ("allow-once", "allow-always", "deny"):
            return web.json_response(
                _openai_error(
                    "session_id and decision (allow-once|allow-always|deny) required"
                ),
                status=400,
            )

        decision_map = {
            "allow-once": "once",
            "allow-always": "always",
            "deny": "deny",
        }
        choice = decision_map[decision]

        if self._use_host_profile(request):
            from tools.approval import resolve_gateway_approval

            count = resolve_gateway_approval(session_id, choice)
        else:
            try:
                profile_id = self._profile_id(request)
                payload = await self._adapter._worker_call_unlocked(
                    profile_id,
                    "resolve_approval",
                    {"session_id": session_id, "choice": choice},
                )
                count = payload.get("resolved", 0)
            except Exception as exc:
                logger.warning(
                    "[api_extensions] Worker approval resolve failed: %s", exc
                )
                count = 0

        logger.info(
            "[api_extensions] Approval resolved: session=%s decision=%s resolved=%d",
            session_id,
            choice,
            count,
        )
        return web.json_response({"status": "resolved", "resolved": count})

    # -- GET /api/capabilities ------------------------------------------------

    async def handle_capabilities(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        capabilities = {
            "config": True,
            "models": True,
            "skills": True,
            "memory": True,
            "mcp": True,
            "modelSwitch": True,
            "chat": True,
            "streaming": True,
            "jobs": True,
            "providers": True,
        }

        return web.json_response({
            "version": _get_version(),
            "platform": "hermes-agent",
            "capabilities": capabilities,
        })

    async def handle_profiles(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        client_id = self._adapter._extract_client_id(request)
        profiles = self._adapter._profile_registry.list_profiles()
        running_profiles = {self._adapter._host_profile_id}
        for entry in self._adapter._profile_runtime_manager.status():
            if entry.get("running") and entry.get("profile"):
                running_profiles.add(str(entry["profile"]))
        merged_profiles = []
        for profile in profiles:
            item = dict(profile)
            item["gatewayRunning"] = (
                bool(item.get("gatewayRunning")) or item.get("id") in running_profiles
            )
            merged_profiles.append(item)
        return web.json_response(
            {
                "profiles": merged_profiles,
                "selectedProfile": self._adapter._selected_profiles.get(client_id)
                if client_id
                else None,
                "hostProfile": self._adapter._host_profile_id,
            },
            headers=self._profile_headers(request),
        )

    async def handle_create_profile(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

        name = str(body.get("name", "")).strip()
        clone_from = body.get("cloneFrom")
        clone_all = bool(body.get("cloneAll", False))
        clone_config = bool(body.get("cloneConfig", False))
        if not name:
            return web.json_response(
                {"ok": False, "error": "name is required"}, status=400
            )

        try:
            created = self._adapter._profile_registry.create_profile(
                name=name,
                clone_from=str(clone_from).strip() if clone_from else None,
                clone_all=clone_all,
                clone_config=clone_config,
            )
            return web.json_response(
                {"ok": True, "profile": created}, headers=self._profile_headers(request)
            )
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=400)

    async def handle_select_profile(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

        client_id = str(
            body.get("clientId") or self._adapter._extract_client_id(request)
        ).strip()
        profile_id = str(body.get("profile", "")).strip()
        if not client_id:
            return web.json_response(
                {"ok": False, "error": "clientId is required"}, status=400
            )
        if not profile_id:
            return web.json_response(
                {"ok": False, "error": "profile is required"}, status=400
            )

        try:
            self._adapter._resolve_profile_home(profile_id)
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=404)

        self._adapter._set_selected_profile(client_id, profile_id)
        return web.json_response(
            {
                "ok": True,
                "clientId": client_id,
                "selectedProfile": profile_id,
            },
            headers={"X-Hermes-Profile": profile_id},
        )

    async def handle_profile_runtimes(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        runtimes = [
            {
                "profile": self._adapter._host_profile_id,
                "home": str(_get_hermes_home()),
                "running": True,
                "pid": os.getpid(),
                "pendingRequests": 0,
                "mode": "host",
            }
        ]
        for entry in self._adapter._profile_runtime_manager.status():
            entry = dict(entry)
            entry["mode"] = "worker"
            runtimes.append(entry)
        return web.json_response(
            {"runtimes": runtimes, "total": len(runtimes)},
            headers=self._profile_headers(request),
        )

    # -- GET /api/config ------------------------------------------------------

    async def handle_get_config(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err
        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(request, "get_config")
                return web.json_response(
                    payload, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception("[api_extensions] Error reading config from worker")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        try:
            from hermes_cli.config import load_config, load_env, OPTIONAL_ENV_VARS
            from hermes_cli.auth import PROVIDER_REGISTRY

            config = load_config()
            env = load_env()
            hermes_home = _get_hermes_home()

            active_model, active_provider = _extract_active_model(config)

            # Canonical provider env key set: union of
            #   1. api_key_env_vars across auth.PROVIDER_REGISTRY (runtime source of
            #      truth — covers ANTHROPIC/XAI/COPILOT/KILOCODE/AI_GATEWAY and
            #      others not declared in OPTIONAL_ENV_VARS).
            #   2. OPTIONAL_ENV_VARS entries tagged as provider passwords
            #      (preserves any provider keys declared only in the UX catalog).
            provider_keys: list[str] = []
            for pconfig in PROVIDER_REGISTRY.values():
                if getattr(pconfig, "auth_type", None) != "api_key":
                    continue
                for name in getattr(pconfig, "api_key_env_vars", ()) or ():
                    if name and name not in provider_keys:
                        provider_keys.append(name)
            for k, v in OPTIONAL_ENV_VARS.items():
                if (
                    v.get("category") == "provider"
                    and v.get("password")
                    and k not in provider_keys
                ):
                    provider_keys.append(k)

            providers_status = []
            for key in provider_keys:
                val = env.get(key) or os.environ.get(key, "")
                if val:
                    providers_status.append({
                        "envVar": key,
                        "configured": True,
                        "maskedKey": _mask_key(val),
                    })

            return web.json_response(
                {
                    "config": config,
                    "activeModel": active_model,
                    "activeProvider": active_provider,
                    "hermesHome": str(hermes_home),
                    "hasApiKeys": len(providers_status) > 0,
                    "providers": providers_status,
                },
                headers=self._profile_headers(request),
            )
        except Exception as e:
            logger.exception("[api_extensions] Error reading config")
            return web.json_response(
                {"ok": False, "error": str(e)},
                status=500,
            )

    # -- PATCH /api/config ----------------------------------------------------

    async def handle_patch_config(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        try:
            body = await request.json()
        except Exception:
            return web.json_response(
                {"ok": False, "error": "Invalid JSON"},
                status=400,
            )
        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(request, "patch_config", body)
                return web.json_response(
                    payload, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception("[api_extensions] Error saving config via worker")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        try:
            from hermes_cli.config import load_config, save_config, save_env_value

            if "config" in body and isinstance(body["config"], dict):
                current = load_config()
                _deep_merge(current, body["config"])
                save_config(current)

            if "env" in body and isinstance(body["env"], dict):
                for key, value in body["env"].items():
                    if isinstance(key, str) and isinstance(value, str):
                        save_env_value(key, value)

            return web.json_response(
                {
                    "ok": True,
                    "message": "Config updated",
                    "restartRequired": False,
                },
                headers=self._profile_headers(request),
            )
        except Exception as e:
            logger.exception("[api_extensions] Error saving config")
            return web.json_response(
                {"ok": False, "error": str(e)},
                status=500,
            )

    # -- GET /api/providers ---------------------------------------------------

    async def handle_providers(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err
        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(request, "list_providers")
                return web.json_response(
                    payload, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception("[api_extensions] Error listing providers via worker")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        try:
            from hermes_cli.config import load_config
            from hermes_cli.model_switch import list_authenticated_providers

            config = load_config()
            active_model, active_provider = _extract_active_model(config)

            user_providers = config.get("providers") or {}
            custom_providers = config.get("custom_providers")

            providers = list_authenticated_providers(
                current_provider=active_provider,
                user_providers=user_providers
                if isinstance(user_providers, dict)
                else {},
                custom_providers=custom_providers
                if isinstance(custom_providers, list)
                else None,
            )

            return web.json_response(
                {
                    "providers": providers,
                    "currentProvider": active_provider,
                    "currentModel": active_model,
                },
                headers=self._profile_headers(request),
            )
        except Exception as e:
            logger.exception("[api_extensions] Error listing providers")
            return web.json_response(
                {"ok": False, "error": str(e)},
                status=500,
            )

    # -- POST /api/model-switch -----------------------------------------------

    async def handle_model_switch(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        try:
            body = await request.json()
        except Exception:
            return web.json_response(
                {"ok": False, "error": "Invalid JSON"},
                status=400,
            )

        model_query = body.get("model", "").strip()
        explicit_provider = body.get("provider", "").strip()
        is_global = body.get("global", False)

        if not model_query and not explicit_provider:
            return web.json_response(
                {"ok": False, "error": "Provide 'model' and/or 'provider'"},
                status=400,
            )
        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(request, "switch_model", body)
                status = int(payload.pop("status", 200))
                return web.json_response(
                    payload, status=status, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception("[api_extensions] Error switching model via worker")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        try:
            from hermes_cli.config import load_config
            from hermes_cli.model_switch import switch_model

            config = load_config()
            active_model, active_provider = _extract_active_model(config)

            result = switch_model(
                raw_input=model_query,
                current_provider=active_provider,
                current_model=active_model,
                is_global=is_global,
                explicit_provider=explicit_provider,
                user_providers=config.get("providers") or {},
                custom_providers=config.get("custom_providers"),
            )

            if result.success:
                self._adapter._model_name = result.new_model
                return web.json_response(
                    {
                        "ok": True,
                        "model": result.new_model,
                        "provider": result.target_provider,
                        "providerLabel": result.provider_label,
                        "baseUrl": result.base_url or "",
                        "hasCredentials": bool(result.api_key),
                        "warning": result.warning_message or None,
                        "resolvedViaAlias": result.resolved_via_alias or None,
                        "isGlobal": result.is_global,
                    },
                    headers=self._profile_headers(request),
                )
            else:
                return web.json_response(
                    {
                        "ok": False,
                        "error": result.error_message,
                    },
                    status=422,
                    headers=self._profile_headers(request),
                )
        except Exception as e:
            logger.exception("[api_extensions] Error switching model")
            return web.json_response(
                {"ok": False, "error": str(e)},
                status=500,
            )

    # -- GET /api/provider-models ---------------------------------------------

    async def handle_provider_models(self, request: "web.Request") -> "web.Response":
        """Return the curated model catalog for a specific provider."""
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        provider = request.query.get("provider", "").strip()
        if not provider:
            return web.json_response(
                {"ok": False, "error": "Query parameter 'provider' is required"},
                status=400,
            )

        try:
            from hermes_cli.models import curated_models_for_provider, provider_label

            models = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: curated_models_for_provider(provider),
            )

            return web.json_response({
                "ok": True,
                "provider": provider,
                "providerLabel": provider_label(provider),
                "models": [{"id": mid, "description": desc} for mid, desc in models],
            })
        except Exception as e:
            logger.exception("[api_extensions] Error fetching provider models")
            return web.json_response(
                {"ok": False, "error": str(e), "models": []},
                status=500,
            )

    # -- GET /api/skills ------------------------------------------------------

    async def handle_skills(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err
        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(request, "list_skills")
                return web.json_response(
                    payload, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception("[api_extensions] Error listing skills via worker")
                return web.json_response(
                    {"ok": False, "error": str(e), "skills": []}, status=500
                )

        try:
            skills = _list_skills_enriched()
            return web.json_response(
                {"skills": skills, "total": len(skills)},
                headers=self._profile_headers(request),
            )
        except Exception as e:
            logger.exception("[api_extensions] Error listing skills")
            return web.json_response(
                {"ok": False, "error": str(e), "skills": []},
                status=500,
            )

    # -- GET /api/skills/{name} -----------------------------------------------

    async def handle_skill_detail(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err
        name = request.match_info.get("name", "")
        if not name:
            return web.json_response(
                {"ok": False, "error": "Skill name required"}, status=400
            )

        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(
                    request, "view_skill", {"name": name}
                )
                return web.json_response(
                    payload, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception("[api_extensions] Error viewing skill via worker")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        try:
            import json as _json
            from tools.skills_tool import skill_view

            raw = skill_view(name)
            payload = _json.loads(raw)
            return web.json_response(payload, headers=self._profile_headers(request))
        except Exception as e:
            logger.exception("[api_extensions] Error viewing skill")
            return web.json_response({"ok": False, "error": str(e)}, status=500)

    # -- POST /api/skills/toggle ----------------------------------------------

    async def handle_skills_toggle(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

        name = (body.get("name") or "").strip()
        if not name:
            return web.json_response(
                {"ok": False, "error": "name required"}, status=400
            )
        enabled = body.get("enabled")
        if not isinstance(enabled, bool):
            return web.json_response(
                {"ok": False, "error": "enabled (boolean) required"}, status=400
            )

        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(request, "toggle_skill", body)
                return web.json_response(
                    payload, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception("[api_extensions] Error toggling skill via worker")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        try:
            _toggle_skill(name, enabled)
            return web.json_response(
                {"ok": True}, headers=self._profile_headers(request)
            )
        except Exception as e:
            logger.exception("[api_extensions] Error toggling skill")
            return web.json_response({"ok": False, "error": str(e)}, status=500)

    # -- POST /api/skills/install ---------------------------------------------

    async def handle_skills_install(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

        identifier = (body.get("identifier") or "").strip()
        if not identifier:
            return web.json_response(
                {"ok": False, "error": "identifier required"}, status=400
            )

        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(request, "install_skill", body)
                return web.json_response(
                    payload, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception("[api_extensions] Error installing skill via worker")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None, _install_skill, identifier
            )
            return web.json_response(result, headers=self._profile_headers(request))
        except Exception as e:
            logger.exception("[api_extensions] Error installing skill")
            return web.json_response({"ok": False, "error": str(e)}, status=500)

    # -- POST /api/skills/uninstall -------------------------------------------

    async def handle_skills_uninstall(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

        name = (body.get("name") or "").strip()
        if not name:
            return web.json_response(
                {"ok": False, "error": "name required"}, status=400
            )

        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(request, "uninstall_skill", body)
                return web.json_response(
                    payload, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception("[api_extensions] Error uninstalling skill via worker")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        try:
            result = _uninstall_skill(name)
            return web.json_response(result, headers=self._profile_headers(request))
        except Exception as e:
            logger.exception("[api_extensions] Error uninstalling skill")
            return web.json_response({"ok": False, "error": str(e)}, status=500)

    # -- POST /api/skills/update -----------------------------------------------

    async def handle_skills_update(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

        name = (body.get("name") or "").strip()
        if not name:
            return web.json_response(
                {"ok": False, "error": "name required"}, status=400
            )
        content = body.get("content")
        if not isinstance(content, str) or not content.strip():
            return web.json_response(
                {"ok": False, "error": "content (string) required"}, status=400
            )

        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(request, "update_skill", body)
                return web.json_response(
                    payload, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception("[api_extensions] Error updating skill via worker")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        try:
            result = _update_skill(name, content)
            return web.json_response(result, headers=self._profile_headers(request))
        except Exception as e:
            logger.exception("[api_extensions] Error updating skill")
            return web.json_response({"ok": False, "error": str(e)}, status=500)

    # -- GET /api/skills/hub-search -------------------------------------------

    async def handle_skills_hub_search(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        query = request.query.get("q", "").strip()
        limit = min(100, max(1, int(request.query.get("limit", "30"))))
        offset = max(0, int(request.query.get("offset", "0")))

        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(
                    request,
                    "search_hub",
                    {"q": query, "limit": limit, "offset": offset},
                )
                return web.json_response(
                    payload, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception("[api_extensions] Error searching hub via worker")
                return web.json_response(
                    {"ok": False, "error": str(e), "results": []}, status=500
                )

        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None, _search_hub, query, limit, offset
            )
            return web.json_response(result, headers=self._profile_headers(request))
        except Exception as e:
            logger.exception("[api_extensions] Error searching hub")
            return web.json_response(
                {"ok": False, "error": str(e), "results": []}, status=500
            )

    # -- GET /api/memory ------------------------------------------------------

    async def handle_memory(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err
        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(request, "list_memory")
                return web.json_response(
                    payload, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception("[api_extensions] Error listing memory via worker")
                return web.json_response(
                    {"ok": False, "error": str(e), "files": []}, status=500
                )

        try:
            memory_dir = _get_hermes_home() / "memory"
            files: List[Dict[str, Any]] = []

            if memory_dir.exists() and memory_dir.is_dir():
                for f in sorted(memory_dir.iterdir()):
                    if f.is_file() and not f.name.startswith("."):
                        stat = f.stat()
                        files.append({
                            "name": f.name,
                            "path": f.name,
                            "size": stat.st_size,
                            "modified": stat.st_mtime,
                        })

            return web.json_response(
                {"files": files, "total": len(files)},
                headers=self._profile_headers(request),
            )
        except Exception as e:
            logger.exception("[api_extensions] Error listing memory")
            return web.json_response(
                {"ok": False, "error": str(e), "files": []},
                status=500,
            )

    # -- GET /api/mcp/servers -------------------------------------------------

    async def handle_mcp_servers(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err
        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(request, "list_mcp_servers")
                return web.json_response(
                    payload, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception(
                    "[api_extensions] Error listing MCP servers via worker"
                )
                return web.json_response(
                    {"ok": False, "error": str(e), "servers": []}, status=500
                )

        try:
            from hermes_cli.config import load_config

            config = load_config()
            raw_servers = config.get("mcp_servers", {})

            servers: List[Dict[str, Any]] = []
            if isinstance(raw_servers, dict):
                for name, entry in raw_servers.items():
                    if not isinstance(entry, dict):
                        continue
                    url = entry.get("url")
                    transport = "http" if url else "stdio"
                    server: Dict[str, Any] = {
                        "name": name,
                        "transport": transport,
                    }
                    if transport == "stdio":
                        server["command"] = entry.get("command", "")
                        if "args" in entry:
                            server["args"] = entry["args"]
                        if "env" in entry:
                            server["env"] = entry["env"]
                    else:
                        server["url"] = url
                        if "headers" in entry:
                            server["headers"] = entry["headers"]
                    if "timeout" in entry:
                        server["timeout"] = entry["timeout"]
                    if "connect_timeout" in entry:
                        server["connectTimeout"] = entry["connect_timeout"]
                    servers.append(server)

            return web.json_response(
                {"servers": servers, "total": len(servers)},
                headers=self._profile_headers(request),
            )
        except Exception as e:
            logger.exception("[api_extensions] Error listing MCP servers")
            return web.json_response(
                {"ok": False, "error": str(e), "servers": []},
                status=500,
            )

    # -- POST /api/oauth/device-code ------------------------------------------

    async def handle_oauth_device_code(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        try:
            body = await request.json()
        except Exception:
            return web.json_response(
                {"ok": False, "error": "Invalid JSON"},
                status=400,
            )

        provider = body.get("provider", "").strip()
        if provider not in ("nous", "openai-codex"):
            return web.json_response(
                {"ok": False, "error": "provider must be 'nous' or 'openai-codex'"},
                status=400,
            )
        if not self._use_host_profile(request):
            try:
                result = await self._profile_call(
                    request, "oauth_device_code", {"provider": provider}
                )
                return web.json_response(result, headers=self._profile_headers(request))
            except Exception as e:
                logger.exception("[api_extensions] OAuth device-code error via worker")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                _oauth_request_device_code,
                provider,
            )
            return web.json_response(result)
        except Exception as e:
            logger.exception("[api_extensions] OAuth device-code error")
            return web.json_response(
                {"ok": False, "error": str(e)},
                status=500,
            )

    # -- GET /api/sessions ----------------------------------------------------

    async def handle_list_sessions(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err
        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(
                    request,
                    "list_sessions",
                    {
                        "limit": int(request.query.get("limit", "50")),
                        "offset": int(request.query.get("offset", "0")),
                    },
                )
                return web.json_response(
                    payload, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception("[api_extensions] Error listing sessions via worker")
                return web.json_response(
                    {"ok": False, "error": str(e), "sessions": []}, status=500
                )

        try:
            db = self._adapter._ensure_session_db()
            if db is None:
                return web.json_response(
                    {"sessions": [], "total": 0, "error": "SessionDB unavailable"},
                )

            limit = int(request.query.get("limit", "50"))
            offset = int(request.query.get("offset", "0"))
            sessions = db.list_sessions_rich(limit=limit, offset=offset)

            result = []
            for s in sessions:
                result.append({
                    "key": s.get("id", ""),
                    "kind": "chat",
                    "label": s.get("title") or None,
                    "derivedTitle": s.get("title") or s.get("preview") or None,
                    "lastMessagePreview": s.get("preview") or None,
                    "updatedAt": s.get("last_active") or s.get("started_at"),
                    "messageCount": s.get("message_count", 0),
                    "model": s.get("model") or None,
                })

            return web.json_response(
                {"sessions": result, "total": len(result)},
                headers=self._profile_headers(request),
            )
        except Exception as e:
            logger.exception("[api_extensions] Error listing sessions")
            return web.json_response(
                {"ok": False, "error": str(e), "sessions": []},
                status=500,
            )

    # -- GET /api/sessions/{session_id}/messages ------------------------------

    async def handle_session_messages(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        session_id = request.match_info["session_id"]
        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(
                    request, "get_session_messages", {"session_id": session_id}
                )
                return web.json_response(
                    payload, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception(
                    "[api_extensions] Error fetching session messages via worker"
                )
                return web.json_response(
                    {"ok": False, "error": str(e), "messages": []}, status=500
                )
        try:
            db = self._adapter._ensure_session_db()
            if db is None:
                return web.json_response(
                    {"messages": [], "error": "SessionDB unavailable"},
                )

            messages = db.get_messages(session_id)
            return web.json_response(
                {
                    "sessionKey": session_id,
                    "messages": messages,
                },
                headers=self._profile_headers(request),
            )
        except Exception as e:
            logger.exception("[api_extensions] Error fetching session messages")
            return web.json_response(
                {"ok": False, "error": str(e), "messages": []},
                status=500,
            )

    # -- DELETE /api/sessions/{session_id} ------------------------------------

    async def handle_delete_session(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        session_id = request.match_info["session_id"]
        if not self._use_host_profile(request):
            try:
                payload = await self._profile_call(
                    request, "delete_session", {"session_id": session_id}
                )
                if not payload.get("ok"):
                    return web.json_response(
                        {"ok": False, "error": "Session not found"},
                        status=404,
                        headers=self._profile_headers(request),
                    )
                return web.json_response(
                    {"ok": True}, headers=self._profile_headers(request)
                )
            except Exception as e:
                logger.exception("[api_extensions] Error deleting session via worker")
                return web.json_response({"ok": False, "error": str(e)}, status=500)
        try:
            db = self._adapter._ensure_session_db()
            if db is None:
                return web.json_response(
                    {"ok": False, "error": "SessionDB unavailable"},
                    status=500,
                )

            deleted = db.delete_session(session_id)
            if not deleted:
                return web.json_response(
                    {"ok": False, "error": "Session not found"},
                    status=404,
                )

            return web.json_response(
                {"ok": True}, headers=self._profile_headers(request)
            )
        except Exception as e:
            logger.exception("[api_extensions] Error deleting session")
            return web.json_response(
                {"ok": False, "error": str(e)},
                status=500,
            )

    # -- POST /api/oauth/poll-token -------------------------------------------

    async def handle_oauth_poll_token(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        try:
            body = await request.json()
        except Exception:
            return web.json_response(
                {"ok": False, "error": "Invalid JSON"},
                status=400,
            )

        provider = body.get("provider", "").strip()
        device_code = body.get("deviceCode", "").strip()
        if provider not in ("nous", "openai-codex"):
            return web.json_response(
                {"ok": False, "error": "provider must be 'nous' or 'openai-codex'"},
                status=400,
            )
        if not device_code:
            return web.json_response(
                {"ok": False, "error": "deviceCode is required"},
                status=400,
            )

        extra = {k: v for k, v in body.items() if k not in ("provider", "deviceCode")}
        if not self._use_host_profile(request):
            try:
                result = await self._profile_call(
                    request,
                    "oauth_poll_token",
                    {"provider": provider, "device_code": device_code, "extra": extra},
                )
                return web.json_response(result, headers=self._profile_headers(request))
            except Exception as e:
                logger.exception("[api_extensions] OAuth poll-token error via worker")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                _oauth_poll_token,
                provider,
                device_code,
                extra,
            )
            return web.json_response(result)
        except Exception as e:
            logger.exception("[api_extensions] OAuth poll-token error")
            return web.json_response(
                {"ok": False, "error": str(e)},
                status=500,
            )

    # ------------------------------------------------------------------
    # Logs
    # ------------------------------------------------------------------

    async def handle_get_logs(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        file_name = request.query.get("file", "agent")
        lines_count = min(int(request.query.get("lines", "100")), 500)
        level = request.query.get("level")
        component = request.query.get("component")

        def _read():
            from hermes_cli.logs import _read_tail, LOG_FILES
            from hermes_logging import COMPONENT_PREFIXES

            log_name = LOG_FILES.get(file_name)
            if not log_name:
                return None
            log_path = _get_hermes_home() / "logs" / log_name
            if not log_path.exists():
                return []

            has_filters = bool(level or component)
            min_level = level if level and level != "ALL" else None
            comp_prefixes = None
            if component and component != "all":
                comp_prefixes = COMPONENT_PREFIXES.get(component)

            return _read_tail(
                log_path,
                lines_count,
                has_filters=has_filters,
                min_level=min_level,
                component_prefixes=comp_prefixes,
            )

        try:
            result = await asyncio.get_event_loop().run_in_executor(None, _read)
        except Exception as e:
            logger.exception("[api_extensions] logs read error")
            return web.json_response(
                {"file": file_name, "lines": [], "error": str(e)}, status=500
            )

        if result is None:
            return web.json_response(
                {"error": f"Unknown log file: {file_name}"}, status=400
            )

        return web.json_response({"file": file_name, "lines": result})

    # -- GET /api/messengers --------------------------------------------------

    _MESSENGER_REGISTRY: List[Dict[str, Any]] = [
        {
            "id": "telegram",
            "name": "Telegram",
            "description": "Connect a Telegram bot to receive and send messages",
            "pip_extra": "messaging",
            "import_check": "telegram",
            "required_env": ["TELEGRAM_BOT_TOKEN"],
            "optional_env": [
                "TELEGRAM_ALLOWED_USERS",
                "TELEGRAM_REQUIRE_MENTION",
                "TELEGRAM_HOME_CHANNEL",
            ],
        },
        {
            "id": "discord",
            "name": "Discord",
            "description": "Connect a Discord bot to interact with your server",
            "pip_extra": "messaging",
            "import_check": "discord",
            "required_env": ["DISCORD_BOT_TOKEN"],
            "optional_env": [
                "DISCORD_ALLOWED_USERS",
                "DISCORD_REQUIRE_MENTION",
                "DISCORD_ALLOWED_CHANNELS",
                "DISCORD_HOME_CHANNEL",
            ],
        },
        {
            "id": "slack",
            "name": "Slack",
            "description": "Connect a Slack workspace via Socket Mode",
            "pip_extra": "slack",
            "import_check": "slack_bolt",
            "required_env": ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"],
            "optional_env": [
                "SLACK_REQUIRE_MENTION",
                "SLACK_FREE_RESPONSE_CHANNELS",
                "SLACK_HOME_CHANNEL",
            ],
        },
        {
            "id": "signal",
            "name": "Signal",
            "description": "Connect Signal via signal-cli for private messaging",
            "pip_extra": None,
            "import_check": None,
            "required_env": ["SIGNAL_HTTP_URL", "SIGNAL_ACCOUNT"],
            "optional_env": ["SIGNAL_HOME_CHANNEL"],
            "external_dep": "signal-cli HTTP daemon",
        },
        {
            "id": "whatsapp",
            "name": "WhatsApp",
            "description": "Connect WhatsApp via a Node.js bridge",
            "pip_extra": None,
            "import_check": None,
            "required_env": ["WHATSAPP_ENABLED"],
            "optional_env": [
                "WHATSAPP_MODE",
                "WHATSAPP_REQUIRE_MENTION",
            ],
            "external_dep": "Node.js bridge",
        },
        {
            "id": "matrix",
            "name": "Matrix",
            "description": "Connect to a Matrix homeserver for decentralized messaging",
            "pip_extra": "matrix",
            "import_check": "mautrix",
            "required_env": ["MATRIX_HOMESERVER"],
            "optional_env": [
                "MATRIX_ACCESS_TOKEN",
                "MATRIX_PASSWORD",
                "MATRIX_USER_ID",
                "MATRIX_ENCRYPTION",
            ],
        },
        {
            "id": "email",
            "name": "Email",
            "description": "Connect email via IMAP/SMTP",
            "pip_extra": None,
            "import_check": None,
            "required_env": [
                "EMAIL_ADDRESS",
                "EMAIL_PASSWORD",
                "EMAIL_IMAP_HOST",
                "EMAIL_SMTP_HOST",
            ],
            "optional_env": ["EMAIL_IMAP_PORT", "EMAIL_SMTP_PORT"],
        },
        {
            "id": "homeassistant",
            "name": "Home Assistant",
            "description": "Connect to Home Assistant for smart home automation",
            "pip_extra": "homeassistant",
            "import_check": "aiohttp",
            "required_env": ["HASS_TOKEN"],
            "optional_env": ["HASS_URL"],
        },
        {
            "id": "sms",
            "name": "SMS (Twilio)",
            "description": "Send and receive SMS via Twilio",
            "pip_extra": "sms",
            "import_check": "aiohttp",
            "required_env": [
                "TWILIO_ACCOUNT_SID",
                "TWILIO_AUTH_TOKEN",
                "TWILIO_PHONE_NUMBER",
            ],
            "optional_env": ["SMS_WEBHOOK_URL", "SMS_WEBHOOK_PORT"],
        },
        {
            "id": "dingtalk",
            "name": "DingTalk",
            "description": "Connect a DingTalk chatbot via Stream Mode",
            "pip_extra": "dingtalk",
            "import_check": "dingtalk_stream",
            "required_env": ["DINGTALK_CLIENT_ID", "DINGTALK_CLIENT_SECRET"],
            "optional_env": [],
        },
        {
            "id": "feishu",
            "name": "Feishu / Lark",
            "description": "Connect a Feishu or Lark bot",
            "pip_extra": "feishu",
            "import_check": "lark_oapi",
            "required_env": ["FEISHU_APP_ID", "FEISHU_APP_SECRET"],
            "optional_env": ["FEISHU_VERIFICATION_TOKEN"],
        },
        {
            "id": "mattermost",
            "name": "Mattermost",
            "description": "Connect to a Mattermost server",
            "pip_extra": None,
            "import_check": "aiohttp",
            "required_env": ["MATTERMOST_TOKEN", "MATTERMOST_URL"],
            "optional_env": [],
        },
        {
            "id": "bluebubbles",
            "name": "BlueBubbles (iMessage)",
            "description": "Connect iMessage via BlueBubbles on macOS",
            "pip_extra": None,
            "import_check": "aiohttp",
            "required_env": ["BLUEBUBBLES_SERVER_URL", "BLUEBUBBLES_PASSWORD"],
            "optional_env": [],
        },
    ]

    async def handle_get_messengers(self, request: "web.Request") -> "web.Response":
        """Return status for every supported messenger platform."""
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        def _build_status() -> List[Dict[str, Any]]:
            from hermes_cli.config import load_env

            env = load_env()
            merged_env = {**os.environ, **env}
            logger.debug(
                "[api_extensions] messengers env keys: %s",
                [
                    k
                    for k in merged_env
                    if "TELEGRAM" in k or "DISCORD" in k or "SLACK" in k
                ],
            )

            running_platforms: set = set()
            try:
                from gateway.status import read_runtime_status

                rt = read_runtime_status() or {}
                for plat_id, info in (rt.get("platforms") or {}).items():
                    if isinstance(info, dict) and info.get("state") == "connected":
                        running_platforms.add(plat_id)
            except Exception:
                pass

            results = []
            for entry in self._MESSENGER_REGISTRY:
                import_mod = entry.get("import_check")
                deps_installed = True
                if import_mod:
                    try:
                        __import__(import_mod)
                    except ImportError:
                        deps_installed = False

                required = entry.get("required_env", [])
                configured = all(bool(merged_env.get(k, "").strip()) for k in required)

                results.append({
                    "id": entry["id"],
                    "name": entry["name"],
                    "description": entry["description"],
                    "depsInstalled": deps_installed,
                    "configured": configured,
                    "running": entry["id"] in running_platforms,
                    "pipExtra": entry.get("pip_extra"),
                    "requiredEnv": required,
                    "optionalEnv": entry.get("optional_env", []),
                    "externalDep": entry.get("external_dep"),
                })
            return results

        try:
            result = await asyncio.get_event_loop().run_in_executor(None, _build_status)
            return web.json_response({"platforms": result})
        except Exception as e:
            logger.exception("[api_extensions] Error reading messenger status")
            return web.json_response({"ok": False, "error": str(e)}, status=500)

    # -- POST /api/messengers/install -----------------------------------------

    async def handle_messengers_install(self, request: "web.Request") -> "web.Response":
        """Install pip dependencies for a messenger platform."""
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

        platform_id = body.get("platform", "")
        entry = next(
            (e for e in self._MESSENGER_REGISTRY if e["id"] == platform_id), None
        )
        if not entry:
            return web.json_response(
                {"ok": False, "error": f"Unknown platform: {platform_id}"},
                status=400,
            )

        pip_extra = entry.get("pip_extra")
        if not pip_extra:
            ext_dep = entry.get("external_dep", "external tools")
            return web.json_response({
                "ok": False,
                "error": f"{entry['name']} does not need pip packages. It requires {ext_dep}.",
                "needsExternal": True,
                "externalDep": ext_dep,
            })

        import subprocess
        import sys

        pip_bin = os.path.join(os.path.dirname(sys.executable), "pip")
        if not os.path.isfile(pip_bin):
            pip_bin = sys.executable
            pip_args = [pip_bin, "-m", "pip"]
        else:
            pip_args = [pip_bin]

        hermes_root = os.environ.get("HERMES_AGENT_ROOT", "")
        if hermes_root and os.path.isfile(os.path.join(hermes_root, "pyproject.toml")):
            install_spec = f"-e {hermes_root}[{pip_extra}]"
            cmd = [*pip_args, "install", "-e", f"{hermes_root}[{pip_extra}]"]
        else:
            install_spec = f"hermes-agent[{pip_extra}]"
            cmd = [*pip_args, "install", f"hermes-agent[{pip_extra}]"]

        logger.info("[api_extensions] Installing messenger deps: %s", install_spec)

        def _run_pip():
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,
            )
            return proc.returncode, proc.stdout, proc.stderr

        try:
            code, stdout, stderr = await asyncio.get_event_loop().run_in_executor(
                None, _run_pip
            )
            success = code == 0
            return web.json_response({
                "ok": success,
                "platform": platform_id,
                "pipExtra": pip_extra,
                "output": stdout[-2000:] if stdout else "",
                "error": stderr[-2000:] if stderr and not success else "",
            })
        except Exception as e:
            logger.exception("[api_extensions] pip install failed")
            return web.json_response({"ok": False, "error": str(e)}, status=500)

    # -- POST /api/gateway/restart --------------------------------------------

    _RESTART_EXIT_CODE = 75

    async def handle_gateway_restart(self, request: "web.Request") -> "web.Response":
        """Request gateway restart by exiting the Python process.

        In desktop mode, Electron detects exit code 75 and auto-restarts
        the Python backend.  On fresh start the gateway picks up the
        updated .env and starts all newly-configured platforms.
        """
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        try:
            logger.info(
                "[api_extensions] Gateway restart requested via API — exiting with code %d",
                self._RESTART_EXIT_CODE,
            )

            async def _delayed_exit():
                await asyncio.sleep(0.5)
                os._exit(self._RESTART_EXIT_CODE)

            asyncio.ensure_future(_delayed_exit())
            return web.json_response({
                "ok": True,
                "message": "Gateway restarting...",
            })
        except Exception as e:
            logger.exception("[api_extensions] Gateway restart failed")
            return web.json_response({"ok": False, "error": str(e)}, status=500)

    # ------------------------------------------------------------------
    # Backup / Restore
    # ------------------------------------------------------------------

    async def handle_backup_create(self, request: "web.Request") -> "web.Response":
        """Create a zip backup of the Hermes home directory.

        Returns ``{ok, path, size}`` on success.  The zip is written to
        ``~/hermes-backup-<timestamp>.zip`` (same default as the CLI).
        """
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        body = {}
        try:
            body = await request.json()
        except Exception:
            pass
        output_path = body.get("output") if body else None

        def _create():
            import tempfile
            from datetime import datetime
            import argparse

            args = argparse.Namespace(
                output=output_path,
                quick=False,
                label=None,
            )
            # run_backup prints to stdout and calls sys.exit on error;
            # we replicate the core logic inline instead.
            from hermes_constants import get_default_hermes_root
            from hermes_cli.backup import (
                _should_exclude,
                _EXCLUDED_DIRS,
                _safe_copy_db,
            )
            import zipfile

            hermes_root = get_default_hermes_root()
            if not hermes_root.is_dir():
                return {"ok": False, "error": f"Hermes home not found at {hermes_root}"}

            if output_path:
                out = Path(output_path).expanduser().resolve()
                if out.is_dir():
                    stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
                    out = out / f"hermes-backup-{stamp}.zip"
            else:
                stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
                out = Path.home() / f"hermes-backup-{stamp}.zip"

            if out.suffix.lower() != ".zip":
                out = out.with_suffix(out.suffix + ".zip")
            out.parent.mkdir(parents=True, exist_ok=True)

            files_to_add = []
            for dirpath, dirnames, filenames in os.walk(hermes_root, followlinks=False):
                dp = Path(dirpath)
                dirnames[:] = [d for d in dirnames if d not in _EXCLUDED_DIRS]
                for fname in filenames:
                    fpath = dp / fname
                    rel = fpath.relative_to(hermes_root)
                    if _should_exclude(rel):
                        continue
                    try:
                        if fpath.resolve() == out.resolve():
                            continue
                    except (OSError, ValueError):
                        pass
                    files_to_add.append((fpath, rel))

            if not files_to_add:
                return {"ok": False, "error": "No files to back up"}

            with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
                for abs_path, rel_path in files_to_add:
                    try:
                        if abs_path.suffix == ".db":
                            with tempfile.NamedTemporaryFile(
                                suffix=".db", delete=False
                            ) as tmp:
                                tmp_db = Path(tmp.name)
                            if _safe_copy_db(abs_path, tmp_db):
                                zf.write(tmp_db, arcname=str(rel_path))
                                tmp_db.unlink(missing_ok=True)
                            else:
                                tmp_db.unlink(missing_ok=True)
                        else:
                            zf.write(abs_path, arcname=str(rel_path))
                    except (PermissionError, OSError):
                        continue

            return {
                "ok": True,
                "path": str(out),
                "size": out.stat().st_size,
                "fileCount": len(files_to_add),
            }

        try:
            result = await asyncio.get_event_loop().run_in_executor(None, _create)
            return web.json_response(result)
        except Exception as e:
            logger.exception("[api_extensions] backup create error")
            return web.json_response({"ok": False, "error": str(e)}, status=500)

    async def handle_backup_restore(self, request: "web.Request") -> "web.Response":
        """Restore from a Hermes backup zip.

        Accepts ``{base64: "<data>", filename: "..."}`` or multipart
        form upload.  Writes the payload to a temp file and runs the
        import logic from ``hermes_cli.backup``.
        """
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        import base64 as b64mod
        import tempfile

        tmp_path = None
        try:
            body = await request.json()
            raw_b64 = body.get("base64", "")
            filename = body.get("filename", "restore.zip")
            if not raw_b64:
                return web.json_response(
                    {"ok": False, "error": "base64 payload is required"},
                    status=400,
                )
            data = b64mod.b64decode(raw_b64)
            suffix = ".zip" if filename.lower().endswith(".zip") else ".tar.gz"
            fd, tmp_path = tempfile.mkstemp(suffix=suffix)
            os.write(fd, data)
            os.close(fd)
        except Exception as e:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)
            return web.json_response(
                {"ok": False, "error": f"Failed to decode payload: {e}"},
                status=400,
            )

        def _restore():
            import zipfile
            from hermes_cli.backup import _validate_backup_zip, _detect_prefix
            from hermes_constants import get_default_hermes_root

            zip_path = Path(tmp_path)
            if not zipfile.is_zipfile(zip_path):
                return {"ok": False, "error": "Not a valid zip file"}

            hermes_root = get_default_hermes_root()

            with zipfile.ZipFile(zip_path, "r") as zf:
                ok, reason = _validate_backup_zip(zf)
                if not ok:
                    return {"ok": False, "error": reason}

                prefix = _detect_prefix(zf)
                members = [n for n in zf.namelist() if not n.endswith("/")]

                hermes_root.mkdir(parents=True, exist_ok=True)
                restored = 0
                errors = []

                for member in members:
                    if prefix and member.startswith(prefix):
                        rel = member[len(prefix) :]
                    else:
                        rel = member
                    if not rel:
                        continue

                    target = hermes_root / rel
                    try:
                        target.resolve().relative_to(hermes_root.resolve())
                    except ValueError:
                        errors.append(f"{rel}: path traversal blocked")
                        continue

                    try:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        with zf.open(member) as src, open(target, "wb") as dst:
                            dst.write(src.read())
                        restored += 1
                    except (PermissionError, OSError) as exc:
                        errors.append(f"{rel}: {exc}")

            return {
                "ok": True,
                "restored": restored,
                "errors": errors[:10] if errors else [],
            }

        try:
            result = await asyncio.get_event_loop().run_in_executor(None, _restore)
            return web.json_response(result)
        except Exception as e:
            logger.exception("[api_extensions] backup restore error")
            return web.json_response({"ok": False, "error": str(e)}, status=500)
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass


# ---------------------------------------------------------------------------
# Registration entry point
# ---------------------------------------------------------------------------


def register_routes(app: "web.Application", adapter: Any) -> None:
    """Register all extension routes on the aiohttp app."""
    routes = _ConfigRoutes(adapter)

    app.router.add_post("/api/v1/chat/completions", routes.handle_chat_completions_v1)
    app.router.add_post(
        "/api/v1/chat/completions/{completion_id}/cancel",
        routes.handle_cancel_completion,
    )
    app.router.add_get("/api/capabilities", routes.handle_capabilities)
    app.router.add_get("/api/profiles", routes.handle_profiles)
    app.router.add_post("/api/profiles", routes.handle_create_profile)
    app.router.add_post("/api/profiles/session/select", routes.handle_select_profile)
    app.router.add_get("/api/profiles/runtimes", routes.handle_profile_runtimes)
    app.router.add_get("/api/config", routes.handle_get_config)
    app.router.add_patch("/api/config", routes.handle_patch_config)
    app.router.add_get("/api/providers", routes.handle_providers)
    app.router.add_post("/api/model-switch", routes.handle_model_switch)
    app.router.add_get("/api/provider-models", routes.handle_provider_models)
    app.router.add_get("/api/skills", routes.handle_skills)
    app.router.add_get("/api/skills/hub-search", routes.handle_skills_hub_search)
    app.router.add_get("/api/skills/{name}", routes.handle_skill_detail)
    app.router.add_post("/api/skills/toggle", routes.handle_skills_toggle)
    app.router.add_post("/api/skills/install", routes.handle_skills_install)
    app.router.add_post("/api/skills/uninstall", routes.handle_skills_uninstall)
    app.router.add_post("/api/skills/update", routes.handle_skills_update)
    app.router.add_get("/api/memory", routes.handle_memory)
    app.router.add_get("/api/mcp/servers", routes.handle_mcp_servers)
    app.router.add_post("/api/oauth/device-code", routes.handle_oauth_device_code)
    app.router.add_post("/api/oauth/poll-token", routes.handle_oauth_poll_token)

    app.router.add_get("/api/logs", routes.handle_get_logs)
    app.router.add_get("/api/sessions", routes.handle_list_sessions)
    app.router.add_get(
        "/api/sessions/{session_id}/messages", routes.handle_session_messages
    )
    app.router.add_delete("/api/sessions/{session_id}", routes.handle_delete_session)

    app.router.add_get("/api/messengers", routes.handle_get_messengers)
    app.router.add_post("/api/messengers/install", routes.handle_messengers_install)
    app.router.add_post("/api/gateway/restart", routes.handle_gateway_restart)

    app.router.add_post("/api/backup/create", routes.handle_backup_create)
    app.router.add_post("/api/backup/restore", routes.handle_backup_restore)

    app.router.add_post("/api/approval/resolve", routes.handle_approval_resolve)

    logger.info("[api_extensions] Registered %d config/setup routes", 25)
