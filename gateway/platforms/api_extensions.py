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

logger = logging.getLogger(__name__)

try:
    from aiohttp import web
except ImportError:
    web = None  # type: ignore[assignment]


def _mask_key(key: str) -> str:
    """Mask an API key for safe display: show first 4 + last 4 chars."""
    if not key or len(key) < 12:
        return "***"
    return f"{key[:4]}...{key[-4:]}"


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


def _extract_active_model(config: Dict[str, Any]) -> tuple:
    """Extract active model and provider from config dict.

    Handles both flat format (model: "str", provider: "str")
    and legacy nested format (model: {default: "str", provider: "str"}).
    """
    model_field = config.get("model", "")
    if isinstance(model_field, dict):
        active_model = model_field.get("default", "")
        active_provider = model_field.get("provider", config.get("provider", ""))
    else:
        active_model = str(model_field) if model_field else ""
        active_provider = str(config.get("provider", ""))
    return active_model, active_provider


# ---------------------------------------------------------------------------
# Route handlers
# ---------------------------------------------------------------------------

class _ConfigRoutes:
    """Namespace for route handler methods. Holds a reference to the adapter."""

    def __init__(self, adapter: Any):
        self._adapter = adapter

    def _check_auth(self, request: "web.Request") -> Optional["web.Response"]:
        return self._adapter._check_auth(request)

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
        prompt_tokens = int(result.get("prompt_tokens") or result.get("input_tokens") or 0)
        completion_tokens = int(result.get("completion_tokens") or result.get("output_tokens") or 0)
        total_tokens = int(result.get("total_tokens") or (prompt_tokens + completion_tokens))
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
        }
        response = web.StreamResponse(status=200, headers=headers)
        await response.prepare(request)

        async def _write_event(event_name: Optional[str], payload: Dict[str, Any]) -> None:
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
                    item = await loop.run_in_executor(None, lambda: stream_q.get(timeout=0.5))
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
            logger.info("[api_extensions] Extended SSE client disconnected: %s", completion_id)

        return response

    # -- POST /api/v1/chat/completions ----------------------------------------

    async def handle_chat_completions_v1(self, request):
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        try:
            body = await request.json()
        except Exception:
            return web.json_response(_openai_error("Invalid JSON in request body"), status=400)

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
                system_prompt = content if system_prompt is None else f"{system_prompt}\n{content}"
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
                return web.json_response(_openai_error("Invalid session ID"), status=400)
            session_id = provided_session_id
            try:
                db = self._adapter._ensure_session_db()
                if db is not None:
                    history = db.get_messages_as_conversation(session_id)
            except Exception as exc:
                logger.warning("[api_extensions] Failed to load session history for %s: %s", session_id, exc)
                history = []
        else:
            first_user = ""
            for cm in conversation_messages:
                if cm.get("role") == "user":
                    first_user = cm.get("content", "")
                    break
            session_id = self._derive_chat_session_id(system_prompt, first_user)

        completion_id = f"chatcmpl-{uuid.uuid4().hex[:29]}"
        model_name = body.get("model", self._adapter._model_name)
        created = int(time.time())

        if stream:
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
            result = await self._run_chat_completion(
                user_message=user_message,
                history=history,
                system_prompt=system_prompt,
                session_id=session_id,
            )
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
        return web.json_response(response_data, headers={"X-Hermes-Session-Id": session_id})

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

    # -- GET /api/config ------------------------------------------------------

    async def handle_get_config(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        try:
            from hermes_cli.config import load_config, load_env, OPTIONAL_ENV_VARS

            config = load_config()
            env = load_env()
            hermes_home = _get_hermes_home()

            active_model, active_provider = _extract_active_model(config)

            provider_keys = [
                k for k, v in OPTIONAL_ENV_VARS.items()
                if v.get("category") == "provider" and v.get("password")
            ]
            providers_status = []
            for key in provider_keys:
                val = env.get(key) or os.environ.get(key, "")
                if val:
                    providers_status.append({
                        "envVar": key,
                        "configured": True,
                        "maskedKey": _mask_key(val),
                    })

            return web.json_response({
                "config": config,
                "activeModel": active_model,
                "activeProvider": active_provider,
                "hermesHome": str(hermes_home),
                "hasApiKeys": len(providers_status) > 0,
                "providers": providers_status,
            })
        except Exception as e:
            logger.exception("[api_extensions] Error reading config")
            return web.json_response(
                {"ok": False, "error": str(e)}, status=500,
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
                {"ok": False, "error": "Invalid JSON"}, status=400,
            )

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

            return web.json_response({
                "ok": True,
                "message": "Config updated",
                "restartRequired": False,
            })
        except Exception as e:
            logger.exception("[api_extensions] Error saving config")
            return web.json_response(
                {"ok": False, "error": str(e)}, status=500,
            )

    # -- GET /api/providers ---------------------------------------------------

    async def handle_providers(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        try:
            from hermes_cli.config import load_config
            from hermes_cli.model_switch import list_authenticated_providers

            config = load_config()
            active_model, active_provider = _extract_active_model(config)

            user_providers = config.get("providers") or {}
            custom_providers = config.get("custom_providers")

            providers = list_authenticated_providers(
                current_provider=active_provider,
                user_providers=user_providers if isinstance(user_providers, dict) else {},
                custom_providers=custom_providers if isinstance(custom_providers, list) else None,
            )

            return web.json_response({
                "providers": providers,
                "currentProvider": active_provider,
                "currentModel": active_model,
            })
        except Exception as e:
            logger.exception("[api_extensions] Error listing providers")
            return web.json_response(
                {"ok": False, "error": str(e)}, status=500,
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
                {"ok": False, "error": "Invalid JSON"}, status=400,
            )

        model_query = body.get("model", "").strip()
        explicit_provider = body.get("provider", "").strip()
        is_global = body.get("global", False)

        if not model_query and not explicit_provider:
            return web.json_response(
                {"ok": False, "error": "Provide 'model' and/or 'provider'"}, status=400,
            )

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
                return web.json_response({
                    "ok": True,
                    "model": result.new_model,
                    "provider": result.target_provider,
                    "providerLabel": result.provider_label,
                    "baseUrl": result.base_url or "",
                    "hasCredentials": bool(result.api_key),
                    "warning": result.warning_message or None,
                    "resolvedViaAlias": result.resolved_via_alias or None,
                    "isGlobal": result.is_global,
                })
            else:
                return web.json_response({
                    "ok": False,
                    "error": result.error_message,
                }, status=422)
        except Exception as e:
            logger.exception("[api_extensions] Error switching model")
            return web.json_response(
                {"ok": False, "error": str(e)}, status=500,
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
                None, lambda: curated_models_for_provider(provider),
            )

            return web.json_response({
                "ok": True,
                "provider": provider,
                "providerLabel": provider_label(provider),
                "models": [
                    {"id": mid, "description": desc}
                    for mid, desc in models
                ],
            })
        except Exception as e:
            logger.exception("[api_extensions] Error fetching provider models")
            return web.json_response(
                {"ok": False, "error": str(e), "models": []}, status=500,
            )

    # -- GET /api/skills ------------------------------------------------------

    async def handle_skills(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        try:
            from agent.skill_commands import scan_skill_commands
            skills_map = scan_skill_commands()

            skills = []
            for trigger, info in skills_map.items():
                skills.append({
                    "trigger": trigger,
                    "name": info.get("name", ""),
                    "description": info.get("description", ""),
                    "path": info.get("skill_dir", ""),
                })

            return web.json_response({"skills": skills, "total": len(skills)})
        except Exception as e:
            logger.exception("[api_extensions] Error listing skills")
            return web.json_response(
                {"ok": False, "error": str(e), "skills": []}, status=500,
            )

    # -- GET /api/memory ------------------------------------------------------

    async def handle_memory(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

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

            return web.json_response({"files": files, "total": len(files)})
        except Exception as e:
            logger.exception("[api_extensions] Error listing memory")
            return web.json_response(
                {"ok": False, "error": str(e), "files": []}, status=500,
            )

    # -- GET /api/mcp/servers -------------------------------------------------

    async def handle_mcp_servers(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

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

            return web.json_response({"servers": servers, "total": len(servers)})
        except Exception as e:
            logger.exception("[api_extensions] Error listing MCP servers")
            return web.json_response(
                {"ok": False, "error": str(e), "servers": []}, status=500,
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
                {"ok": False, "error": "Invalid JSON"}, status=400,
            )

        provider = body.get("provider", "").strip()
        if provider not in ("nous", "openai-codex"):
            return web.json_response(
                {"ok": False, "error": "provider must be 'nous' or 'openai-codex'"},
                status=400,
            )

        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None, _oauth_request_device_code, provider,
            )
            return web.json_response(result)
        except Exception as e:
            logger.exception("[api_extensions] OAuth device-code error")
            return web.json_response(
                {"ok": False, "error": str(e)}, status=500,
            )

    # -- GET /api/sessions ----------------------------------------------------

    async def handle_list_sessions(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

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

            return web.json_response({"sessions": result, "total": len(result)})
        except Exception as e:
            logger.exception("[api_extensions] Error listing sessions")
            return web.json_response(
                {"ok": False, "error": str(e), "sessions": []}, status=500,
            )

    # -- GET /api/sessions/{session_id}/messages ------------------------------

    async def handle_session_messages(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        session_id = request.match_info["session_id"]
        try:
            db = self._adapter._ensure_session_db()
            if db is None:
                return web.json_response(
                    {"messages": [], "error": "SessionDB unavailable"},
                )

            messages = db.get_messages(session_id)
            return web.json_response({
                "sessionKey": session_id,
                "messages": messages,
            })
        except Exception as e:
            logger.exception("[api_extensions] Error fetching session messages")
            return web.json_response(
                {"ok": False, "error": str(e), "messages": []}, status=500,
            )

    # -- DELETE /api/sessions/{session_id} ------------------------------------

    async def handle_delete_session(self, request: "web.Request") -> "web.Response":
        auth_err = self._check_auth(request)
        if auth_err:
            return auth_err

        session_id = request.match_info["session_id"]
        try:
            db = self._adapter._ensure_session_db()
            if db is None:
                return web.json_response(
                    {"ok": False, "error": "SessionDB unavailable"}, status=500,
                )

            deleted = db.delete_session(session_id)
            if not deleted:
                return web.json_response(
                    {"ok": False, "error": "Session not found"}, status=404,
                )

            return web.json_response({"ok": True})
        except Exception as e:
            logger.exception("[api_extensions] Error deleting session")
            return web.json_response(
                {"ok": False, "error": str(e)}, status=500,
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
                {"ok": False, "error": "Invalid JSON"}, status=400,
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
                {"ok": False, "error": "deviceCode is required"}, status=400,
            )

        extra = {k: v for k, v in body.items() if k not in ("provider", "deviceCode")}

        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None, _oauth_poll_token, provider, device_code, extra,
            )
            return web.json_response(result)
        except Exception as e:
            logger.exception("[api_extensions] OAuth poll-token error")
            return web.json_response(
                {"ok": False, "error": str(e)}, status=500,
            )


# ---------------------------------------------------------------------------
# OAuth helpers (run in thread pool — these make synchronous HTTP calls)
# ---------------------------------------------------------------------------

def _oauth_request_device_code(provider: str) -> Dict[str, Any]:
    """Request a device code for the given OAuth provider."""
    import httpx

    if provider == "nous":
        from hermes_cli.auth import (
            _request_device_code,
            PROVIDER_REGISTRY,
        )
        pconfig = PROVIDER_REGISTRY["nous"]
        portal_url = (
            os.getenv("HERMES_PORTAL_BASE_URL")
            or os.getenv("NOUS_PORTAL_BASE_URL")
            or pconfig.portal_base_url
        ).rstrip("/")
        client_id = pconfig.client_id
        scope = pconfig.scope

        with httpx.Client(
            timeout=httpx.Timeout(15.0),
            headers={"Accept": "application/json"},
        ) as client:
            data = _request_device_code(
                client=client,
                portal_base_url=portal_url,
                client_id=client_id,
                scope=scope,
            )

        return {
            "ok": True,
            "provider": "nous",
            "device_code": data["device_code"],
            "user_code": data["user_code"],
            "verification_uri_complete": data["verification_uri_complete"],
            "interval": int(data.get("interval", 5)),
            "expires_in": int(data.get("expires_in", 900)),
            "client_id": client_id,
            "portal_base_url": portal_url,
        }

    # openai-codex
    from hermes_cli.auth import CODEX_OAUTH_CLIENT_ID

    issuer = "https://auth.openai.com"
    with httpx.Client(timeout=httpx.Timeout(15.0)) as client:
        resp = client.post(
            f"{issuer}/api/accounts/deviceauth/usercode",
            json={"client_id": CODEX_OAUTH_CLIENT_ID},
            headers={"Content-Type": "application/json"},
        )

    if resp.status_code != 200:
        return {"ok": False, "error": f"Device code request returned {resp.status_code}"}

    data = resp.json()
    user_code = data.get("user_code", "")
    device_auth_id = data.get("device_auth_id", "")

    if not user_code or not device_auth_id:
        return {"ok": False, "error": "Incomplete device code response"}

    return {
        "ok": True,
        "provider": "openai-codex",
        "device_code": device_auth_id,
        "user_code": user_code,
        "verification_uri_complete": f"{issuer}/codex/device",
        "interval": max(3, int(data.get("interval", 5))),
        "expires_in": 900,
    }


def _oauth_poll_token(
    provider: str, device_code: str, extra: Dict[str, Any],
) -> Dict[str, Any]:
    """Single poll attempt for token readiness. Returns status dict."""
    import httpx

    if provider == "nous":
        from hermes_cli.auth import (
            PROVIDER_REGISTRY,
            _save_auth_store,
            _load_auth_store,
            refresh_nous_oauth_from_state,
        )
        from datetime import datetime, timezone

        pconfig = PROVIDER_REGISTRY["nous"]
        portal_url = extra.get("portal_base_url") or (
            os.getenv("HERMES_PORTAL_BASE_URL")
            or os.getenv("NOUS_PORTAL_BASE_URL")
            or pconfig.portal_base_url
        ).rstrip("/")
        client_id = extra.get("client_id") or pconfig.client_id

        with httpx.Client(
            timeout=httpx.Timeout(15.0),
            headers={"Accept": "application/json"},
        ) as client:
            response = client.post(
                f"{portal_url}/api/oauth/token",
                data={
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                    "client_id": client_id,
                    "device_code": device_code,
                },
            )

        if response.status_code == 200:
            token_data = response.json()
            if "access_token" not in token_data:
                return {"status": "error", "message": "No access_token in response"}

            now = datetime.now(timezone.utc)
            token_expires_in = int(token_data.get("expires_in", 0))
            inference_url = (
                token_data.get("inference_base_url")
                or os.getenv("NOUS_INFERENCE_BASE_URL")
                or pconfig.inference_base_url
            ).rstrip("/")

            auth_state = {
                "portal_base_url": portal_url,
                "inference_base_url": inference_url,
                "client_id": client_id,
                "scope": token_data.get("scope") or pconfig.scope,
                "token_type": token_data.get("token_type", "Bearer"),
                "access_token": token_data["access_token"],
                "refresh_token": token_data.get("refresh_token"),
                "obtained_at": now.isoformat(),
                "expires_at": datetime.fromtimestamp(
                    now.timestamp() + token_expires_in, tz=timezone.utc,
                ).isoformat(),
                "expires_in": token_expires_in,
                "agent_key": None,
                "agent_key_id": None,
                "agent_key_expires_at": None,
            }

            try:
                auth_state = refresh_nous_oauth_from_state(
                    auth_state, min_key_ttl_seconds=300,
                    timeout_seconds=15.0, force_refresh=False, force_mint=True,
                )
            except Exception as exc:
                logger.warning("[api_extensions] Nous agent key mint failed: %s", exc)

            store = _load_auth_store()
            store.setdefault("providers", {})["nous"] = auth_state
            _save_auth_store(store)

            return {"status": "success", "message": "Authenticated with Nous Portal"}

        try:
            err = response.json()
        except Exception:
            return {"status": "error", "message": f"HTTP {response.status_code}"}

        error_code = err.get("error", "")
        if error_code in ("authorization_pending", "slow_down"):
            return {"status": "pending", "message": "Waiting for user approval"}
        return {"status": "error", "message": err.get("error_description", error_code)}

    # openai-codex
    from hermes_cli.auth import CODEX_OAUTH_CLIENT_ID, CODEX_OAUTH_TOKEN_URL

    issuer = "https://auth.openai.com"
    with httpx.Client(timeout=httpx.Timeout(15.0)) as client:
        poll_resp = client.post(
            f"{issuer}/api/accounts/deviceauth/token",
            json={"device_auth_id": device_code, "user_code": extra.get("user_code", "")},
            headers={"Content-Type": "application/json"},
        )

    if poll_resp.status_code in (403, 404):
        return {"status": "pending", "message": "Waiting for user approval"}

    if poll_resp.status_code != 200:
        return {"status": "error", "message": f"Poll returned {poll_resp.status_code}"}

    code_resp = poll_resp.json()
    authorization_code = code_resp.get("authorization_code", "")
    code_verifier = code_resp.get("code_verifier", "")

    if not authorization_code or not code_verifier:
        return {"status": "error", "message": "Missing authorization_code or code_verifier"}

    redirect_uri = f"{issuer}/deviceauth/callback"
    with httpx.Client(timeout=httpx.Timeout(15.0)) as client:
        token_resp = client.post(
            CODEX_OAUTH_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": authorization_code,
                "redirect_uri": redirect_uri,
                "client_id": CODEX_OAUTH_CLIENT_ID,
                "code_verifier": code_verifier,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if token_resp.status_code != 200:
        return {"status": "error", "message": f"Token exchange returned {token_resp.status_code}"}

    tokens = token_resp.json()
    if not tokens.get("access_token"):
        return {"status": "error", "message": "No access_token from token exchange"}

    from hermes_cli.auth import _save_auth_store, _load_auth_store
    from datetime import datetime, timezone

    base_url = (
        os.getenv("HERMES_CODEX_BASE_URL", "").strip().rstrip("/")
        or "https://api.openai.com/v1"
    )
    store = _load_auth_store()
    store.setdefault("providers", {})["openai-codex"] = {
        "tokens": {
            "access_token": tokens["access_token"],
            "refresh_token": tokens.get("refresh_token", ""),
        },
        "base_url": base_url,
        "last_refresh": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    _save_auth_store(store)

    return {"status": "success", "message": "Authenticated with OpenAI Codex"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _deep_merge(base: dict, override: dict) -> dict:
    """Deep-merge override into base, modifying base in place."""
    for key, value in override.items():
        if (
            key in base
            and isinstance(base[key], dict)
            and isinstance(value, dict)
        ):
            _deep_merge(base[key], value)
        else:
            base[key] = value
    return base


# ---------------------------------------------------------------------------
# Registration entry point
# ---------------------------------------------------------------------------

def register_routes(app: "web.Application", adapter: Any) -> None:
    """Register all extension routes on the aiohttp app."""
    routes = _ConfigRoutes(adapter)

    app.router.add_post("/api/v1/chat/completions", routes.handle_chat_completions_v1)
    app.router.add_get("/api/capabilities", routes.handle_capabilities)
    app.router.add_get("/api/config", routes.handle_get_config)
    app.router.add_patch("/api/config", routes.handle_patch_config)
    app.router.add_get("/api/providers", routes.handle_providers)
    app.router.add_post("/api/model-switch", routes.handle_model_switch)
    app.router.add_get("/api/provider-models", routes.handle_provider_models)
    app.router.add_get("/api/skills", routes.handle_skills)
    app.router.add_get("/api/memory", routes.handle_memory)
    app.router.add_get("/api/mcp/servers", routes.handle_mcp_servers)
    app.router.add_post("/api/oauth/device-code", routes.handle_oauth_device_code)
    app.router.add_post("/api/oauth/poll-token", routes.handle_oauth_poll_token)

    app.router.add_get("/api/sessions", routes.handle_list_sessions)
    app.router.add_get("/api/sessions/{session_id}/messages", routes.handle_session_messages)
    app.router.add_delete("/api/sessions/{session_id}", routes.handle_delete_session)

    logger.info("[api_extensions] Registered %d config/setup routes", 15)
