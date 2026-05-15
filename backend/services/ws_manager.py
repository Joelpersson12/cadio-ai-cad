"""WebSocket connection manager for real-time scene synchronization.

Maintains per-session connection pools and broadcasts scene updates
to all connected clients when geometry changes.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# session_id -> set of connected websockets
_connections: dict[str, set[WebSocket]] = defaultdict(set)


async def connect(ws: WebSocket, session_id: str) -> None:
    """Accept a WebSocket and register it for the given session."""
    await ws.accept()
    _connections[session_id].add(ws)
    logger.info(
        "WS connected: session=%s, total=%d", session_id, len(_connections[session_id])
    )


async def disconnect(ws: WebSocket, session_id: str) -> None:
    """Remove a WebSocket from the session pool."""
    _connections[session_id].discard(ws)
    if not _connections[session_id]:
        del _connections[session_id]
    logger.info("WS disconnected: session=%s", session_id)


async def broadcast(session_id: str, payload: dict[str, Any]) -> None:
    """Send a JSON payload to all clients connected to a session."""
    sockets = list(_connections.get(session_id, set()))
    if not sockets:
        return

    data = json.dumps(payload, default=str)
    dead: list[WebSocket] = []

    async def _send(ws: WebSocket) -> None:
        try:
            await ws.send_text(data)
        except Exception:
            dead.append(ws)

    await asyncio.gather(*[_send(ws) for ws in sockets])

    for ws in dead:
        _connections[session_id].discard(ws)


def connection_count(session_id: str) -> int:
    """Return the number of active connections for a session."""
    return len(_connections.get(session_id, set()))
