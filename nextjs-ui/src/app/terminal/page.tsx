"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/layout/PageHeader";
import { Terminal as TerminalIcon, Trash2, RefreshCw, Wifi, WifiOff, Copy, Check } from "lucide-react";

// Module-level terminal output buffer — survives component unmount/remount
const _termBuffer: (Uint8Array | string)[] = [];
const _MAX_BUFFER = 3000;
function _bufferWrite(chunk: Uint8Array | string) {
  _termBuffer.push(chunk);
  if (_termBuffer.length > _MAX_BUFFER) _termBuffer.shift();
}

type WsState = "connecting" | "open" | "closed" | "error";

const selectSession = (s: ReturnType<typeof useAppStore.getState>) => s.session;
const selectToken = (s: ReturnType<typeof useAppStore.getState>) => s.ipcToken;
const selectPort = (s: ReturnType<typeof useAppStore.getState>) => s.ipcPort;

export default function TerminalPage() {
  const termContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initDoneRef = useRef(false);
  const [wsState, setWsState] = useState<WsState>("closed");
  const [copied, setCopied] = useState(false);

  const session = useAppStore(selectSession);
  const ipcToken = useAppStore(selectToken);
  const ipcPort = useAppStore(selectPort);
  const isActive = session?.state === "CONNECTED";

  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;

    async function init() {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      await import("@xterm/xterm/css/xterm.css");

      const term = new Terminal({
        theme: {
          background: "#0D0D0D", foreground: "#F2F2F2", cursor: "#49C5B6",
          cursorAccent: "#0D0D0D", selectionBackground: "#49C5B640",
          black: "#0D0D0D", brightBlack: "#444444", red: "#FF5555", brightRed: "#FF7777",
          green: "#49C5B6", brightGreen: "#13E8D5", yellow: "#F1FA8C", brightYellow: "#FFFF99",
          blue: "#6C9EF8", brightBlue: "#8CB4FF", magenta: "#BD93F9", brightMagenta: "#D6AFFF",
          cyan: "#13E8D5", brightCyan: "#80FFEA", white: "#F2F2F2", brightWhite: "#FFFFFF",
        },
        fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Courier New', monospace",
        fontSize: 13, lineHeight: 1.4, cursorBlink: true, cursorStyle: "block",
        scrollback: 2000, allowProposedApi: true, convertEol: false,
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      xtermRef.current = term;
      fitRef.current = fit;

      if (termContainerRef.current) {
        term.open(termContainerRef.current);
        fit.fit();
        // Replay buffered output so terminal shows content after navigation
        for (const chunk of _termBuffer) {
          term.write(chunk as string);
        }
      }
    }

    init();

    const ro = new ResizeObserver(() => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        fitRef.current?.fit();
        const ws = wsRef.current;
        const term = xtermRef.current;
        if (ws?.readyState === WebSocket.OPEN && term) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      }, 150);
    });
    if (termContainerRef.current) ro.observe(termContainerRef.current);

    return () => {
      ro.disconnect();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitRef.current = null;
      initDoneRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openWs = useCallback((token: string, port: number) => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    inputDisposableRef.current?.dispose();
    inputDisposableRef.current = null;
    if (keepaliveRef.current) { clearInterval(keepaliveRef.current); keepaliveRef.current = null; }

    setWsState("connecting");
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/ws/terminal/web?token=${encodeURIComponent(token)}`
    );
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setWsState("open");
      const term = xtermRef.current;
      if (term) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        inputDisposableRef.current = term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(data);
        });
      }
      keepaliveRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("\x00");
      }, 20000);
    };

    ws.onmessage = (e: MessageEvent) => {
      const term = xtermRef.current;
      if (!term) return;
      if (e.data instanceof ArrayBuffer) {
        const buf = new Uint8Array(e.data);
        const filtered = buf.filter((b) => b !== 0);
        if (filtered.length > 0) { _bufferWrite(filtered); term.write(filtered); }
      } else if (typeof e.data === "string" && e.data !== "\x00") {
        _bufferWrite(e.data);
        term.write(e.data);
      }
    };

    ws.onclose = () => {
      setWsState("closed");
      inputDisposableRef.current?.dispose();
      inputDisposableRef.current = null;
      if (keepaliveRef.current) { clearInterval(keepaliveRef.current); keepaliveRef.current = null; }
      xtermRef.current?.writeln("\r\n\x1b[33m[Connection closed]\x1b[0m");
    };

    ws.onerror = () => { setWsState("error"); ws.close(); };
  }, []);

  useEffect(() => {
    if (isActive && ipcToken && ipcPort) {
      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        openWs(ipcToken, ipcPort);
      }
    } else if (!isActive) {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
        setWsState("closed");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, ipcToken, ipcPort]);

  useEffect(() => {
    return () => {
      if (keepaliveRef.current) clearInterval(keepaliveRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, []);

  function clearTerminal() { xtermRef.current?.clear(); _termBuffer.length = 0; }
  function reconnect() { if (ipcToken && ipcPort) openWs(ipcToken, ipcPort); }

  function copyTerminal() {
    const term = xtermRef.current;
    if (!term) return;
    const lines: string[] = [];
    const buf = term.buffer.active;
    for (let i = 0; i < buf.length; i++) {
      lines.push(buf.getLine(i)?.translateToString(true) ?? "");
    }
    const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const statusColor = wsState === "open" ? "text-[#49C5B6]" : wsState === "connecting" ? "text-yellow-400" : "text-[#666666]";
  const statusLabel = wsState === "open" ? "Connected" : wsState === "connecting" ? "Connecting..." : wsState === "error" ? "Error" : "Disconnected";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Terminal"
        description="Interactive SSH terminal"
        actions={
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 text-[12px] ${statusColor}`}>
              {wsState === "open" ? <Wifi size={13} /> : <WifiOff size={13} />}
              <span>{statusLabel}</span>
            </div>
            {isActive && (wsState === "closed" || wsState === "error") && (
              <button onClick={reconnect} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-[#49C5B6] border border-[#49C5B630] hover:bg-[#49C5B610] transition-all">
                <RefreshCw size={12} /> Reconnect
              </button>
            )}
            <button onClick={clearTerminal} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-[#666666] hover:bg-[#1A1A1A] hover:text-[#F2F2F2] transition-all">
              <Trash2 size={13} /> Clear
            </button>
            <button onClick={copyTerminal} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-[#666666] hover:bg-[#1A1A1A] hover:text-[#F2F2F2] transition-all">
              {copied ? <Check size={13} className="text-[#49C5B6]" /> : <Copy size={13} />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        }
      />
      <div className="flex-1 overflow-hidden p-4 min-h-0">
        <div className="relative h-full rounded-xl overflow-hidden border border-[#2A2A2A] bg-[#0D0D0D]">
          {!isActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0D0D0D]/95 z-10">
              <TerminalIcon size={36} className="text-[#2A2A2A]" />
              <p className="text-[14px] text-[#666666]">No active session</p>
              <p className="text-[12px] text-[#444444]">Expose a server from the Dashboard first</p>
            </div>
          )}
          <div ref={termContainerRef} className="w-full h-full" style={{ padding: "6px 8px" }} />
        </div>
      </div>
    </div>
  );
}
