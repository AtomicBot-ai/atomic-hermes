"""
Single construction path for desktop local-LLM warmup agents.

Avoids reverse-engineering: the same AIAgent wiring as ``APIServerAdapter._create_agent``
when ``API_SERVER_ENABLED`` is set (api_server toolsets + runtime kwargs), otherwise
the lightweight desktop bridge profile (``platform="desktop"``, no toolset filter).
"""

from __future__ import annotations

import os
from typing import Any, Optional


def build_desktop_openai_warmup_agent(
    *,
    model: str,
    base_url: str,
    api_key: str = "",
    ephemeral_system_prompt: Optional[str] = None,
    session_id: str = "__hermes_desktop_warmup__",
    agent_alignment: str = "auto",
) -> Any:
    """Return an ``AIAgent`` configured like the process that will run the first chat.

    ``agent_alignment`` selects which production profile to mirror:

    - ``"desktop"`` — always match ``desktop/src/python-server/server.py`` chat agents
      (``platform="desktop"``, full default toolsets).
    - ``"api_server"`` — match ``APIServerAdapter._create_agent`` when the gateway env
      gate is on; otherwise fall back to the desktop branch.
    - ``"auto"`` — legacy: use the gateway profile iff ``API_SERVER_ENABLED`` is truthy.
    """
    from run_agent import AIAgent

    eff_key = (api_key or "").strip() or "not-needed"
    base = (base_url or "").strip()

    _aa = (agent_alignment or "auto").strip().lower()
    _api_server_env = os.environ.get("API_SERVER_ENABLED", "").strip().lower() in (
        "1", "true", "yes", "on",
    )
    use_gateway_profile = _api_server_env and _aa != "desktop" and (
        _aa == "api_server" or _aa == "auto"
    )

    if use_gateway_profile:
        from gateway.run import GatewayRunner, _load_gateway_config, _resolve_runtime_agent_kwargs
        from hermes_cli.tools_config import _get_platform_tools

        runtime_kwargs = dict(_resolve_runtime_agent_kwargs())
        runtime_kwargs.pop("model", None)
        runtime_kwargs["base_url"] = base
        runtime_kwargs["api_key"] = eff_key

        user_config = _load_gateway_config()
        enabled_toolsets = sorted(_get_platform_tools(user_config, "api_server"))
        fallback_model = GatewayRunner._load_fallback_model()

        return AIAgent(
            model=model,
            **runtime_kwargs,
            max_iterations=int(os.getenv("HERMES_MAX_ITERATIONS", "90")),
            quiet_mode=True,
            verbose_logging=False,
            ephemeral_system_prompt=ephemeral_system_prompt or None,
            enabled_toolsets=enabled_toolsets,
            session_id=session_id,
            platform="api_server",
            fallback_model=fallback_model,
        )

    return AIAgent(
        model=model,
        base_url=base,
        api_key=eff_key,
        platform="desktop",
        session_id=session_id,
        quiet_mode=True,
        ephemeral_system_prompt=ephemeral_system_prompt or None,
    )


def merge_ephemeral_into_core_system(agent: Any, core_system: str) -> str:
    """Match ``run_conversation`` API-time merge of cached system + ephemeral prompt.

    For local endpoints the per-session routing metadata (Session seed UUID) is
    stripped so the system prompt stays byte-identical across chat sessions —
    preserving KV-prefix cache in llama.cpp and similar engines.
    """
    core = (core_system or "").strip()
    ep = getattr(agent, "ephemeral_system_prompt", None)
    if ep and str(ep).strip():
        _base = getattr(agent, "base_url", None) or ""
        if _base:
            from run_agent import is_local_endpoint, _strip_ephemeral_routing_for_local
            if is_local_endpoint(_base):
                ep = _strip_ephemeral_routing_for_local(str(ep))
        if ep and str(ep).strip():
            return (core + "\n\n" + str(ep).strip()).strip()
    return core
