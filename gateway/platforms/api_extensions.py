"""API extensions for hermes-agent api_server platform.

Adds configuration, provider management, model switching, skills, memory,
and MCP endpoints. All routes delegate to existing hermes-cli functions --
no logic is duplicated.

Loaded by api_server.py via a try/except import in APIServerAdapter.connect().
If this file is absent, hermes-agent works as stock upstream.
"""

import json
import logging
import os
import time
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

    app.router.add_get("/api/capabilities", routes.handle_capabilities)
    app.router.add_get("/api/config", routes.handle_get_config)
    app.router.add_patch("/api/config", routes.handle_patch_config)
    app.router.add_get("/api/providers", routes.handle_providers)
    app.router.add_post("/api/model-switch", routes.handle_model_switch)
    app.router.add_get("/api/skills", routes.handle_skills)
    app.router.add_get("/api/memory", routes.handle_memory)
    app.router.add_get("/api/mcp/servers", routes.handle_mcp_servers)

    logger.info("[api_extensions] Registered %d config/setup routes", 8)
