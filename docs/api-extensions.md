# Hermes API Extensions — Architecture & Reference

Non-invasive extension layer for the built-in `api_server` gateway platform.
Adds configuration, provider management, model switching, skills, memory,
and MCP endpoints on top of the existing OpenAI-compatible HTTP server.

## Design Principles

1. **Single extension file** — all new routes live in `gateway/platforms/api_extensions.py`
2. **One hook in upstream** — 4 lines added to `api_server.py` (try/except import)
3. **No logic duplication** — every endpoint delegates to existing hermes-cli functions
4. **Graceful absence** — if the extension file is missing, hermes works as stock upstream
5. **Same auth & CORS** — reuses `adapter._check_auth()` and `cors_middleware`

## File Layout

```
gateway/platforms/
├── api_server.py          # upstream file (4 lines added at route setup)
├── api_extensions.py      # NEW — all config/setup routes
└── base.py                # upstream — unchanged

tests/gateway/
└── test_api_extensions.py  # NEW — isolated test file
```

## Hook in api_server.py

In `APIServerAdapter.connect()`, after all upstream `router.add_*` calls:

```python
# Extension point: additional routes (config, skills, etc.)
try:
    from gateway.platforms.api_extensions import register_routes
    register_routes(self._app, self)
except ImportError:
    pass
```

This is the **only** modification to an upstream file. The `ImportError` guard
ensures stock hermes-agent works identically if `api_extensions.py` is absent.

## Endpoints

### GET /api/capabilities

Single-request replacement for capability probing. Returns what the server supports.

**Response:**

```json
{
  "version": "0.9.1",
  "platform": "hermes-agent",
  "capabilities": {
    "config": true,
    "models": true,
    "skills": true,
    "memory": true,
    "mcp": true,
    "jobs": true,
    "modelSwitch": true,
    "chat": true,
    "streaming": true
  }
}
```

**Hermes functions used:** none (introspects adapter state and module availability)

---

### GET /api/config

Read current configuration, active model/provider, env var presence (masked).

**Response:**

```json
{
  "config": { "...full config.yaml as dict..." },
  "activeModel": "anthropic/claude-sonnet-4-20250514",
  "activeProvider": "anthropic",
  "hermesHome": "/Users/user/.hermes",
  "hasApiKeys": true,
  "providers": [
    {
      "id": "anthropic",
      "name": "Anthropic",
      "configured": true,
      "maskedKey": "sk-a...7x2f"
    }
  ]
}
```

**Hermes functions used:**

- `hermes_cli.config.load_config()` — reads `~/.hermes/config.yaml` with defaults, migration, normalization
- `hermes_cli.config.load_env()` — reads `~/.hermes/.env` key-value pairs
- Key masking: show first 4 + last 4 chars only

---

### PATCH /api/config

Write configuration changes. Supports both config.yaml keys and .env variables.

**Request body:**

```json
{
  "config": {
    "model": "claude-sonnet-4-20250514",
    "provider": "anthropic"
  },
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Config updated",
  "restartRequired": false
}
```

**Hermes functions used:**

- `hermes_cli.config.load_config()` + `hermes_cli.config.save_config()` — atomic YAML write with validation
- `hermes_cli.config.save_env_value(key, value)` — atomic .env write with sanitization, also sets `os.environ[key]`

**Important:** `save_env_value()` already calls `os.environ[key] = value`, so API keys
become available to the running process immediately without restart.
`save_config()` uses `atomic_yaml_write` (write to temp + fsync + os.replace)
so the config file is never truncated on crash.

---

### GET /api/providers

List all known providers with authentication status and available models.

**Response:**

```json
{
  "providers": [
    {
      "id": "anthropic",
      "label": "Anthropic",
      "authenticated": true,
      "models": [
        {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4"},
        {"id": "claude-opus-4-20250514", "name": "Claude Opus 4"}
      ],
      "authType": "api_key",
      "source": "env"
    }
  ],
  "currentProvider": "anthropic",
  "currentModel": "claude-sonnet-4-20250514"
}
```

**Hermes functions used:**

- `hermes_cli.model_switch.list_authenticated_providers()` — scans env vars, auth store, config for all providers with valid credentials; returns provider dicts with model lists

---

### POST /api/model-switch

Switch model and/or provider at runtime. No restart required.

**Request body:**

```json
{
  "model": "gpt-4.1",
  "provider": "openai"
}
```

**Response:**

```json
{
  "ok": true,
  "model": "gpt-4.1",
  "provider": "openai",
  "baseUrl": "https://api.openai.com/v1",
  "hasCredentials": true,
  "warning": null
}
```

**Hermes functions used:**

- `hermes_cli.model_switch.resolve_alias(query)` — resolves aliases, direct aliases from config, models.dev catalog
- `hermes_cli.model_switch.resolve_model_switch(...)` — full pipeline: parse flags, resolve provider, resolve credentials, normalize model name, metadata lookup
- Result is a `ModelSwitchResult` dataclass with all fields needed to update the adapter's active model

**Runtime application:** after successful resolution, updates `adapter._model_name`
and any relevant state so subsequent `/v1/chat/completions` requests use the new model.

---

### GET /api/skills

List installed and available skills.

**Response:**

```json
{
  "skills": [
    {
      "name": "web-search",
      "path": "/Users/user/.hermes/skills/web-search",
      "installed": true,
      "triggers": ["/web-search"]
    }
  ]
}
```

**Hermes functions used:**

- Scans `get_hermes_home() / "skills/"` directory
- Uses pattern from `agent/skill_commands.py` to read skill metadata

---

### GET /api/memory

List memory files.

**Response:**

```json
{
  "files": [
    {
      "name": "user-preferences.md",
      "path": "user-preferences.md",
      "size": 1234,
      "modified": "2026-04-10T14:30:00Z"
    }
  ]
}
```

**Hermes functions used:**

- Scans `get_hermes_home() / "memory/"` directory
- Returns file metadata (name, size, mtime)

---

### GET /api/mcp/servers

List configured MCP servers from config.yaml.

**Response:**

```json
{
  "servers": [
    {
      "name": "filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "timeout": 30
    }
  ]
}
```

**Hermes functions used:**

- `hermes_cli.config.load_config()` — reads `mcp_servers` section
- Normalizes server entries (stdio vs http transport detection)

---

## Authentication

All endpoints use the same auth mechanism as `/v1/chat/completions`:

```python
auth_err = adapter._check_auth(request)
if auth_err:
    return auth_err
```

- If `API_SERVER_KEY` is set: requires `Authorization: Bearer <key>` header
- If no key is configured: all requests accepted (with warning at startup)
- Network-accessible binding (non-127.0.0.1) refuses to start without a key

## Upstream Merge Compatibility

| Scenario | Impact | Action |
|----------|--------|--------|
| upstream changes route setup in `api_server.py` | Our 4-line block shifts with surrounding code | Resolve trivial merge conflict (block is self-contained) |
| upstream adds `/api/config` natively | Our extension shadows it | Remove our `/api/config` from `api_extensions.py`, use upstream |
| upstream removes `api_server.py` | Extension file never loads | Delete `api_extensions.py` (or adapt to new architecture) |
| upstream adds extension/plugin mechanism | Our hook becomes redundant | Migrate routes to upstream plugin format, remove hook |

## Key Hermes Internals Used

### Config system (`hermes_cli/config.py`)

- `get_hermes_home()` — returns `HERMES_HOME` env var or `~/.hermes`; profile-aware
- `load_config()` — deep-merge `DEFAULT_CONFIG` + user YAML, normalize, expand env vars, migrate
- `save_config(config)` — atomic YAML write via `atomic_yaml_write()`, respects managed mode
- `load_env()` — parse `~/.hermes/.env` into dict
- `save_env_value(key, value)` — atomic .env update, also sets `os.environ[key]`
- `OPTIONAL_ENV_VARS` — dict of known env vars with metadata (description, category, url)

### Model switching (`hermes_cli/model_switch.py`)

- `resolve_alias(query)` — alias resolution chain (direct aliases → models.dev catalog)
- `resolve_model_switch(model, provider, ...)` — full pipeline returning `ModelSwitchResult`
- `list_authenticated_providers(...)` — scans all credential sources, returns provider+model lists
- `ModelSwitchResult` — dataclass: model, provider, base_url, api_key, api_mode, display_name, warning

### Auth (`hermes_cli/auth.py`)

- `resolve_provider(requested)` — determine which provider to use
- Auth store: `~/.hermes/auth-profiles.json` — OAuth tokens, CLI tokens

### Skills (`agent/skill_commands.py`)

- Scans `get_hermes_home() / "skills/"` for skill directories
- Each skill has a trigger file and content files

### Profiles (`hermes_constants`)

- `get_hermes_home()` — always use this, never hardcode `~/.hermes`
- `display_hermes_home()` — user-facing path display
- Profile override happens before any module imports via `_apply_profile_override()`
