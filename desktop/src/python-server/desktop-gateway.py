"""Desktop gateway entry point — starts the full Hermes gateway from Electron.

Spawned by Electron as a child process. Finds a free port for the API server,
configures the gateway to enable it, and prints the listening port to stdout
so the main process can connect the renderer.
"""

from __future__ import annotations

import asyncio
import logging
import os
import socket
import sys

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


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stderr,
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    _load_env()

    port = _find_free_port()

    os.environ["API_SERVER_ENABLED"] = "true"
    os.environ["API_SERVER_PORT"] = str(port)
    os.environ["API_SERVER_HOST"] = "127.0.0.1"
    os.environ.setdefault("API_SERVER_CORS_ORIGINS", "*")
    os.environ["HERMES_DESKTOP_MODE"] = "1"

    from gateway.run import start_gateway

    success = asyncio.run(start_gateway(replace=True, verbosity=0))
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
