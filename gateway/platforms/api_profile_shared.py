"""Shared helpers for multi-profile API server support."""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def mask_key(key: str) -> str:
    """Mask an API key for safe display."""
    if not key or len(key) < 12:
        return "***"
    return f"{key[:4]}...{key[-4:]}"


def extract_active_model(config: Dict[str, Any]) -> tuple[str, str]:
    """Extract active model and provider from config dict."""
    model_field = config.get("model", "")
    top_level_provider = str(config.get("provider", "") or "")
    if isinstance(model_field, dict):
        active_model = str(model_field.get("default", "") or "")
        active_provider = top_level_provider or str(model_field.get("provider", "") or "")
    else:
        active_model = str(model_field or "")
        active_provider = top_level_provider
    return active_model, active_provider


def deep_merge(base: dict, override: dict) -> dict:
    """Deep-merge override into base, modifying base in place.

    A ``None`` value in *override* deletes the corresponding key from
    *base* (JSON Merge Patch semantics, RFC 7396).
    """
    for key, value in override.items():
        if value is None:
            base.pop(key, None)
        elif (
            key in base
            and isinstance(base[key], dict)
            and isinstance(value, dict)
        ):
            deep_merge(base[key], value)
        else:
            base[key] = value
    return base


def oauth_request_device_code(provider: str) -> Dict[str, Any]:
    """Request a device code for the given OAuth provider."""
    import httpx

    if provider == "nous":
        from hermes_cli.auth import (
            PROVIDER_REGISTRY,
            _request_device_code,
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


def oauth_poll_token(provider: str, device_code: str, extra: Dict[str, Any]) -> Dict[str, Any]:
    """Single poll attempt for token readiness. Returns status dict."""
    import httpx

    if provider == "nous":
        from hermes_cli.auth import (
            PROVIDER_REGISTRY,
            _load_auth_store,
            _save_auth_store,
            refresh_nous_oauth_from_state,
        )

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
                    auth_state,
                    min_key_ttl_seconds=300,
                    timeout_seconds=15.0,
                    force_refresh=False,
                    force_mint=True,
                )
            except Exception as exc:
                logger.warning("[api_profile_shared] Nous agent key mint failed: %s", exc)

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

    from hermes_cli.auth import CODEX_OAUTH_CLIENT_ID, CODEX_OAUTH_TOKEN_URL, _load_auth_store, _save_auth_store

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
