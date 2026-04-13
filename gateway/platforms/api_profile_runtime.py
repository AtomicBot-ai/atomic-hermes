"""Runtime manager for isolated profile workers."""

import asyncio
import multiprocessing
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

from gateway.platforms.api_profile_worker import run_profile_worker


@dataclass
class _WorkerHandle:
    profile_id: str
    profile_home: Path
    process: multiprocessing.Process
    request_queue: Any
    response_queue: Any
    reader_task: Optional[asyncio.Task]
    ready: asyncio.Event = field(default_factory=asyncio.Event)
    pending: dict[str, asyncio.Future] = field(default_factory=dict)
    event_queues: dict[str, asyncio.Queue] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class ProfileRuntimeManager:
    """Start, reuse, and monitor profile worker processes."""

    def __init__(self) -> None:
        self._ctx = multiprocessing.get_context("spawn")
        self._workers: Dict[str, _WorkerHandle] = {}

    async def ensure_worker(self, profile_id: str, profile_home: Path) -> _WorkerHandle:
        worker = self._workers.get(profile_id)
        if worker and worker.process.is_alive():
            return worker

        request_queue = self._ctx.Queue()
        response_queue = self._ctx.Queue()
        process = self._ctx.Process(
            target=run_profile_worker,
            args=(profile_id, str(profile_home), request_queue, response_queue),
            daemon=True,
        )
        process.start()
        worker = _WorkerHandle(
            profile_id=profile_id,
            profile_home=profile_home,
            process=process,
            request_queue=request_queue,
            response_queue=response_queue,
            reader_task=None,  # type: ignore[arg-type]
        )
        self._workers[profile_id] = worker
        worker.reader_task = asyncio.create_task(self._reader_loop(profile_id))
        await asyncio.wait_for(worker.ready.wait(), timeout=30.0)
        return worker

    async def _reader_loop(self, profile_id: str) -> None:
        worker = self._workers[profile_id]
        loop = asyncio.get_running_loop()
        try:
            while True:
                message = await loop.run_in_executor(None, worker.response_queue.get)
                if message.get("kind") == "worker_ready":
                    worker.ready.set()
                    continue
                request_id = message.get("request_id")
                if message.get("kind") == "event" and request_id in worker.event_queues:
                    await worker.event_queues[request_id].put(message)
                    continue
                future = worker.pending.pop(request_id, None)
                if future is None:
                    continue
                if message.get("kind") == "error":
                    future.set_exception(RuntimeError(message.get("error", "Worker request failed")))
                else:
                    future.set_result(message.get("result"))
        except Exception as exc:
            for future in worker.pending.values():
                if not future.done():
                    future.set_exception(exc)
        finally:
            worker.ready.clear()

    async def call(self, profile_id: str, profile_home: Path, method: str, params: Optional[Dict[str, Any]] = None) -> Any:
        worker = await self.ensure_worker(profile_id, profile_home)
        async with worker.lock:
            loop = asyncio.get_running_loop()
            request_id = uuid.uuid4().hex
            future = loop.create_future()
            worker.pending[request_id] = future
            worker.request_queue.put({
                "kind": "call",
                "request_id": request_id,
                "method": method,
                "params": params or {},
            })
            return await future

    async def stream(self, profile_id: str, profile_home: Path, params: Dict[str, Any]):
        worker = await self.ensure_worker(profile_id, profile_home)
        async with worker.lock:
            loop = asyncio.get_running_loop()
            request_id = uuid.uuid4().hex
            future = loop.create_future()
            event_queue: asyncio.Queue = asyncio.Queue()
            worker.pending[request_id] = future
            worker.event_queues[request_id] = event_queue
            worker.request_queue.put({
                "kind": "call",
                "request_id": request_id,
                "method": "stream_agent",
                "params": params,
            })

            try:
                while True:
                    if future.done() and event_queue.empty():
                        break
                    try:
                        message = await asyncio.wait_for(event_queue.get(), timeout=0.1)
                    except asyncio.TimeoutError:
                        if future.done():
                            break
                        continue
                    yield message
                yield {"kind": "result", "result": await future}
            finally:
                worker.event_queues.pop(request_id, None)

    def status(self) -> list[dict[str, Any]]:
        statuses = []
        for profile_id, worker in self._workers.items():
            statuses.append({
                "profile": profile_id,
                "home": str(worker.profile_home),
                "running": worker.process.is_alive(),
                "pid": worker.process.pid,
                "pendingRequests": len(worker.pending),
            })
        return statuses

    async def shutdown(self) -> None:
        for worker in list(self._workers.values()):
            try:
                worker.request_queue.put({"kind": "shutdown"})
            except Exception:
                pass
            if worker.reader_task:
                worker.reader_task.cancel()
            if worker.process.is_alive():
                worker.process.join(timeout=1.0)
                if worker.process.is_alive():
                    worker.process.terminate()
        self._workers.clear()
