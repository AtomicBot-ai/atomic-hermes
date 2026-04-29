"""
Tests for the API extensions (config, providers, model-switch, skills, memory, MCP).

Tests cover:
- register_routes() adds all expected endpoints
- GET /api/capabilities returns correct structure
- GET /api/config reads config and masks keys
- PATCH /api/config writes via save_config / save_env_value
- GET /api/providers delegates to list_authenticated_providers
- POST /api/model-switch delegates to switch_model
- GET /api/skills returns scanned skills
- GET /api/memory lists memory directory
- GET /api/mcp/servers reads mcp_servers from config
- Auth enforcement on all endpoints
"""

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch, call
from unittest.mock import AsyncMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from gateway.config import PlatformConfig
from gateway.platforms.api_server import (
    APIServerAdapter,
    cors_middleware,
    security_headers_middleware,
)
from gateway.platforms.api_extensions import (
    register_routes,
    _mask_key,
    _extract_active_model,
    _deep_merge,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_adapter(api_key: str = "") -> APIServerAdapter:
    extra = {}
    if api_key:
        extra["key"] = api_key
    config = PlatformConfig(enabled=True, extra=extra)
    return APIServerAdapter(config)


def _create_app(adapter: APIServerAdapter) -> web.Application:
    """Create an aiohttp app with only extension routes (no upstream routes needed)."""
    mws = [mw for mw in (cors_middleware, security_headers_middleware) if mw is not None]
    app = web.Application(middlewares=mws)
    app["api_server_adapter"] = adapter
    register_routes(app, adapter)
    return app


@pytest.fixture
def adapter():
    return _make_adapter()


@pytest.fixture
def auth_adapter():
    return _make_adapter(api_key="sk-test-secret-key")


# ---------------------------------------------------------------------------
# Unit tests for helpers
# ---------------------------------------------------------------------------


class TestMaskKey:
    def test_short_key_returns_stars(self):
        assert _mask_key("short") == "***"
        assert _mask_key("") == "***"

    def test_long_key_masked(self):
        result = _mask_key("sk-ant-1234567890abcdef")
        assert result.startswith("sk-a")
        assert result.endswith("cdef")
        assert "..." in result

    def test_exact_12_chars(self):
        result = _mask_key("123456789012")
        assert result == "1234...9012"


class TestExtractActiveModel:
    def test_flat_format(self):
        config = {"model": "gpt-4.1", "provider": "openai"}
        model, provider = _extract_active_model(config)
        assert model == "gpt-4.1"
        assert provider == "openai"

    def test_nested_format(self):
        config = {"model": {"default": "claude-sonnet-4", "provider": "anthropic"}}
        model, provider = _extract_active_model(config)
        assert model == "claude-sonnet-4"
        assert provider == "anthropic"

    def test_empty_config(self):
        model, provider = _extract_active_model({})
        assert model == ""
        assert provider == ""

    def test_nested_with_root_provider_fallback(self):
        config = {"model": {"default": "some-model"}, "provider": "fallback-prov"}
        model, provider = _extract_active_model(config)
        assert model == "some-model"
        assert provider == "fallback-prov"

    def test_top_level_provider_overrides_nested(self):
        config = {"model": {"default": "claude-haiku-4.5", "provider": "nous"}, "provider": "openrouter"}
        model, provider = _extract_active_model(config)
        assert model == "claude-haiku-4.5"
        assert provider == "openrouter"

    def test_top_level_provider_overrides_empty_nested(self):
        config = {"model": {"default": "claude-haiku-4.5", "provider": ""}, "provider": "openrouter"}
        model, provider = _extract_active_model(config)
        assert model == "claude-haiku-4.5"
        assert provider == "openrouter"


class TestDeepMerge:
    def test_simple_merge(self):
        base = {"a": 1, "b": 2}
        result = _deep_merge(base, {"b": 3, "c": 4})
        assert result == {"a": 1, "b": 3, "c": 4}

    def test_nested_merge(self):
        base = {"a": {"x": 1, "y": 2}, "b": 3}
        result = _deep_merge(base, {"a": {"y": 99, "z": 100}})
        assert result == {"a": {"x": 1, "y": 99, "z": 100}, "b": 3}

    def test_override_non_dict_with_dict(self):
        base = {"a": "string"}
        result = _deep_merge(base, {"a": {"nested": True}})
        assert result == {"a": {"nested": True}}


# ---------------------------------------------------------------------------
# GET /api/capabilities
# ---------------------------------------------------------------------------


class TestCapabilities:
    @pytest.mark.asyncio
    async def test_returns_all_capabilities(self, adapter):
        app = _create_app(adapter)
        async with TestClient(TestServer(app)) as cli:
            resp = await cli.get("/api/capabilities")
            assert resp.status == 200
            data = await resp.json()
            assert "version" in data
            assert data["platform"] == "hermes-agent"
            caps = data["capabilities"]
            for key in ("config", "models", "skills", "memory", "mcp", "modelSwitch", "chat", "jobs"):
                assert key in caps
                assert caps[key] is True

    @pytest.mark.asyncio
    async def test_auth_required(self, auth_adapter):
        app = _create_app(auth_adapter)
        async with TestClient(TestServer(app)) as cli:
            resp = await cli.get("/api/capabilities")
            assert resp.status == 401

    @pytest.mark.asyncio
    async def test_auth_accepted(self, auth_adapter):
        app = _create_app(auth_adapter)
        async with TestClient(TestServer(app)) as cli:
            resp = await cli.get(
                "/api/capabilities",
                headers={"Authorization": "Bearer sk-test-secret-key"},
            )
            assert resp.status == 200


# ---------------------------------------------------------------------------
# Profile endpoints
# ---------------------------------------------------------------------------


class TestProfiles:
    @pytest.mark.asyncio
    async def test_lists_profiles(self, adapter):
        mock_profiles = [{
            "id": "default",
            "name": "default",
            "path": "/tmp/.hermes",
            "isDefault": True,
            "gatewayRunning": False,
            "model": None,
            "provider": None,
            "hasEnv": False,
            "skillCount": 0,
            "aliasPath": None,
            "stickyDefault": True,
        }]
        expected_profiles = [dict(mock_profiles[0], gatewayRunning=True)]
        with (
            patch.object(adapter._profile_registry, "list_profiles", return_value=mock_profiles),
            patch.object(adapter._profile_runtime_manager, "status", return_value=[]),
        ):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.get("/api/profiles")
                assert resp.status == 200
                data = await resp.json()
                assert data["profiles"] == expected_profiles
                assert data["hostProfile"] == adapter._host_profile_id

    @pytest.mark.asyncio
    async def test_lists_profiles_marks_running_workers(self, adapter):
        mock_profiles = [
            {
                "id": "default",
                "name": "default",
                "path": "/tmp/.hermes",
                "isDefault": True,
                "gatewayRunning": False,
                "model": None,
                "provider": None,
                "hasEnv": False,
                "skillCount": 0,
                "aliasPath": None,
                "stickyDefault": True,
            },
            {
                "id": "coder",
                "name": "coder",
                "path": "/tmp/.hermes/profiles/coder",
                "isDefault": False,
                "gatewayRunning": False,
                "model": None,
                "provider": None,
                "hasEnv": False,
                "skillCount": 0,
                "aliasPath": None,
                "stickyDefault": False,
            },
        ]
        worker_status = [{
            "profile": "coder",
            "home": "/tmp/.hermes/profiles/coder",
            "running": True,
            "pid": 12345,
            "pendingRequests": 0,
        }]
        with (
            patch.object(adapter._profile_registry, "list_profiles", return_value=mock_profiles),
            patch.object(adapter._profile_runtime_manager, "status", return_value=worker_status),
        ):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.get("/api/profiles")
                assert resp.status == 200
                data = await resp.json()
                profiles_by_id = {profile["id"]: profile for profile in data["profiles"]}
                assert profiles_by_id["default"]["gatewayRunning"] is True
                assert profiles_by_id["coder"]["gatewayRunning"] is True

    @pytest.mark.asyncio
    async def test_select_profile_updates_client_mapping(self, adapter):
        with patch.object(adapter, "_resolve_profile_home", return_value=Path("/tmp/.hermes/profiles/coder")):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.post(
                    "/api/profiles/session/select",
                    json={"clientId": "client-1", "profile": "coder"},
                )
                assert resp.status == 200
                assert adapter._selected_profiles["client-1"] == "coder"
                assert resp.headers["X-Hermes-Profile"] == "coder"

    @pytest.mark.asyncio
    async def test_lists_runtime_status(self, adapter):
        worker_status = [{
            "profile": "coder",
            "home": "/tmp/.hermes/profiles/coder",
            "running": True,
            "pid": 12345,
            "pendingRequests": 1,
        }]
        with patch.object(adapter._profile_runtime_manager, "status", return_value=worker_status):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.get("/api/profiles/runtimes")
                assert resp.status == 200
                data = await resp.json()
                assert data["total"] == 2
                assert data["runtimes"][1]["profile"] == "coder"
                assert data["runtimes"][1]["mode"] == "worker"


# ---------------------------------------------------------------------------
# GET /api/config
# ---------------------------------------------------------------------------


class TestGetConfig:
    @pytest.mark.asyncio
    async def test_returns_config(self, adapter):
        mock_config = {"model": "test-model", "provider": "test-provider"}
        mock_env = {"ANTHROPIC_API_KEY": "sk-ant-1234567890abcdef"}

        with (
            patch("hermes_cli.config.load_config", return_value=mock_config),
            patch("hermes_cli.config.load_env", return_value=mock_env),
            patch("hermes_cli.config.OPTIONAL_ENV_VARS", {
                "ANTHROPIC_API_KEY": {"category": "provider", "password": True},
            }),
        ):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.get("/api/config")
                assert resp.status == 200
                data = await resp.json()
                assert data["activeModel"] == "test-model"
                assert data["activeProvider"] == "test-provider"
                assert "hermesHome" in data
                assert isinstance(data["providers"], list)

    @pytest.mark.asyncio
    async def test_routes_non_host_profile_to_worker(self, adapter):
        adapter._selected_profiles["client-a"] = "coder"
        payload = {
            "config": {"model": "worker-model"},
            "activeModel": "worker-model",
            "activeProvider": "worker-provider",
            "hermesHome": "/tmp/.hermes/profiles/coder",
            "hasApiKeys": False,
            "providers": [],
        }
        with patch.object(adapter, "_worker_call", new_callable=AsyncMock) as mock_worker:
            mock_worker.return_value = payload
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.get("/api/config", headers={"X-Hermes-Client-Id": "client-a"})
                assert resp.status == 200
                data = await resp.json()
                assert data["activeModel"] == "worker-model"
                mock_worker.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_masks_api_keys(self, adapter):
        mock_env = {"MY_KEY": "sk-secret-1234567890abcdef"}

        with (
            patch("hermes_cli.config.load_config", return_value={"model": "m"}),
            patch("hermes_cli.config.load_env", return_value=mock_env),
            patch("hermes_cli.config.OPTIONAL_ENV_VARS", {
                "MY_KEY": {"category": "provider", "password": True},
            }),
        ):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.get("/api/config")
                data = await resp.json()
                prov = data["providers"][0]
                assert prov["configured"] is True
                assert "sk-secret-1234567890abcdef" not in prov["maskedKey"]
                assert prov["maskedKey"].startswith("sk-s")


# ---------------------------------------------------------------------------
# PATCH /api/config
# ---------------------------------------------------------------------------


class TestPatchConfig:
    @pytest.mark.asyncio
    async def test_saves_config(self, adapter):
        existing = {"model": "old", "provider": "old"}

        with (
            patch("hermes_cli.config.load_config", return_value=existing),
            patch("hermes_cli.config.save_config") as mock_save,
        ):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.patch(
                    "/api/config",
                    json={"config": {"model": "new-model"}},
                )
                assert resp.status == 200
                data = await resp.json()
                assert data["ok"] is True
                mock_save.assert_called_once()
                saved = mock_save.call_args[0][0]
                assert saved["model"] == "new-model"

    @pytest.mark.asyncio
    async def test_saves_env_values(self, adapter):
        with (
            patch("hermes_cli.config.save_env_value") as mock_save_env,
        ):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.patch(
                    "/api/config",
                    json={"env": {"MY_API_KEY": "sk-new-key"}},
                )
                assert resp.status == 200
                mock_save_env.assert_called_once_with("MY_API_KEY", "sk-new-key")

    @pytest.mark.asyncio
    async def test_routes_patch_config_to_worker(self, adapter):
        adapter._selected_profiles["client-a"] = "coder"
        with patch.object(adapter, "_worker_call", new_callable=AsyncMock) as mock_worker:
            mock_worker.return_value = {"ok": True, "message": "Config updated", "restartRequired": False}
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.patch(
                    "/api/config",
                    headers={"X-Hermes-Client-Id": "client-a"},
                    json={"config": {"model": "worker-model"}},
                )
                assert resp.status == 200
                mock_worker.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_invalid_json(self, adapter):
        app = _create_app(adapter)
        async with TestClient(TestServer(app)) as cli:
            resp = await cli.patch(
                "/api/config",
                data=b"not json",
                headers={"Content-Type": "application/json"},
            )
            assert resp.status == 400


# ---------------------------------------------------------------------------
# GET /api/providers
# ---------------------------------------------------------------------------


class TestProviders:
    @pytest.mark.asyncio
    async def test_returns_providers(self, adapter):
        mock_providers = [
            {"slug": "anthropic", "name": "Anthropic", "models": ["claude-sonnet-4"], "is_current": True},
        ]

        with (
            patch("hermes_cli.config.load_config", return_value={"model": "m", "provider": "anthropic"}),
            patch("hermes_cli.model_switch.list_authenticated_providers", return_value=mock_providers),
        ):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.get("/api/providers")
                assert resp.status == 200
                data = await resp.json()
                assert data["currentProvider"] == "anthropic"
                assert len(data["providers"]) == 1
                assert data["providers"][0]["slug"] == "anthropic"


# ---------------------------------------------------------------------------
# POST /api/model-switch
# ---------------------------------------------------------------------------


class TestModelSwitch:
    @pytest.mark.asyncio
    async def test_successful_switch(self, adapter):
        from hermes_cli.model_switch import ModelSwitchResult

        mock_result = ModelSwitchResult(
            success=True,
            new_model="gpt-4.1",
            target_provider="openai",
            provider_label="OpenAI",
            base_url="https://api.openai.com/v1",
            api_key="sk-key",
            is_global=False,
        )

        with (
            patch("hermes_cli.config.load_config", return_value={"model": "old", "provider": "old"}),
            patch("hermes_cli.model_switch.switch_model", return_value=mock_result),
        ):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.post(
                    "/api/model-switch",
                    json={"model": "gpt-4.1", "provider": "openai"},
                )
                assert resp.status == 200
                data = await resp.json()
                assert data["ok"] is True
                assert data["model"] == "gpt-4.1"
                assert data["provider"] == "openai"
                assert data["hasCredentials"] is True

    @pytest.mark.asyncio
    async def test_failed_switch(self, adapter):
        from hermes_cli.model_switch import ModelSwitchResult

        mock_result = ModelSwitchResult(
            success=False,
            error_message="Unknown provider 'nope'",
        )

        with (
            patch("hermes_cli.config.load_config", return_value={"model": "m", "provider": "p"}),
            patch("hermes_cli.model_switch.switch_model", return_value=mock_result),
        ):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.post(
                    "/api/model-switch",
                    json={"model": "bad", "provider": "nope"},
                )
                assert resp.status == 422
                data = await resp.json()
                assert data["ok"] is False

    @pytest.mark.asyncio
    async def test_empty_body(self, adapter):
        app = _create_app(adapter)
        async with TestClient(TestServer(app)) as cli:
            resp = await cli.post("/api/model-switch", json={})
            assert resp.status == 400


# ---------------------------------------------------------------------------
# GET /api/skills
# ---------------------------------------------------------------------------


class TestSkills:
    @pytest.mark.asyncio
    async def test_returns_skills(self, adapter):
        mock_skills = [
            {
                "trigger": "/web-search",
                "name": "web-search",
                "description": "Search the web",
                "path": "/home/.hermes/skills/web-search",
                "dirName": "web-search",
                "enabled": True,
                "category": "",
                "author": "",
                "tags": [],
                "emoji": "",
            },
        ]

        with patch("gateway.platforms.api_extensions._list_skills_enriched", return_value=mock_skills):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.get("/api/skills")
                assert resp.status == 200
                data = await resp.json()
                assert data["total"] == 1
                assert data["skills"][0]["name"] == "web-search"
                assert data["skills"][0]["trigger"] == "/web-search"


# ---------------------------------------------------------------------------
# GET /api/memory
# ---------------------------------------------------------------------------


class TestMemory:
    @pytest.mark.asyncio
    async def test_returns_memory_files(self, adapter, tmp_path, monkeypatch):
        memory_dir = tmp_path / "hermes_test" / "memory"
        memory_dir.mkdir(parents=True)
        (memory_dir / "notes.md").write_text("hello")
        (memory_dir / "prefs.md").write_text("world")

        monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes_test"))

        app = _create_app(adapter)
        async with TestClient(TestServer(app)) as cli:
            resp = await cli.get("/api/memory")
            assert resp.status == 200
            data = await resp.json()
            assert data["total"] == 2
            names = {f["name"] for f in data["files"]}
            assert "notes.md" in names
            assert "prefs.md" in names

    @pytest.mark.asyncio
    async def test_empty_memory_dir(self, adapter, tmp_path, monkeypatch):
        hermes_home = tmp_path / "hermes_empty"
        hermes_home.mkdir()
        monkeypatch.setenv("HERMES_HOME", str(hermes_home))

        app = _create_app(adapter)
        async with TestClient(TestServer(app)) as cli:
            resp = await cli.get("/api/memory")
            assert resp.status == 200
            data = await resp.json()
            assert data["total"] == 0
            assert data["files"] == []

    @pytest.mark.asyncio
    async def test_routes_memory_to_worker(self, adapter):
        adapter._selected_profiles["client-a"] = "coder"
        with patch.object(adapter, "_worker_call", new_callable=AsyncMock) as mock_worker:
            mock_worker.return_value = {"files": [{"name": "prefs.md"}], "total": 1}
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.get("/api/memory", headers={"X-Hermes-Client-Id": "client-a"})
                assert resp.status == 200
                data = await resp.json()
                assert data["files"][0]["name"] == "prefs.md"
                mock_worker.assert_awaited_once()


# ---------------------------------------------------------------------------
# GET /api/mcp/servers
# ---------------------------------------------------------------------------


class TestMcpServers:
    @pytest.mark.asyncio
    async def test_returns_stdio_server(self, adapter):
        mock_config = {
            "mcp_servers": {
                "filesystem": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
                    "timeout": 30,
                },
            },
        }

        with patch("hermes_cli.config.load_config", return_value=mock_config):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.get("/api/mcp/servers")
                assert resp.status == 200
                data = await resp.json()
                assert data["total"] == 1
                srv = data["servers"][0]
                assert srv["name"] == "filesystem"
                assert srv["transport"] == "stdio"
                assert srv["command"] == "npx"
                assert srv["timeout"] == 30

    @pytest.mark.asyncio
    async def test_returns_http_server(self, adapter):
        mock_config = {
            "mcp_servers": {
                "remote": {
                    "url": "https://mcp.example.com",
                    "headers": {"Authorization": "Bearer tok"},
                },
            },
        }

        with patch("hermes_cli.config.load_config", return_value=mock_config):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.get("/api/mcp/servers")
                data = await resp.json()
                assert data["total"] == 1
                srv = data["servers"][0]
                assert srv["transport"] == "http"
                assert srv["url"] == "https://mcp.example.com"

    @pytest.mark.asyncio
    async def test_no_mcp_servers(self, adapter):
        with patch("hermes_cli.config.load_config", return_value={}):
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.get("/api/mcp/servers")
                data = await resp.json()
                assert data["total"] == 0
                assert data["servers"] == []


# ---------------------------------------------------------------------------
# Auth enforcement
# ---------------------------------------------------------------------------


class TestAuthEnforcement:
    """All extension endpoints must return 401 when API key is set but not provided."""

    ENDPOINTS = [
        ("GET", "/api/capabilities"),
        ("GET", "/api/config"),
        ("GET", "/api/providers"),
        ("GET", "/api/skills"),
        ("GET", "/api/memory"),
        ("GET", "/api/mcp/servers"),
    ]

    @pytest.mark.asyncio
    @pytest.mark.parametrize("method,path", ENDPOINTS)
    async def test_returns_401_without_key(self, auth_adapter, method, path):
        app = _create_app(auth_adapter)
        async with TestClient(TestServer(app)) as cli:
            if method == "GET":
                resp = await cli.get(path)
            elif method == "PATCH":
                resp = await cli.patch(path, json={})
            elif method == "POST":
                resp = await cli.post(path, json={})
            assert resp.status == 401

    @pytest.mark.asyncio
    async def test_patch_config_returns_401(self, auth_adapter):
        app = _create_app(auth_adapter)
        async with TestClient(TestServer(app)) as cli:
            resp = await cli.patch("/api/config", json={})
            assert resp.status == 401

    @pytest.mark.asyncio
    async def test_model_switch_returns_401(self, auth_adapter):
        app = _create_app(auth_adapter)
        async with TestClient(TestServer(app)) as cli:
            resp = await cli.post("/api/model-switch", json={"model": "x"})
            assert resp.status == 401


# ---------------------------------------------------------------------------
# Extended chat routing
# ---------------------------------------------------------------------------


class TestExtendedChatRouting:
    @pytest.mark.asyncio
    async def test_non_host_profile_chat_uses_worker(self, adapter):
        adapter._selected_profiles["client-a"] = "coder"
        with patch.object(adapter, "_worker_call", new_callable=AsyncMock) as mock_worker:
            mock_worker.return_value = {
                "result": {
                    "final_response": "Worker response",
                    "messages": [{"role": "assistant", "content": "Worker response"}],
                },
                "usage": {"input_tokens": 1, "output_tokens": 2, "total_tokens": 3},
            }
            app = _create_app(adapter)
            async with TestClient(TestServer(app)) as cli:
                resp = await cli.post(
                    "/api/v1/chat/completions",
                    headers={"X-Hermes-Client-Id": "client-a"},
                    json={"messages": [{"role": "user", "content": "hi"}]},
                )
                assert resp.status == 200
                data = await resp.json()
                assert data["choices"][0]["message"]["content"] == "Worker response"
                assert resp.headers["X-Hermes-Profile"] == "coder"
                mock_worker.assert_awaited_once()
