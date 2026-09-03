"use client";
import { useEffect, useRef } from "react";
import type { WsMessage } from "@restai/types";

export function useWebSocket(
  rooms: string[],
  onMessage: (msg: WsMessage) => void,
  token?: string
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const roomsKey = rooms.join(",");

  useEffect(() => {
    if (!roomsKey) return;

    let cancelled = false;

    let heartbeat: ReturnType<typeof setInterval> | null = null;

    function attemptConnect() {
      if (cancelled) return;

      const wsUrl = (
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
      ).replace("http", "ws");
      const ws = new WebSocket(`${wsUrl}/ws`);
      let lastSeen = Date.now();

      const stopHeartbeat = () => {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
      };

      ws.onopen = () => {
        if (token) {
          ws.send(JSON.stringify({ type: "auth", token }));
        }

        /**
         * ⚠️ BẮT MẠCH — đừng bỏ.
         *
         * Trước đây phía này KHÔNG hề gửi ping (dù máy chủ đã trả `pong` sẵn),
         * nên chỉ nối lại khi trình duyệt bắn `onclose`. Mà WiFi rớt hoặc router
         * hết phiên NAT thì `onclose` KHÔNG BAO GIỜ bắn: máy tưởng vẫn nối, thực
         * ra không nhận gì nữa. Trạm quầy "chết mà không biết mình chết" —
         * phiếu đặt món phát trong lúc đó mất trắng, không ai hay.
         */
        lastSeen = Date.now();
        stopHeartbeat();
        heartbeat = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          // Quá 45 giây không nghe gì (kể cả pong) → coi như đứt, tự đóng để
          // `onclose` chạy và nối lại.
          if (Date.now() - lastSeen > 45_000) {
            stopHeartbeat();
            try { ws.close(); } catch { /* đằng nào cũng đang đóng */ }
            return;
          }
          try { ws.send(JSON.stringify({ type: "ping" })); } catch { /* lượt sau thử lại */ }
        }, 20_000);
      };

      ws.onmessage = (event) => {
        // Mọi gói tin nhận được đều là bằng chứng đường truyền còn sống.
        lastSeen = Date.now();
        try {
          const msg = JSON.parse(event.data) as WsMessage;
          if ((msg as any)?.type === "pong") return;
          onMessageRef.current(msg);
        } catch {
          // Invalid message
        }
      };

      ws.onclose = () => {
        stopHeartbeat();
        if (!cancelled) {
          setTimeout(attemptConnect, 3000);
        }
      };

      wsRef.current = ws;
    }

    attemptConnect();

    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      wsRef.current?.close();
    };
  }, [roomsKey, token]);

  return wsRef;
}
