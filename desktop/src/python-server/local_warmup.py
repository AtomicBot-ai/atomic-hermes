"""Desktop-only OpenAI-compatible warmup (KV / cold start).

Uses the same layered Hermes system prompt as ``AIAgent._build_system_prompt`` and the
same OpenAI ``tools`` list as the live agent when ``run_agent`` can be initialized
(desktop parity — local servers expand tools into the chat template).
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx

logger = logging.getLogger("hermes.desktop.warmup")

_LOCAL_HOST_NAMES = frozenset(
    {
        "localhost",
        "127.0.0.1",
        "::1",
        "0.0.0.0",
    }
)
_CONTAINER_SUFFIXES = (".local", "host.docker.internal", "host.containers.internal")


def is_local_base_url(base_url: str) -> bool:
    """Return True if URL host is loopback, RFC1918, link-local, or common dev DNS."""
    if not base_url or not isinstance(base_url, str):
        return False
    raw = base_url.strip()
    if not raw:
        return False
    if "://" not in raw:
        raw = "http://" + raw
    try:
        parsed = urlparse(raw)
    except Exception:
        return False
    host = (parsed.hostname or "").lower()
    if not host:
        return False
    if host in _LOCAL_HOST_NAMES:
        return True
    if any(host.endswith(suffix) for suffix in _CONTAINER_SUFFIXES):
        return True
    try:
        addr = ipaddress.ip_address(host)
        return bool(addr.is_private or addr.is_loopback or addr.is_link_local)
    except ValueError:
        pass
    parts = host.split(".")
    if len(parts) == 4 and all(p.isdigit() for p in parts):
        a, b, c, d = (int(p) for p in parts)
        if a == 10:
            return True
        if a == 172 and 16 <= b <= 31:
            return True
        if a == 192 and b == 168:
            return True
    return False


def _try_warmup_agent_openai_parts(
    *,
    model: str,
    base_url: str,
    api_key: str,
    ephemeral_system_prompt: Optional[str] = None,
    agent_alignment: str = "auto",
) -> Tuple[Optional[str], Optional[List[Dict[str, Any]]], Dict[str, Any], Optional[str], str]:
    """Build Hermes system text and OpenAI ``tools`` using the shared warmup agent factory.

    Returns (system_prompt, tools_or_none, openai_extras, error, wire_model).
    """
    try:
        from agent.local_llm_warmup import build_desktop_openai_warmup_agent, merge_ephemeral_into_core_system
    except Exception as exc:
        return None, None, {}, f"import:{exc}", model

    base = (base_url or "").strip()
    if not base:
        return None, None, {}, "missing_base_url", model

    try:
        agent = build_desktop_openai_warmup_agent(
            model=model,
            base_url=base,
            api_key=api_key,
            ephemeral_system_prompt=ephemeral_system_prompt,
            agent_alignment=agent_alignment,
        )
        wire_model = str(getattr(agent, "model", None) or model).strip() or model
        text = agent._build_system_prompt(None)
        text = merge_ephemeral_into_core_system(agent, text)
        if not (text or "").strip():
            return None, None, {}, "empty_system_prompt", wire_model
        raw_tools = getattr(agent, "tools", None) or []
        tools_payload: Optional[List[Dict[str, Any]]] = (
            list(raw_tools) if isinstance(raw_tools, list) and len(raw_tools) > 0 else None
        )
        if tools_payload is not None:
            tools_payload = _sort_openai_tools_for_local_kv(tools_payload)

        openai_extras: Dict[str, Any] = {}
        if getattr(agent, "max_tokens", None) is not None:
            openai_extras.update(agent._max_tokens_param(agent.max_tokens))
        return text.strip(), tools_payload, openai_extras, None, wire_model
    except Exception as exc:
        logger.warning("warmup: Hermes system prompt assembly failed: %s", exc)
        return None, None, {}, str(exc), model


def build_desktop_warmup_chat_bundle(
    *,
    model: str,
    base_url: str,
    api_key: str,
    ephemeral_system_prompt: Optional[str] = None,
    agent_alignment: str = "auto",
) -> Tuple[List[Dict[str, Any]], Optional[List[Dict[str, Any]]], Dict[str, Any], str]:
    """OpenAI-style messages plus optional ``tools`` for warmup (matches first agent API call)."""
    sys_text, tools, openai_extras, err, wire_model = _try_warmup_agent_openai_parts(
        model=model,
        base_url=base_url,
        api_key=api_key,
        ephemeral_system_prompt=ephemeral_system_prompt,
        agent_alignment=agent_alignment,
    )
    if sys_text:
        _role = "system"
        try:
            from agent.prompt_builder import DEVELOPER_ROLE_MODELS
            _ml = (wire_model or model or "").lower()
            if any(p in _ml for p in DEVELOPER_ROLE_MODELS):
                _role = "developer"
        except Exception:
            pass
        return (
            [
                {"role": _role, "content": sys_text.strip()},
                {"role": "user", "content": "."},
            ],
            tools,
            openai_extras,
            wire_model,
        )
    return ([{"role": "user", "content": "warmup"}], None, {}, model)


def warmup_fingerprint(base_url: str, model: str) -> str:
    norm = base_url.rstrip("/").lower()
    return f"{norm}\x00{model.strip()}"


def warmup_dedup_key(base_url: str, model: str, warmup_mode: str) -> str:
    """Process-local dedup bucket: core/minimal/engine vs full must not alias.

    For full warmup, model is canonicalised (``llamacpp/X`` → ``X``) so that
    concurrent/sequential calls with different prefixes share a single dedup slot.
    """
    m = (warmup_mode or "full").strip().lower()
    bucket = "core" if m in ("core", "minimal", "engine") else "full"
    dedup_model = _canonical_model_for_dedup(model) if bucket == "full" else model
    return f"{warmup_fingerprint(base_url, dedup_model)}\x00{bucket}"


def normalize_llamacpp_openai_model_id(model: str) -> str:
    """Strip ``llamacpp/`` prefix — used only for core engine pokes, NOT full warmup."""
    m = (model or "").strip()
    if m.lower().startswith("llamacpp/"):
        return m.split("/", 1)[-1].strip()
    return m


def chat_completions_endpoint(base_url: str) -> str:
    b = base_url.rstrip("/")
    if b.endswith("/v1"):
        return f"{b}/chat/completions"
    return f"{b}/v1/chat/completions"


def openai_api_prefix_candidates(base_url: str) -> list[str]:
    """Return /v1 or /api/v1 style prefixes to probe with GET .../models."""
    raw = (base_url or "").strip()
    if not raw:
        return []
    if "://" not in raw:
        raw = "http://" + raw
    try:
        parsed = urlparse(raw)
    except Exception:
        return []
    origin = f"{parsed.scheme}://{parsed.netloc}"
    path = (parsed.path or "").rstrip("/")
    out: list[str] = []
    if path.endswith("/api/v1"):
        out.append(f"{origin}{path}")
    elif path.endswith("/v1") and not path.endswith("/api/v1"):
        out.append(f"{origin}{path}")
    out.append(f"{origin}/api/v1")
    out.append(f"{origin}/v1")
    seen: set[str] = set()
    deduped: list[str] = []
    for p in out:
        if p not in seen:
            seen.add(p)
            deduped.append(p)
    return deduped


async def resolve_chat_completions_post_url(
    client: httpx.AsyncClient,
    base_url: str,
) -> str:
    """Detect OpenAI mount prefix via GET /models (handles llama --api-prefix /api)."""
    for pfx in openai_api_prefix_candidates(base_url):
        try:
            r = await client.get(f"{pfx}/models", timeout=5.0)
            if r.status_code == 200:
                url = f"{pfx}/chat/completions"
                logger.info("warmup: resolved chat completions URL from probe: %s", url)
                return url
        except Exception as exc:
            logger.debug("warmup: probe %s/models: %s", pfx, exc)
            continue
    fb = chat_completions_endpoint(base_url)
    logger.warning("warmup: no /models probe matched; using fallback %s", fb)
    return fb


def _read_config_yaml() -> Dict[str, Any]:
    try:
        from hermes_constants import get_hermes_home
        import yaml

        path = get_hermes_home() / "config.yaml"
        if not path.exists():
            return {}
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception as exc:
        logger.debug("warmup: could not read config.yaml: %s", exc)
        return {}


def resolve_warmup_target(body: Dict[str, Any]) -> Optional[Tuple[str, str, str]]:
    """Returns (base_url, model, api_key) or None if warmup should not run."""
    b_url = (body.get("base_url") or "").strip()
    model = (body.get("model") or "").strip()
    api_key = (body.get("api_key") or "").strip()

    if b_url and model:
        if not is_local_base_url(b_url):
            logger.info("warmup: explicit base_url is not local, skip")
            return None
        return (b_url, model, api_key)

    cfg = _read_config_yaml()
    m = cfg.get("model")
    if not isinstance(m, dict):
        return None
    provider = str(m.get("provider") or "").strip().lower()
    base_url = str(m.get("base_url") or "").strip()
    model_name = str(m.get("default") or m.get("model") or "").strip()
    key = str(m.get("api_key") or "").strip()

    if provider != "custom" or not base_url or not model_name:
        return None
    if not is_local_base_url(base_url):
        logger.info("warmup: config base_url is not local, skip")
        return None
    return (base_url, model_name, key)


_warmed_fingerprints: set[str] = set()
_full_warmup_locks: Dict[str, asyncio.Lock] = {}


def _canonical_model_for_dedup(model: str) -> str:
    """Collapse ``llamacpp/X`` and ``X`` into one dedup bucket."""
    m = (model or "").strip()
    if m.lower().startswith("llamacpp/"):
        return m.split("/", 1)[-1].strip()
    return m


def _full_warmup_lock(base_url: str) -> asyncio.Lock:
    """Per-base_url asyncio lock so concurrent full warmups serialise."""
    key = (base_url or "").rstrip("/").lower()
    if key not in _full_warmup_locks:
        _full_warmup_locks[key] = asyncio.Lock()
    return _full_warmup_locks[key]


def _sort_openai_tools_for_local_kv(tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deterministic tool array order (llama.cpp KV prefix is sensitive to JSON ordering)."""

    def _name(t: Any) -> str:
        if not isinstance(t, dict):
            return ""
        fn = t.get("function")
        if isinstance(fn, dict):
            return str(fn.get("name") or "")
        return ""

    return sorted(tools, key=_name)


def clear_warmup_dedup_cache() -> None:
    """Test helper: reset process-level dedup state."""
    _warmed_fingerprints.clear()


def _delta_has_generating_text(delta: Any) -> bool:
    """True if the streaming delta carries visible text (content, reasoning, etc.)."""
    if not isinstance(delta, dict):
        return False
    skip_keys = frozenset({"role", "tool_calls", "function_call"})
    for key, val in delta.items():
        if key in skip_keys:
            continue
        if isinstance(val, str) and val.strip():
            return True
        if isinstance(val, list) and len(val) > 0:
            return True
    return False


async def nonstream_warmup_ping(
    client: httpx.AsyncClient,
    chat_url: str,
    model: str,
    api_key: str,
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]] = None,
    openai_extras: Optional[Dict[str, Any]] = None,
) -> bool:
    """Fallback when streaming yields no parseable token (some servers / templates)."""
    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
    }
    if tools:
        payload["tools"] = tools
    if openai_extras:
        payload.update(openai_extras)
    if "max_tokens" not in payload and "max_completion_tokens" not in payload:
        payload["max_tokens"] = 1
    resp = await client.post(chat_url, headers=headers, json=payload)
    if resp.status_code >= 400:
        text = resp.text[:500]
        raise RuntimeError(f"warmup HTTP {resp.status_code} (non-stream): {text}")
    obj = resp.json()
    choices = obj.get("choices") or []
    if not choices:
        return False
    msg = (choices[0] or {}).get("message") or {}
    content = msg.get("content")
    if isinstance(content, str) and content.strip():
        return True
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict) and str(part.get("text", "")).strip():
                return True
    return False


async def stream_until_first_token(
    client: httpx.AsyncClient,
    chat_url: str,
    model: str,
    api_key: str,
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]] = None,
    openai_extras: Optional[Dict[str, Any]] = None,
) -> bool:
    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": True,
    }
    if tools:
        payload["tools"] = tools
    if openai_extras:
        payload.update(openai_extras)
    payload["stream"] = True
    payload["stream_options"] = {"include_usage": True}
    async with client.stream("POST", chat_url, headers=headers, json=payload) as resp:
        if resp.status_code >= 400:
            text = (await resp.aread()).decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"warmup HTTP {resp.status_code}: {text}")
        async for line in resp.aiter_lines():
            if not line:
                continue
            if line.startswith("data: "):
                chunk = line[6:].strip()
                if chunk == "[DONE]":
                    break
                try:
                    obj = json.loads(chunk)
                except json.JSONDecodeError:
                    continue
                choices = obj.get("choices") or []
                if not choices:
                    continue
                choice0 = choices[0] or {}
                delta = choice0.get("delta") or {}
                if _delta_has_generating_text(delta):
                    return True
    return False


async def _perform_core_engine_warmup(
    *,
    base_url: str,
    model: str,
    api_key: str,
) -> Dict[str, Any]:
    """Minimal poke: one tiny chat/completions call (no Hermes system/tools)."""
    max_attempts = 5
    delay_s = 3.0
    last_err: Optional[str] = None
    timeout = httpx.Timeout(180.0, connect=30.0)
    for attempt in range(1, max_attempts + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                chat_url = await resolve_chat_completions_post_url(client, base_url)
                ok = await stream_until_first_token(
                    client, chat_url, model, api_key,
                    [{"role": "user", "content": "."}], None, {},
                )
                if not ok:
                    ok = await nonstream_warmup_ping(
                        client, chat_url, model, api_key,
                        [{"role": "user", "content": "."}], None, {},
                    )
            if ok:
                return {"ok": True, "warmed": True, "mode": "core", "model": model, "base_url": base_url}
            last_err = "no token from stream or non-stream completion"
        except Exception as exc:
            last_err = str(exc)
            logger.warning("core warmup attempt %s/%s failed: %s", attempt, max_attempts, exc)
        if attempt < max_attempts:
            await asyncio.sleep(delay_s)
    return {"ok": False, "error": last_err or "core_warmup_failed", "mode": "core"}


async def perform_desktop_warmup(
    body: Dict[str, Any],
    *,
    agent_alignment: str = "auto",
) -> Dict[str, Any]:
    """Run a minimal streaming completion against a local OpenAI-compatible endpoint.

    ``agent_alignment``: ``desktop`` (Electron bridge), ``api_server`` (gateway), or ``auto``.
    """
    if os.environ.get("HERMES_DESKTOP_LOCAL_WARMUP", "1").strip().lower() in (
        "0", "false", "no", "off",
    ):
        return {"ok": True, "skipped": True, "reason": "disabled_by_env"}

    _wm = str(body.get("warmup_mode") or "").strip().lower()
    _legacy = str(body.get("mode") or "").strip().lower()
    if _wm:
        _mode = _wm
    elif _legacy in ("full", "core", "minimal", "engine"):
        _mode = _legacy
    else:
        _mode = "full"

    resolved = resolve_warmup_target(body)
    if not resolved:
        return {"ok": True, "skipped": True, "reason": "not_applicable"}

    base_url, model, api_key = resolved

    if _mode in ("core", "minimal", "engine"):
        model = normalize_llamacpp_openai_model_id(model)
        dk = warmup_dedup_key(base_url, model, _mode)
        fp = warmup_fingerprint(base_url, model)
        force = bool(body.get("force"))
        if force:
            _warmed_fingerprints.discard(dk)
        if dk in _warmed_fingerprints and not force:
            return {
                "ok": True, "skipped": True, "reason": "already_warmed",
                "fingerprint": fp, "dedup_key": dk,
                "model": model, "base_url": base_url, "mode": "core",
            }
        out = await _perform_core_engine_warmup(base_url=base_url, model=model, api_key=api_key)
        if out.get("ok") and out.get("warmed"):
            _warmed_fingerprints.add(dk)
        return out

    dk = warmup_dedup_key(base_url, model, "full")
    force = bool(body.get("force"))

    async with _full_warmup_lock(base_url):
        if force:
            _warmed_fingerprints.discard(dk)

        if dk in _warmed_fingerprints and not force:
            return {
                "ok": True, "skipped": True, "reason": "already_warmed",
                "fingerprint": warmup_fingerprint(base_url, model),
                "dedup_key": dk, "model": model, "base_url": base_url,
            }

        _ephem = (body.get("ephemeral_system_prompt") or "").strip() or None
        warmup_messages, warmup_tools, warmup_openai_extras, wire_model = build_desktop_warmup_chat_bundle(
            model=model, base_url=base_url, api_key=api_key,
            ephemeral_system_prompt=_ephem, agent_alignment=agent_alignment,
        )
        fp = warmup_fingerprint(base_url, model)

        max_attempts = 5
        delay_s = 3.0
        last_err: Optional[str] = None
        timeout = httpx.Timeout(180.0, connect=30.0)
        for attempt in range(1, max_attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    chat_url = await resolve_chat_completions_post_url(client, base_url)
                    got = await stream_until_first_token(
                        client, chat_url, wire_model, api_key,
                        warmup_messages, warmup_tools, warmup_openai_extras,
                    )
                    if not got:
                        got = await nonstream_warmup_ping(
                            client, chat_url, wire_model, api_key,
                            warmup_messages, warmup_tools, warmup_openai_extras,
                        )
                if got:
                    _warmed_fingerprints.add(dk)
                    return {
                        "ok": True, "warmed": True,
                        "fingerprint": fp, "dedup_key": dk,
                        "model": model, "base_url": base_url,
                    }
                last_err = "no token from stream or non-stream completion"
            except Exception as exc:
                last_err = str(exc)
                logger.warning("warmup attempt %s/%s failed: %s", attempt, max_attempts, exc)

            if attempt < max_attempts:
                await asyncio.sleep(delay_s)

        return {"ok": False, "error": last_err or "warmup_failed", "fingerprint": fp}
