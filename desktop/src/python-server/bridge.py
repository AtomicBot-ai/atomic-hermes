"""Callback factories bridging AIAgent events to WebSocket JSON messages.

Follows the same pattern as acp_adapter/events.py but pushes events
through an asyncio.Queue that the WebSocket handler drains.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections import deque
from typing import Any, Callable, Deque, Dict

logger = logging.getLogger(__name__)


def _enqueue(queue: asyncio.Queue, loop: asyncio.AbstractEventLoop, event: dict) -> None:
    """Thread-safe enqueue from the AIAgent worker thread."""
    try:
        asyncio.run_coroutine_threadsafe(queue.put(event), loop)
    except Exception:
        logger.debug("Failed to enqueue event", exc_info=True)


def make_stream_delta_cb(
    queue: asyncio.Queue,
    loop: asyncio.AbstractEventLoop,
) -> Callable:
    """stream_delta_callback(delta: str) — text chunks as they arrive."""

    def _delta(delta: str) -> None:
        if not delta:
            return
        _enqueue(queue, loop, {"type": "stream_delta", "text": delta})

    return _delta


def make_thinking_cb(
    queue: asyncio.Queue,
    loop: asyncio.AbstractEventLoop,
) -> Callable:
    """thinking_callback(text: str) — reasoning/thinking content."""

    def _thinking(text: str) -> None:
        if not text:
            return
        _enqueue(queue, loop, {"type": "thinking", "text": text})

    return _thinking


def make_tool_progress_cb(
    queue: asyncio.Queue,
    loop: asyncio.AbstractEventLoop,
    tool_call_ids: Dict[str, Deque[str]],
) -> Callable:
    """tool_progress_callback(event_type, name, preview, args, **kwargs)."""

    def _tool_progress(
        event_type: str,
        name: str = None,
        preview: str = None,
        args: Any = None,
        **kwargs,
    ) -> None:
        if event_type == "tool.started":
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except (json.JSONDecodeError, TypeError):
                    args = {"raw": args}
            if not isinstance(args, dict):
                args = {}

            tc_id = str(uuid.uuid4())[:8]
            q = tool_call_ids.get(name)
            if q is None:
                q = deque()
                tool_call_ids[name] = q
            q.append(tc_id)

            _enqueue(queue, loop, {
                "type": "tool_start",
                "id": tc_id,
                "name": name,
                "args": args,
                "preview": preview or "",
            })

        elif event_type == "tool.completed":
            result = kwargs.get("result", "")
            q = tool_call_ids.get(name or "")
            if q:
                tc_id = q.popleft()
                if not q:
                    tool_call_ids.pop(name, None)
            else:
                tc_id = "unknown"
            _enqueue(queue, loop, {
                "type": "tool_complete",
                "id": tc_id,
                "name": name or "",
                "result": str(result) if result else "",
            })

    return _tool_progress


def make_step_cb(
    queue: asyncio.Queue,
    loop: asyncio.AbstractEventLoop,
    tool_call_ids: Dict[str, Deque[str]],
) -> Callable:
    """step_callback(api_call_count: int, prev_tools: list)."""

    def _step(api_call_count: int, prev_tools: Any = None) -> None:
        if prev_tools and isinstance(prev_tools, list):
            for tool_info in prev_tools:
                tool_name = None
                result = None

                if isinstance(tool_info, dict):
                    tool_name = tool_info.get("name") or tool_info.get("function_name")
                    result = tool_info.get("result") or tool_info.get("output")
                elif isinstance(tool_info, str):
                    tool_name = tool_info

                q = tool_call_ids.get(tool_name or "")
                if isinstance(q, str):
                    q = deque([q])
                    tool_call_ids[tool_name] = q
                if tool_name and q:
                    tc_id = q.popleft()
                    if not q:
                        tool_call_ids.pop(tool_name, None)
                    _enqueue(queue, loop, {
                        "type": "tool_complete",
                        "id": tc_id,
                        "name": tool_name,
                        "result": str(result) if result is not None else "",
                    })

        _enqueue(queue, loop, {
            "type": "step",
            "api_call_count": api_call_count,
        })

    return _step


def make_status_cb(
    queue: asyncio.Queue,
    loop: asyncio.AbstractEventLoop,
) -> Callable:
    """status_callback(status: str) — agent status updates."""

    def _status(status: str) -> None:
        if not status:
            return
        _enqueue(queue, loop, {"type": "status", "text": status})

    return _status
