"""Desktop gateway entry point — starts the full Hermes gateway + web dashboard.

Spawned by Electron as a single child process. Finds free ports for the API
server and the web dashboard, starts both in the same asyncio event loop,
and prints the listening ports to stdout so the main process can connect
the renderer to the gateway and embed the dashboard in an iframe.

Stdout protocol:
    HERMES_PORT:<gateway_port>
    HERMES_DASHBOARD_PORT:<dashboard_port>
"""

from __future__ import annotations

import asyncio
import logging
import os
import socket
import sys
import threading

_HERMES_ROOT = os.environ.get("HERMES_AGENT_ROOT", "")
if _HERMES_ROOT and _HERMES_ROOT not in sys.path:
    sys.path.insert(0, _HERMES_ROOT)


def _load_env() -> None:
    try:
        from hermes_cli.env_loader import load_hermes_dotenv
        from hermes_constants import get_hermes_home
        load_hermes_dotenv(hermes_home=get_hermes_home())
    except Exception:
        pass


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _start_dashboard_in_thread(port: int) -> None:
    """Run the Hermes web dashboard (FastAPI/uvicorn) in a daemon thread."""
    import uvicorn

    try:
        from hermes_cli.web_server import WEB_DIST, app as dashboard_app
    except ImportError:
        logging.getLogger("hermes.desktop").warning(
            "hermes_cli.web_server not available — dashboard will not start"
        )
        return

    if not WEB_DIST.exists():
        logging.getLogger("hermes.desktop").warning(
            "Dashboard assets missing (%s) — dashboard will not start", WEB_DIST
        )
        return

    config = uvicorn.Config(
        dashboard_app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
    )
    server = uvicorn.Server(config)

    original_startup = server.startup

    async def _startup_with_port(*args, **kwargs):
        await original_startup(*args, **kwargs)
        print(f"HERMES_DASHBOARD_PORT:{port}", flush=True)

    server.startup = _startup_with_port

    def _run():
        server.run()

    t = threading.Thread(target=_run, daemon=True, name="hermes-dashboard")
    t.start()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stderr,
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    _load_env()

    gateway_port = _find_free_port()
    dashboard_port = _find_free_port()

    os.environ["API_SERVER_ENABLED"] = "true"
    os.environ["API_SERVER_PORT"] = str(gateway_port)
    os.environ["API_SERVER_HOST"] = "127.0.0.1"
    os.environ.setdefault("API_SERVER_CORS_ORIGINS", "*")
    os.environ["HERMES_DESKTOP_MODE"] = "1"

    _start_dashboard_in_thread(dashboard_port)

    from gateway.run import start_gateway

    success = asyncio.run(start_gateway(replace=True, verbosity=0))
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
