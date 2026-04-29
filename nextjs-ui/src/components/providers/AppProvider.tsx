"use client";
import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { AppLayout } from "@/components/layout/AppLayout";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const store = useAppStore();
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef(2000); // ms, doubles on failure up to 30s

  async function fetchInitialData() {
    try {
      const tokenRes = await fetch("/api/auth/token");
      if (tokenRes.ok) {
        const { token, port } = await tokenRes.json();
        store.setIpcCredentials(token, port);
        connectWS(token, port);
      }

      const [sessionRes, profilesRes, logsRes, settingsRes] = await Promise.all([
        fetch("/api/session/status"),
        fetch("/api/profiles"),
        fetch("/api/logs?limit=100"),
        fetch("/api/settings"),
      ]);

      if (sessionRes.ok) {
        store.setSession(await sessionRes.json());
        store.setIpcConnected(true);
      }
      if (profilesRes.ok) store.setProfiles(await profilesRes.json());
      if (logsRes.ok) store.setLogs(await logsRes.json());
      if (settingsRes.ok) store.setSettings(await settingsRes.json());
    } catch {
      store.setIpcConnected(false);
    }
  }

  function connectWS(token: string, port: number) {
    // Guard: don't double-open
    const existing = wsRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/events?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      store.setWsConnected(true);
      reconnectDelayRef.current = 2000; // reset backoff
      // Stop HTTP polling — WS is live
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "log.entry") store.addLog(event.payload);
        if (event.type === "session.state_changed") store.setSession(event.payload);
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      store.setWsConnected(false);

      // HTTP polling fallback — only if no reconnect timer running
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          try {
            const res = await fetch("/api/session/status");
            if (res.ok) store.setSession(await res.json());
          } catch { /* ignore */ }
        }, 10000);
      }

      // Exponential backoff reconnect
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, 30000);
      reconnectTimerRef.current = setTimeout(() => connectWS(token, port), delay);
    };

    ws.onerror = () => ws.close();
  }

  useEffect(() => {
    fetchInitialData();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <AppLayout>{children}</AppLayout>;
}
