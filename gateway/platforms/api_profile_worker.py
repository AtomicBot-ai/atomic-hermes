"""Worker process for multi-profile API requests."""

import asyncio
import os
import queue
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from gateway.platforms.api_profile_shared import (
    deep_merge,
    extract_active_model,
    mask_key,
    oauth_poll_token,
    oauth_request_device_code,
)


class ProfileWorkerRuntime:
    """Execute profile-scoped operations inside an isolated process."""

    def __init__(self, profile_id: str, profile_home: str):
        self.profile_id = profile_id
        self.profile_home = Path(profile_home)
        self._session_db: Optional[Any] = None

    def _ensure_session_db(self):
        if self._session_db is None:
            from hermes_state import SessionDB

            self._session_db = SessionDB(self.profile_home / "state.db")
        return self._session_db

    def _create_agent(
        self,
        *,
        ephemeral_system_prompt: Optional[str] = None,
        session_id: Optional[str] = None,
        stream_delta_callback=None,
        reasoning_callback=None,
        tool_progress_callback=None,
    ) -> Any:
        from gateway.run import GatewayRunner, _load_gateway_config, _resolve_gateway_model, _resolve_runtime_agent_kwargs
        from hermes_cli.tools_config import _get_platform_tools
        from run_agent import AIAgent

        runtime_kwargs = _resolve_runtime_agent_kwargs()
        model = _resolve_gateway_model()
        user_config = _load_gateway_config()
        enabled_toolsets = sorted(_get_platform_tools(user_config, "api_server"))
        max_iterations = int(os.getenv("HERMES_MAX_ITERATIONS", "90"))
        fallback_model = GatewayRunner._load_fallback_model()

        return AIAgent(
            model=model,
            **runtime_kwargs,
            max_iterations=max_iterations,
            quiet_mode=True,
            verbose_logging=False,
            ephemeral_system_prompt=ephemeral_system_prompt or None,
            enabled_toolsets=enabled_toolsets,
            session_id=session_id,
            platform="api_server",
            stream_delta_callback=stream_delta_callback,
            reasoning_callback=reasoning_callback,
            tool_progress_callback=tool_progress_callback,
            session_db=self._ensure_session_db(),
            fallback_model=fallback_model,
        )

    def get_config(self) -> Dict[str, Any]:
        from hermes_cli.config import OPTIONAL_ENV_VARS, load_config, load_env

        config = load_config()
        env = load_env()
        active_model, active_provider = extract_active_model(config)
        provider_keys = [
            key for key, value in OPTIONAL_ENV_VARS.items()
            if value.get("category") == "provider" and value.get("password")
        ]
        providers_status = []
        for key in provider_keys:
            val = env.get(key) or os.environ.get(key, "")
            if val:
                providers_status.append({
                    "envVar": key,
                    "configured": True,
                    "maskedKey": mask_key(val),
                })
        return {
            "config": config,
            "activeModel": active_model,
            "activeProvider": active_provider,
            "hermesHome": str(self.profile_home),
            "hasApiKeys": len(providers_status) > 0,
            "providers": providers_status,
        }

    def patch_config(self, body: Dict[str, Any]) -> Dict[str, Any]:
        from hermes_cli.config import load_config, save_config, save_env_value

        if "config" in body and isinstance(body["config"], dict):
            current = load_config()
            deep_merge(current, body["config"])
            save_config(current)

        if "env" in body and isinstance(body["env"], dict):
            for key, value in body["env"].items():
                if isinstance(key, str) and isinstance(value, str):
                    save_env_value(key, value)

        return {"ok": True, "message": "Config updated", "restartRequired": False}

    def list_providers(self) -> Dict[str, Any]:
        from hermes_cli.config import load_config
        from hermes_cli.model_switch import list_authenticated_providers

        config = load_config()
        active_model, active_provider = extract_active_model(config)
        user_providers = config.get("providers") or {}
        custom_providers = config.get("custom_providers")
        providers = list_authenticated_providers(
            current_provider=active_provider,
            user_providers=user_providers if isinstance(user_providers, dict) else {},
            custom_providers=custom_providers if isinstance(custom_providers, list) else None,
        )
        return {
            "providers": providers,
            "currentProvider": active_provider,
            "currentModel": active_model,
        }

    def switch_model(self, body: Dict[str, Any]) -> Dict[str, Any]:
        from hermes_cli.config import load_config
        from hermes_cli.model_switch import switch_model

        model_query = str(body.get("model", "")).strip()
        explicit_provider = str(body.get("provider", "")).strip()
        is_global = bool(body.get("global", False))
        config = load_config()
        active_model, active_provider = extract_active_model(config)
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
            return {
                "ok": True,
                "model": result.new_model,
                "provider": result.target_provider,
                "providerLabel": result.provider_label,
                "baseUrl": result.base_url or "",
                "hasCredentials": bool(result.api_key),
                "warning": result.warning_message or None,
                "resolvedViaAlias": result.resolved_via_alias or None,
                "isGlobal": result.is_global,
            }
        return {"ok": False, "error": result.error_message, "status": 422}

    def list_skills(self) -> Dict[str, Any]:
        from gateway.platforms.api_extensions import _list_skills_enriched
        skills = _list_skills_enriched()
        return {"skills": skills, "total": len(skills)}

    def view_skill(self, params: Dict[str, Any]) -> Dict[str, Any]:
        import json as _json
        from tools.skills_tool import skill_view
        name = params.get("name", "")
        raw = skill_view(name)
        return _json.loads(raw)

    def toggle_skill(self, params: Dict[str, Any]) -> Dict[str, Any]:
        from gateway.platforms.api_extensions import _toggle_skill
        name = (params.get("name") or "").strip()
        enabled = params.get("enabled", True)
        _toggle_skill(name, enabled)
        return {"ok": True}

    def install_skill(self, params: Dict[str, Any]) -> Dict[str, Any]:
        from gateway.platforms.api_extensions import _install_skill
        identifier = (params.get("identifier") or "").strip()
        return _install_skill(identifier)

    def uninstall_skill(self, params: Dict[str, Any]) -> Dict[str, Any]:
        from gateway.platforms.api_extensions import _uninstall_skill
        name = (params.get("name") or "").strip()
        return _uninstall_skill(name)

    def update_skill(self, params: Dict[str, Any]) -> Dict[str, Any]:
        from gateway.platforms.api_extensions import _update_skill
        name = (params.get("name") or "").strip()
        content = params.get("content", "")
        return _update_skill(name, content)

    def search_hub(self, params: Dict[str, Any]) -> Dict[str, Any]:
        from gateway.platforms.api_extensions import _search_hub
        query = params.get("q", "")
        limit = params.get("limit", 30)
        offset = params.get("offset", 0)
        return _search_hub(query, limit, offset)

    def list_memory(self) -> Dict[str, Any]:
        memory_dir = self.profile_home / "memory"
        files: List[Dict[str, Any]] = []
        if memory_dir.exists() and memory_dir.is_dir():
            for entry in sorted(memory_dir.iterdir()):
                if entry.is_file() and not entry.name.startswith("."):
                    stat = entry.stat()
                    files.append({
                        "name": entry.name,
                        "path": entry.name,
                        "size": stat.st_size,
                        "modified": stat.st_mtime,
                    })
        return {"files": files, "total": len(files)}

    def list_mcp_servers(self) -> Dict[str, Any]:
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
                server: Dict[str, Any] = {"name": name, "transport": transport}
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
        return {"servers": servers, "total": len(servers)}

    def oauth_device_code(self, provider: str) -> Dict[str, Any]:
        return oauth_request_device_code(provider)

    def oauth_poll_token(self, provider: str, device_code: str, extra: Dict[str, Any]) -> Dict[str, Any]:
        return oauth_poll_token(provider, device_code, extra)

    def get_session_history(self, session_id: str) -> List[Dict[str, Any]]:
        return self._ensure_session_db().get_messages_as_conversation(session_id)

    def list_sessions(self, limit: int, offset: int) -> Dict[str, Any]:
        sessions = self._ensure_session_db().list_sessions_rich(limit=limit, offset=offset)
        result = []
        for session in sessions:
            result.append({
                "key": session.get("id", ""),
                "kind": "chat",
                "label": session.get("title") or None,
                "derivedTitle": session.get("title") or session.get("preview") or None,
                "lastMessagePreview": session.get("preview") or None,
                "updatedAt": session.get("last_active") or session.get("started_at"),
                "messageCount": session.get("message_count", 0),
                "model": session.get("model") or None,
            })
        return {"sessions": result, "total": len(result)}

    def get_session_messages(self, session_id: str) -> Dict[str, Any]:
        return {
            "sessionKey": session_id,
            "messages": self._ensure_session_db().get_messages(session_id),
        }

    def delete_session(self, session_id: str) -> Dict[str, Any]:
        deleted = self._ensure_session_db().delete_session(session_id)
        return {"ok": deleted}

    def run_agent(self, params: Dict[str, Any]) -> Dict[str, Any]:
        agent = self._create_agent(
            ephemeral_system_prompt=params.get("ephemeral_system_prompt"),
            session_id=params.get("session_id"),
        )
        result = agent.run_conversation(
            user_message=params["user_message"],
            conversation_history=params.get("conversation_history", []),
            task_id="default",
        )
        return {
            "result": result,
            "usage": {
                "input_tokens": getattr(agent, "session_prompt_tokens", 0) or 0,
                "output_tokens": getattr(agent, "session_completion_tokens", 0) or 0,
                "total_tokens": getattr(agent, "session_total_tokens", 0) or 0,
            },
        }

    def stream_agent(self, request_id: str, response_queue, params: Dict[str, Any]) -> None:
        stream_q: "queue.Queue[tuple[str, Any] | None]" = queue.Queue()

        def emit(kind: str, payload: Any) -> None:
            response_queue.put({
                "request_id": request_id,
                "kind": "event",
                "event": kind,
                "payload": payload,
            })

        def on_content_delta(delta: Optional[str]) -> None:
            if delta is not None:
                stream_q.put(("content", delta))

        def on_reasoning_delta(delta: Optional[str]) -> None:
            if delta:
                stream_q.put(("reasoning", delta))

        def on_tool_progress(event_type, name, preview, args, **kwargs) -> None:
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

        result_box: Dict[str, Any] = {}
        error_box: Dict[str, Exception] = {}

        def _run_agent_sync() -> None:
            try:
                agent = self._create_agent(
                    ephemeral_system_prompt=params.get("ephemeral_system_prompt"),
                    session_id=params.get("session_id"),
                    stream_delta_callback=on_content_delta,
                    reasoning_callback=on_reasoning_delta,
                    tool_progress_callback=on_tool_progress,
                )
                result = agent.run_conversation(
                    user_message=params["user_message"],
                    conversation_history=params.get("conversation_history", []),
                    task_id="default",
                )
                result_box["payload"] = {
                    "result": result,
                    "usage": {
                        "input_tokens": getattr(agent, "session_prompt_tokens", 0) or 0,
                        "output_tokens": getattr(agent, "session_completion_tokens", 0) or 0,
                        "total_tokens": getattr(agent, "session_total_tokens", 0) or 0,
                    },
                }
            except Exception as exc:
                error_box["error"] = exc

        worker_thread = threading.Thread(target=_run_agent_sync, daemon=True)
        worker_thread.start()
        while worker_thread.is_alive() or not stream_q.empty():
            try:
                queued = stream_q.get(timeout=0.1)
            except queue.Empty:
                continue
            if queued is None:
                continue
            emit(queued[0], queued[1])
        worker_thread.join()
        if "error" in error_box:
            raise error_box["error"]
        response_queue.put({
            "request_id": request_id,
            "kind": "response",
            "result": result_box["payload"],
        })


def _prepare_worker_environment(profile_home: str) -> None:
    os.environ["HERMES_HOME"] = profile_home
    subprocess_home = Path(profile_home) / "home"
    if subprocess_home.is_dir():
        os.environ["HOME"] = str(subprocess_home)

    env_file = Path(profile_home) / ".env"
    if env_file.is_file():
        try:
            from hermes_cli.env_loader import load_hermes_dotenv
            load_hermes_dotenv(hermes_home=Path(profile_home))
        except Exception:
            with open(env_file) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, value = line.partition("=")
                        os.environ[key.strip()] = value.strip().strip("\"'")


def run_profile_worker(profile_id: str, profile_home: str, request_queue, response_queue) -> None:
    """Process loop entry point for profile RPC."""
    _prepare_worker_environment(profile_home)
    runtime = ProfileWorkerRuntime(profile_id, profile_home)
    response_queue.put({"kind": "worker_ready", "profile_id": profile_id})
    while True:
        message = request_queue.get()
        if message is None or message.get("kind") == "shutdown":
            break
        request_id = message["request_id"]
        method = message["method"]
        params = message.get("params", {})
        try:
            if method == "stream_agent":
                runtime.stream_agent(request_id, response_queue, params)
                continue
            handler = getattr(runtime, method)
            if method in {"oauth_device_code"}:
                result = handler(params["provider"])
            elif method in {"oauth_poll_token"}:
                result = handler(params["provider"], params["device_code"], params.get("extra", {}))
            elif method in {"get_session_history"}:
                result = handler(params["session_id"])
            elif method in {"list_sessions"}:
                result = handler(int(params.get("limit", 50)), int(params.get("offset", 0)))
            elif method in {"get_session_messages", "delete_session"}:
                result = handler(params["session_id"])
            elif method in {
                "patch_config", "switch_model", "run_agent",
                "view_skill", "toggle_skill", "install_skill",
                "uninstall_skill", "update_skill", "search_hub",
            }:
                result = handler(params)
            else:
                result = handler()
            response_queue.put({"request_id": request_id, "kind": "response", "result": result})
        except Exception as exc:
            response_queue.put({"request_id": request_id, "kind": "error", "error": str(exc)})
