"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/layout/PageHeader";
import { Terminal as TerminalIcon, Trash2, RefreshCw, Wifi, WifiOff, Copy, Check, ChevronDown, Server } from "lucide-react";
import { cn } from "@/lib/utils";

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
const selectWfConns = (s: ReturnType<typeof useAppStore.getState>) => s.workflowConnections;

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
  const [showServerDropdown, setShowServerDropdown] = useState(false);

  const session = useAppStore(selectSession);
  const ipcToken = useAppStore(selectToken);
  const ipcPort = useAppStore(selectPort);
  const workflowConnections = useAppStore(selectWfConns);

  // Selected session: null = MCP session, string = workflow pool session_uuid
  const [selectedSessionUuid, setSelectedSessionUuid] = useState<string | null>(null);

  const mcpConnected = session?.state === "CONNECTED";

  // Build the list of selectable sessions for the dropdown
  const connectedSessions = workflowConnections.filter(c => c.state === "CONNECTED");
  const selectedConn = selectedSessionUuid
    ? connectedSessions.find(c => c.session_uuid === selectedSessionUuid)
    : null;

  // If selected session disconnects, fall back to MCP
  useEffect(() => {
    if (selectedSessionUuid) {
      const still = workflowConnections.find(
        c => c.session_uuid === selectedSessionUuid && c.state === "CONNECTED"
      );
      if (!still) setSelectedSessionUuid(null);
    }
  }, [workflowConnections, selectedSessionUuid]);

  const isActive = selectedSessionUuid
    ? !!connectedSessions.find(c => c.session_uuid === selectedSessionUuid)
    : mcpConnected;

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

  const openWs = useCallback((token: string, port: number, sessionUuid: string | null) => {
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

    // Determine which WS endpoint to use
    const wsUrl = sessionUuid
      ? `ws://127.0.0.1:${port}/ws/terminal/workflow/${sessionUuid}?token=${encodeURIComponent(token)}`
      : `ws://127.0.0.1:${port}/ws/terminal/web?token=${encodeURIComponent(token)}`;

    setWsState("connecting");
    const ws = new WebSocket(wsUrl);
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
        openWs(ipcToken, ipcPort, selectedSessionUuid);
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
  }, [isActive, ipcToken, ipcPort, selectedSessionUuid]);

  useEffect(() => {
    return () => {
      if (keepaliveRef.current) clearInterval(keepaliveRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, []);

  function clearTerminal() { xtermRef.current?.clear(); _termBuffer.length = 0; }

  function reconnect() {
    if (ipcToken && ipcPort) openWs(ipcToken, ipcPort, selectedSessionUuid);
  }

  function switchSession(sessionUuid: string | null) {
    // Clear terminal buffer and content when switching sessions
    _termBuffer.length = 0;
    xtermRef.current?.clear();
    setSelectedSessionUuid(sessionUuid);
    setShowServerDropdown(false);
    // Force reconnect by closing current WS (the useEffect will reopen with new uuid)
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
      setWsState("closed");
    }
    if (ipcToken && ipcPort) {
      setTimeout(() => openWs(ipcToken, ipcPort, sessionUuid), 50);
    }
  }

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

  const currentSessionLabel = selectedConn
    ? selectedConn.display_name
    : session?.state === "CONNECTED"
      ? "MCP Session"
      : "No Session";

  // Total selectable sessions: MCP session + workflow connections
  const hasMultipleSessions = workflowConnections.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Terminal"
        description="Interactive SSH terminal"
        actions={
          <div className="flex items-center gap-3">
            {/* Server selector dropdown */}
            {hasMultipleSessions && (
              <div className="relative">
                <button
                  onClick={() => setShowServerDropdown(v => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111111] border border-[#2A2A2A] hover:border-[#3A3A3A] text-[12px] text-[#A3A3A3] transition-colors"
                >
                  <Server size={12} className="text-[#49C5B6]" />
                  <span className="max-w-[140px] truncate">{currentSessionLabel}</span>
                  <ChevronDown size={12} className={cn("transition-transform", showServerDropdown && "rotate-180")} />
                </button>
                {showServerDropdown && (
                  <div className="absolute right-0 top-full mt-1 bg-[#111111] border border-[#2A2A2A] rounded-xl shadow-2xl z-50 min-w-[220px] py-1 overflow-hidden">
                    {/* MCP session option */}
                    {mcpConnected && (
                      <button
                        onClick={() => switchSession(null)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1A1A1A] transition-colors",
                          !selectedSessionUuid && "bg-[#49C5B6]/10"
                        )}
                      >
                        <div className="w-6 h-6 rounded bg-[#49C5B6]/10 flex items-center justify-center flex-shrink-0">
                          <Server size={11} className="text-[#49C5B6]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium text-[#F2F2F2] truncate">MCP Session</p>
                          <p className="text-[10px] text-[#555]">Dashboard exposed server</p>
                        </div>
                        {!selectedSessionUuid && <span className="text-[#49C5B6] text-[10px]">●</span>}
                      </button>
                    )}
                    {/* Workflow connections */}
                    {workflowConnections.filter(c => c.state === "CONNECTED").map((conn) => (
                      <button
                        key={conn.session_uuid}
                        onClick={() => switchSession(conn.is_mcp_session ? null : conn.session_uuid)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1A1A1A] transition-colors",
                          selectedSessionUuid === conn.session_uuid && "bg-[#49C5B6]/10"
                        )}
                      >
                        <div className="w-6 h-6 rounded bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
                          <Server size={11} className="text-[#666]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium text-[#F2F2F2] truncate">{conn.display_name}</p>
                          <p className="text-[10px] text-[#555] truncate">{conn.username}@{conn.hostname}</p>
                        </div>
                        {selectedSessionUuid === conn.session_uuid && !conn.is_mcp_session && (
                          <span className="text-[#49C5B6] text-[10px]">●</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

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

      {/* Close dropdown on outside click */}
      {showServerDropdown && (
        <div className="fixed inset-0 z-40" onClick={() => setShowServerDropdown(false)} />
      )}

      <div className="flex-1 overflow-hidden p-4 min-h-0">
        <div className="relative h-full rounded-xl overflow-hidden border border-[#2A2A2A] bg-[#0D0D0D]">
          {!isActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0D0D0D]/95 z-10">
              <TerminalIcon size={36} className="text-[#2A2A2A]" />
              <p className="text-[14px] text-[#666666]">No active session</p>
              <p className="text-[12px] text-[#444444]">
                {workflowConnections.length > 0
                  ? "Connect a server in Workflows or expose one from the Dashboard"
                  : "Expose a server from the Dashboard first"
                }
              </p>
            </div>
          )}
          <div ref={termContainerRef} className="w-full h-full" style={{ padding: "6px 8px" }} />
        </div>
      </div>
    </div>
  );
}
