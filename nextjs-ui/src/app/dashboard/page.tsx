"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Server, Zap, Clock, Activity, Power, PowerOff, RefreshCw
} from "lucide-react";
import { cn, formatTimestamp, formatRelative, stateDotColor, stateColor } from "@/lib/utils";

export default function DashboardPage() {
  const { session, profiles, logs, ipcConnected } = useAppStore();
  const [selectedProfile, setSelectedProfile] = useState("");
  const [exposing, setExposing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const isConnected = session?.state === "CONNECTED";
  const isActive = session?.state !== "DISCONNECTED" && session?.state !== undefined;

  const activeProfile = profiles.find((p) => p.id === session?.profile_id);

  useEffect(() => {
    if (!selectedProfile && profiles.length > 0) {
      setSelectedProfile(profiles[0].id);
    }
  }, [profiles]);

  async function refresh() {
    setRefreshing(true);
    try {
      const [sessRes, profRes] = await Promise.all([
        fetch("/api/session/status"),
        fetch("/api/profiles"),
      ]);
      if (sessRes.ok) useAppStore.getState().setSession(await sessRes.json());
      if (profRes.ok) useAppStore.getState().setProfiles(await profRes.json());
    } finally {
      setRefreshing(false);
    }
  }

  async function handleExpose() {
    if (!selectedProfile) return;
    setExposing(true);
    setError(null);
    try {
      const res = await fetch("/api/session/expose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: selectedProfile }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.detail || "Failed to expose server");
      else useAppStore.getState().setSession({ ...useAppStore.getState().session!, ...data });
    } catch (err) {
      setError(String(err));
    } finally {
      setExposing(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/session/disconnect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.detail || "Failed to disconnect");
      else useAppStore.getState().setSession({ ...useAppStore.getState().session!, state: "DISCONNECTED", session_uuid: null });
    } catch (err) {
      setError(String(err));
    } finally {
      setDisconnecting(false);
    }
  }

  const recentLogs = logs.slice(0, 5);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Dashboard"
        description="Session overview and quick controls"
        actions={
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] text-[#666666] hover:bg-[#1A1A1A] hover:text-[#F2F2F2] transition-all"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Connection status card */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-5">
          <p className="text-[11px] font-semibold text-[#666666] uppercase tracking-wider mb-4">
            Session Status
          </p>
          <div className="flex items-center gap-5 flex-wrap">
            <div className="flex items-center gap-3 bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg px-4 py-3 min-w-[180px]">
              <div className={cn("w-3 h-3 rounded-full flex-shrink-0", stateDotColor(session?.state ?? "DISCONNECTED"))} />
              <span className={cn("text-[15px] font-bold", stateColor(session?.state ?? "DISCONNECTED"))}>
                {session?.state ?? "DISCONNECTED"}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-[12px] text-[#666666]">
              {activeProfile && (
                <span><strong className="text-[#F2F2F2]">{activeProfile.display_name}</strong> — {activeProfile.hostname}:{activeProfile.port}</span>
              )}
              {session?.connected_at && (
                <span>Connected {formatRelative(session.connected_at)}</span>
              )}
              {session?.session_uuid && (
                <span className="font-mono text-[10px]">UUID: {session.session_uuid}</span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { icon: Zap, label: "Commands Run", value: session?.commands_executed ?? 0 },
            { icon: Server, label: "Profiles Saved", value: profiles.length },
            { icon: Clock, label: "Last Command", value: session?.last_command_at ? formatRelative(session.last_command_at) : "—" },
            { icon: Activity, label: "Keep-alive", value: session?.last_keepalive_at ? formatRelative(session.last_keepalive_at) : "—" },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 flex flex-col gap-2">
              <Icon size={16} className="text-[#49C5B6]" />
              <span className="text-[22px] font-bold text-[#F2F2F2]">{value}</span>
              <span className="text-[11px] text-[#666666] uppercase tracking-wider">{label}</span>
            </div>
          ))}
        </div>

        {/* Expose / Disconnect controls */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-5">
          <p className="text-[11px] font-semibold text-[#666666] uppercase tracking-wider mb-4">
            Exposure Control
          </p>
          {error && (
            <div className="mb-3 px-3 py-2 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg text-[13px] text-[#EF4444]">
              {error}
            </div>
          )}
          {!isActive ? (
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                className="bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#49C5B6] transition-all"
              >
                {profiles.length === 0 && <option value="">No profiles — add one first</option>}
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name} ({p.hostname})</option>
                ))}
              </select>
              <button
                onClick={handleExpose}
                disabled={!selectedProfile || exposing || !ipcConnected}
                className="flex items-center gap-2 px-4 py-2 bg-[#49C5B6] hover:bg-[#13E8D5] text-[#0D0D0D] rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Power size={14} />
                {exposing ? "Connecting..." : "Expose Server"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-[13px] text-[#666666]">
                {activeProfile ? `Exposed: ${activeProfile.display_name}` : "Session active"}
              </span>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex items-center gap-2 px-4 py-2 bg-[#EF4444]/10 hover:bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/30 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40"
              >
                <PowerOff size={14} />
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          )}
        </div>

        {/* Recent logs */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-5">
          <p className="text-[11px] font-semibold text-[#666666] uppercase tracking-wider mb-4">
            Recent Activity
          </p>
          {recentLogs.length === 0 ? (
            <p className="text-[13px] text-[#666666] text-center py-6">No log entries yet</p>
          ) : (
            <div className="space-y-1">
              {recentLogs.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 py-1.5 text-[12px]">
                  <span className="text-[#666666] font-mono whitespace-nowrap">{formatTimestamp(entry.timestamp)}</span>
                  <span className={cn(
                    "font-semibold uppercase text-[10px] pt-0.5 whitespace-nowrap",
                    entry.level === "ERROR" || entry.level === "CRITICAL" ? "text-[#EF4444]" :
                    entry.level === "WARNING" ? "text-[#F59E0B]" : "text-[#49C5B6]"
                  )}>{entry.level}</span>
                  <span className="text-[#F2F2F2] truncate">{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
