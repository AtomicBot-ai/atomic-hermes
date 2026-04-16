"""Hermes Desktop WebSocket server — bridges Electron UI to AIAgent.

Spawned by Electron as a child process. Prints the listening port to
stdout so the main process can connect the renderer to it.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
import threading
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import Body, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Ensure hermes-agent source root is importable
_HERMES_ROOT = os.environ.get("HERMES_AGENT_ROOT", "")
if _HERMES_ROOT and _HERMES_ROOT not in sys.path:
    sys.path.insert(0, _HERMES_ROOT)

from bridge import (
    make_stream_delta_cb,
    make_thinking_cb,
    make_tool_progress_cb,
    make_step_cb,
    make_status_cb,
)
from local_warmup import perform_desktop_warmup

logger = logging.getLogger("hermes.desktop")

app = FastAPI(title="Hermes Desktop Bridge")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="hermes-agent")

# Per-session conversation history keyed by session_id
_sessions: Dict[str, list] = {}


def _load_env() -> None:
    """Load .env from HERMES_HOME."""
    try:
        from hermes_cli.env_loader import load_hermes_dotenv
        from hermes_constants import get_hermes_home
        load_hermes_dotenv(hermes_home=get_hermes_home())
    except Exception:
        logger.debug("Could not load hermes .env", exc_info=True)


def _build_agent(model: str = "", session_id: str = None, **kwargs):
    """Lazily import and construct AIAgent to avoid import-time side effects."""
    from run_agent import AIAgent
    return AIAgent(
        model=model,
        platform="desktop",
        session_id=session_id,
        quiet_mode=True,
        **kwargs,
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/config")
async def get_config():
    """Return current config and available models for the settings UI."""
    try:
        from hermes_constants import get_hermes_home
        import yaml

        hermes_home = get_hermes_home()
        config_path = hermes_home / "config.yaml"
        config = {}
        if config_path.exists():
            with open(config_path) as f:
                config = yaml.safe_load(f) or {}

        env_path = hermes_home / ".env"
        has_api_keys = env_path.exists() and env_path.stat().st_size > 10

        return {
            "config": config,
            "has_api_keys": has_api_keys,
            "hermes_home": str(hermes_home),
        }
    except Exception as e:
        return {"config": {}, "has_api_keys": False, "error": str(e)}


@app.post("/warmup")
async def post_warmup(body: Optional[Dict[str, Any]] = Body(default=None)):
    """Lightweight OpenAI-compatible warmup for local models (desktop only)."""
    payload = body if isinstance(body, dict) else {}
    try:
        return await perform_desktop_warmup(payload, agent_alignment="desktop")
    except Exception as exc:
        logger.exception("POST /warmup failed")
        return {"ok": False, "error": str(exc)}


@app.post("/api/warmup")
async def post_warmup_api_prefix(body: Optional[Dict[str, Any]] = Body(default=None)):
    """Alias for clients that only route /api/* to the bridge (same handler as POST /warmup)."""
    payload = body if isinstance(body, dict) else {}
    try:
        return await perform_desktop_warmup(payload, agent_alignment="desktop")
    except Exception as exc:
        logger.exception("POST /api/warmup failed")
        return {"ok": False, "error": str(exc)}


@app.post("/config")
async def save_config(body: dict):
    """Save config values and/or API keys."""
    try:
        from hermes_constants import get_hermes_home
        import yaml

        hermes_home = get_hermes_home()
        hermes_home.mkdir(parents=True, exist_ok=True)

        if "config" in body:
            config_path = hermes_home / "config.yaml"
            existing = {}
            if config_path.exists():
                with open(config_path) as f:
                    existing = yaml.safe_load(f) or {}
            existing.update(body["config"])
            with open(config_path, "w") as f:
                yaml.safe_dump(existing, f, default_flow_style=False)

        if "env" in body:
            env_path = hermes_home / ".env"
            existing_lines = []
            existing_keys = set()
            if env_path.exists():
                with open(env_path) as f:
                    existing_lines = f.readlines()
                for line in existing_lines:
                    if "=" in line and not line.strip().startswith("#"):
                        existing_keys.add(line.split("=", 1)[0].strip())

            with open(env_path, "a") as f:
                for key, value in body["env"].items():
                    if key in existing_keys:
                        existing_lines = [
                            f"{key}={value}\n" if l.strip().startswith(f"{key}=") else l
                            for l in existing_lines
                        ]
                        with open(env_path, "w") as fw:
                            fw.writelines(existing_lines)
                    else:
                        f.write(f"{key}={value}\n")

            _load_env()

        return {"status": "saved"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.websocket("/chat")
async def chat_ws(ws: WebSocket):
    """Main chat WebSocket: receives user messages, streams agent events."""
    await ws.accept()
    loop = asyncio.get_running_loop()

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                msg = {"message": raw}

            user_message = msg.get("message", "")
            session_id = msg.get("session_id", "default")
            model = msg.get("model", "")

            if not user_message:
                await ws.send_json({"type": "error", "text": "Empty message"})
                continue

            event_queue: asyncio.Queue = asyncio.Queue()
            tool_call_ids: Dict[str, deque] = {}

            callbacks = {
                "stream_delta_callback": make_stream_delta_cb(event_queue, loop),
                "thinking_callback": make_thinking_cb(event_queue, loop),
                "tool_progress_callback": make_tool_progress_cb(event_queue, loop, tool_call_ids),
                "step_callback": make_step_cb(event_queue, loop, tool_call_ids),
                "status_callback": make_status_cb(event_queue, loop),
            }

            history = _sessions.get(session_id)

            def _run_agent():
                try:
                    agent = _build_agent(
                        model=model,
                        session_id=session_id,
                        **callbacks,
                    )
                    result = agent.run_conversation(
                        user_message=user_message,
                        conversation_history=history,
                    )
                    _sessions[session_id] = result.get("messages", [])
                    return result.get("final_response", "")
                except Exception as e:
                    logger.exception("Agent error")
                    return f"Error: {e}"

            agent_future = loop.run_in_executor(_executor, _run_agent)

            done = False
            while not done:
                drain_task = asyncio.ensure_future(event_queue.get())
                finished, _ = await asyncio.wait(
                    [drain_task, agent_future],
                    return_when=asyncio.FIRST_COMPLETED,
                )

                if drain_task in finished:
                    event = drain_task.result()
                    try:
                        await ws.send_json(event)
                    except Exception:
                        break
                else:
                    drain_task.cancel()

                if agent_future.done():
                    while not event_queue.empty():
                        event = event_queue.get_nowait()
                        try:
                            await ws.send_json(event)
                        except Exception:
                            break
                    done = True

            final_response = agent_future.result()
            await ws.send_json({
                "type": "final_response",
                "text": final_response,
                "session_id": session_id,
            })

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception:
        logger.exception("WebSocket error")


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stderr,
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    _load_env()

    port = int(os.environ.get("HERMES_DESKTOP_PORT", "0"))

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
    )
    server = uvicorn.Server(config)

    # Print the actual port to stdout for Electron to read
    original_startup = server.startup

    async def _startup_with_port(*args, **kwargs):
        await original_startup(*args, **kwargs)
        for s in server.servers:
            for sock in s.sockets:
                addr = sock.getsockname()
                print(f"HERMES_PORT:{addr[1]}", flush=True)
                break
            break

    server.startup = _startup_with_port
    server.run()


if __name__ == "__main__":
    main()
