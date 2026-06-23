"""
Cadio stress test — simulates concurrent users hitting the main API endpoints.

Usage:
    pip install aiohttp
    python stress_test.py [BASE_URL] [--users N] [--generate]

Examples:
    python stress_test.py http://localhost:8000
    python stress_test.py https://your-hf-space.hf.space --users 20
    python stress_test.py http://localhost:8000 --users 10 --generate
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import sys
import time
import uuid
from dataclasses import dataclass, field

try:
    import aiohttp
except ImportError:
    sys.exit("Missing dependency: pip install aiohttp")


# ---------------------------------------------------------------------------
# Result tracking
# ---------------------------------------------------------------------------

@dataclass
class Result:
    name: str
    status: int
    duration_ms: float
    error: str = ""


@dataclass
class Suite:
    results: list[Result] = field(default_factory=list)

    def record(self, r: Result) -> None:
        self.results.append(r)
        symbol = "." if r.status < 400 and not r.error else "F"
        print(symbol, end="", flush=True)

    def report(self) -> None:
        print("\n")
        groups: dict[str, list[Result]] = {}
        for r in self.results:
            groups.setdefault(r.name, []).append(r)

        total_ok = total_fail = 0
        for name, rs in groups.items():
            durations = [r.duration_ms for r in rs]
            ok = sum(1 for r in rs if r.status < 400 and not r.error)
            fail = len(rs) - ok
            total_ok += ok
            total_fail += fail
            print(
                f"  {name:<35} "
                f"ok={ok:<4} fail={fail:<4} "
                f"p50={statistics.median(durations):>6.0f}ms "
                f"p95={sorted(durations)[int(len(durations)*0.95)]:>6.0f}ms "
                f"max={max(durations):>6.0f}ms"
            )
            for r in rs:
                if r.error or r.status >= 400:
                    print(f"    !! status={r.status} {r.error[:120]}")

        print(f"\n  Total: {total_ok} ok / {total_fail} failed / {total_ok+total_fail} requests")


# ---------------------------------------------------------------------------
# Individual scenario tasks
# ---------------------------------------------------------------------------

async def task_health(session: aiohttp.ClientSession, base: str, suite: Suite) -> None:
    t0 = time.monotonic()
    try:
        async with session.get(f"{base}/api/health", timeout=aiohttp.ClientTimeout(total=10)) as r:
            suite.record(Result("GET /api/health", r.status, (time.monotonic()-t0)*1000))
    except Exception as e:
        suite.record(Result("GET /api/health", 0, (time.monotonic()-t0)*1000, str(e)))


async def task_session_lifecycle(session: aiohttp.ClientSession, base: str, suite: Suite) -> None:
    """Create a session via /api/object/primitive, then exercise it."""
    sid = str(uuid.uuid4())

    # Primitive creation (fast, no AI)
    t0 = time.monotonic()
    try:
        async with session.post(
            f"{base}/api/object/primitive",
            json={"session_id": sid, "primitive_type": "box"},
            timeout=aiohttp.ClientTimeout(total=15),
        ) as r:
            suite.record(Result("POST /api/object/primitive", r.status, (time.monotonic()-t0)*1000))
            if r.status >= 400:
                return
    except Exception as e:
        suite.record(Result("POST /api/object/primitive", 0, (time.monotonic()-t0)*1000, str(e)))
        return

    # Read mesh
    t0 = time.monotonic()
    try:
        async with session.get(
            f"{base}/api/session/{sid}/mesh",
            timeout=aiohttp.ClientTimeout(total=10),
        ) as r:
            suite.record(Result("GET /api/session/{id}/mesh", r.status, (time.monotonic()-t0)*1000))
    except Exception as e:
        suite.record(Result("GET /api/session/{id}/mesh", 0, (time.monotonic()-t0)*1000, str(e)))

    # Rapid parameter updates (simulates user dragging a slider)
    for i in range(5):
        t0 = time.monotonic()
        try:
            async with session.post(
                f"{base}/api/parameters",
                json={"session_id": sid, "object_id": None,
                      "parameters": {"width": 20 + i * 5, "depth": 20, "height": 10}},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as r:
                suite.record(Result("POST /api/parameters (rapid)", r.status, (time.monotonic()-t0)*1000))
        except Exception as e:
            suite.record(Result("POST /api/parameters (rapid)", 0, (time.monotonic()-t0)*1000, str(e)))

    # Transform
    t0 = time.monotonic()
    try:
        async with session.post(
            f"{base}/api/object/transform",
            json={"session_id": sid, "object_id": None,
                  "transform": {"position": [10, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}},
            timeout=aiohttp.ClientTimeout(total=10),
        ) as r:
            suite.record(Result("POST /api/object/transform", r.status, (time.monotonic()-t0)*1000))
    except Exception as e:
        suite.record(Result("POST /api/object/transform", 0, (time.monotonic()-t0)*1000, str(e)))

    # Undo
    t0 = time.monotonic()
    try:
        async with session.post(
            f"{base}/api/undo",
            json={"session_id": sid},
            timeout=aiohttp.ClientTimeout(total=10),
        ) as r:
            suite.record(Result("POST /api/undo", r.status, (time.monotonic()-t0)*1000))
    except Exception as e:
        suite.record(Result("POST /api/undo", 0, (time.monotonic()-t0)*1000, str(e)))

    # Add a second object and delete it
    t0 = time.monotonic()
    oid = None
    try:
        async with session.post(
            f"{base}/api/object/primitive",
            json={"session_id": sid, "primitive_type": "cylinder"},
            timeout=aiohttp.ClientTimeout(total=15),
        ) as r:
            data = await r.json()
            suite.record(Result("POST /api/object/primitive (cyl)", r.status, (time.monotonic()-t0)*1000))
            oid = data.get("objects", [{}])[-1].get("id") if r.status < 400 else None
    except Exception as e:
        suite.record(Result("POST /api/object/primitive (cyl)", 0, (time.monotonic()-t0)*1000, str(e)))

    if oid:
        t0 = time.monotonic()
        try:
            async with session.post(
                f"{base}/api/object/delete",
                json={"session_id": sid, "object_id": oid},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as r:
                suite.record(Result("POST /api/object/delete", r.status, (time.monotonic()-t0)*1000))
        except Exception as e:
            suite.record(Result("POST /api/object/delete", 0, (time.monotonic()-t0)*1000, str(e)))


async def task_generate(session: aiohttp.ClientSession, base: str, suite: Suite) -> None:
    """Trigger the AI generation endpoint (slow, needs AI keys on the server)."""
    sid = str(uuid.uuid4())
    t0 = time.monotonic()
    try:
        async with session.post(
            f"{base}/api/generate",
            json={"session_id": sid, "prompt": "a small cube 20mm"},
            timeout=aiohttp.ClientTimeout(total=60),
        ) as r:
            suite.record(Result("POST /api/generate (AI)", r.status, (time.monotonic()-t0)*1000))
    except Exception as e:
        suite.record(Result("POST /api/generate (AI)", 0, (time.monotonic()-t0)*1000, str(e)))


async def task_websocket(base: str, suite: Suite) -> None:
    """Open a WebSocket, send ping, receive pong, close."""
    sid = str(uuid.uuid4())
    ws_url = base.replace("http://", "ws://").replace("https://", "wss://") + f"/ws/{sid}"
    t0 = time.monotonic()
    try:
        async with aiohttp.ClientSession() as ws_session:
            async with ws_session.ws_connect(ws_url, timeout=aiohttp.ClientTimeout(total=10)) as ws:
                await ws.send_str("ping")
                msg = await asyncio.wait_for(ws.receive(), timeout=5)
                got_pong = msg.data == "pong" if msg.type == aiohttp.WSMsgType.TEXT else False
                suite.record(Result(
                    "WS /ws/{id} ping/pong",
                    200 if got_pong else 500,
                    (time.monotonic()-t0)*1000,
                    "" if got_pong else f"expected pong, got {msg.type} {msg.data!r:.40}",
                ))
    except Exception as e:
        suite.record(Result("WS /ws/{id} ping/pong", 0, (time.monotonic()-t0)*1000, str(e)))


async def task_printers(session: aiohttp.ClientSession, base: str, suite: Suite) -> None:
    t0 = time.monotonic()
    try:
        async with session.get(f"{base}/api/printers", timeout=aiohttp.ClientTimeout(total=10)) as r:
            suite.record(Result("GET /api/printers", r.status, (time.monotonic()-t0)*1000))
    except Exception as e:
        suite.record(Result("GET /api/printers", 0, (time.monotonic()-t0)*1000, str(e)))


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

async def run_user(base: str, suite: Suite, include_generate: bool, user_idx: int) -> None:
    connector = aiohttp.TCPConnector(limit=20)
    async with aiohttp.ClientSession(connector=connector) as session:
        await task_health(session, base, suite)
        await task_printers(session, base, suite)
        await task_session_lifecycle(session, base, suite)
        await task_websocket(base, suite)
        if include_generate:
            await task_generate(session, base, suite)


async def main(base: str, n_users: int, include_generate: bool) -> None:
    suite = Suite()
    base = base.rstrip("/")

    print(f"Cadio stress test → {base}")
    print(f"Simulating {n_users} concurrent users{'  (AI generation included)' if include_generate else ''}")
    print(f"{'─'*60}")
    print("Progress: ", end="", flush=True)

    t0 = time.monotonic()
    await asyncio.gather(*[run_user(base, suite, include_generate, i) for i in range(n_users)])
    elapsed = time.monotonic() - t0

    suite.report()
    print(f"  Wall time: {elapsed:.1f}s\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cadio stress test")
    parser.add_argument("base_url", nargs="?", default="http://localhost:8000",
                        help="Base URL of the Cadio backend (default: http://localhost:8000)")
    parser.add_argument("--users", type=int, default=10,
                        help="Number of concurrent simulated users (default: 10)")
    parser.add_argument("--generate", action="store_true",
                        help="Include AI generation endpoint (slow, requires AI keys on server)")
    args = parser.parse_args()
    asyncio.run(main(args.base_url, args.users, args.generate))
