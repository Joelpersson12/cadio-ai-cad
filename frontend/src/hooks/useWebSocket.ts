/** WebSocket hook for real-time scene synchronization. */

import { useEffect, useRef, useCallback } from "react";
import type { ScenePayload } from "../utils/types";

const WS_BASE = (
  import.meta.env.VITE_API_BASE || window.location.origin
)
  .replace(/^http/, "ws")
  .replace(/\/+$/, "");

const RECONNECT_DELAY = 2000;
const PING_INTERVAL = 15000;

export function useWebSocket(
  sessionId: string | null,
  onMessage: (payload: ScenePayload) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const cleanup = useCallback(() => {
    if (pingRef.current) {
      clearInterval(pingRef.current);
      pingRef.current = null;
    }
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connectWs = useCallback(
    (sid: string) => {
      cleanup();
      const url = `${WS_BASE}/ws/${sid}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        if (event.data === "pong") return;
        try {
          const payload = JSON.parse(event.data) as ScenePayload;
          onMessageRef.current(payload);
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        if (pingRef.current) clearInterval(pingRef.current);
        reconnectRef.current = setTimeout(() => connectWs(sid), RECONNECT_DELAY);
      };

      ws.onerror = () => {
        ws.close();
      };
    },
    [cleanup],
  );

  useEffect(() => {
    if (sessionId) {
      connectWs(sessionId);
    }
    return cleanup;
  }, [sessionId, connectWs, cleanup]);
}
