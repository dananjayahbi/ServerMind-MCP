"use client";
import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/layout/PageHeader";
import { ExposedSessionCard } from "@/components/dashboard/ExposedSessionCard";
import {
  Server, Zap, Clock, Activity, Power, RefreshCw, Plus
} from "lucide-react";
import { cn, formatTimestamp, formatRelative, stateDotColor, stateColor } from "@/lib/utils";
import type { ExposedSession } from "@/types/api";

export default function DashboardPage() {
  const { exposedSessions, setExposedSessions, addOrUpdateSession, removeSession, profiles, logs, ipcConnected } = useAppStore();
  const [selectedProfile, setSelectedProfile] = useState("");
  const [exposing, setExposing] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const activeSessions = exposedSessions.filter((s) => s.state !== "DISCONNECTED");

  useEffect(() => {
    if (!selectedProfile && profiles.length > 0) {
      setSelectedProfile(profiles[0].id);
    }
  }, [profiles]);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data: ExposedSession[] = await res.json();
        const active = data.filter((s) => s.state !== "DISCONNECTED");
        setExposedSessions(active);
      }
    } catch {
      // silently ignore
    }
  }, [setExposedSessions]);

  useEffect(() => {
    refreshSessions();
    const interval = setInterval(refreshSessions, 5000);
    return () => clearInterval(interval);
  }, [refreshSessions]);

  async function refresh() {
    setRefreshing(true);
    try {
      const [profRes] = await Promise.all([
        fetch("/api/profiles"),
        refreshSessions(),
      ]);
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
      if (!res.ok) {
        setError(data.detail || "Failed to expose server");
      } else {
        // Add the new session optimistically, then refresh for real state
        addOrUpdateSession({
          session_uuid: data.session_uuid,
          profile_id: selectedProfile,
          state: "CONNECTING",
          connected_at: null,
          last_keepalive_at: null,
          reconnect_attempt_count: 0,
          commands_executed: 0,
          last_command_at: null,
        });
        setTimeout(refreshSessions, 2000);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setExposing(false);
    }
  }

  async function handleDisconnect(session_uuid: string) {
    setDisconnectingId(session_uuid);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${session_uuid}/disconnect`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "Failed to disconnect");
      } else {
        removeSession(session_uuid);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setDisconnectingId(null);
    }
  }

  const recentLogs = logs.slice(0, 5);
  const totalCommands = activeSessions.reduce((acc, s) => acc + (s.commands_executed ?? 0), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Dashboard"
        description="Manage multiple exposed servers"
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
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Server, label: "Active Sessions", value: activeSessions.length },
            { icon: Zap, label: "Total Commands", value: totalCommands },
            { icon: Server, label: "Profiles Saved", value: profiles.length },
            {
              icon: Clock,
              label: "Last Command",
              value: (() => {
                const last = activeSessions
                  .map((s) => s.last_command_at)
                  .filter(Boolean)
                  .sort()
                  .pop();
                return last ? formatRelative(last) : "—";
              })(),
            },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 flex flex-col gap-2">
              <Icon size={16} className="text-[#49C5B6]" />
              <span className="text-[22px] font-bold text-[#F2F2F2]">{value}</span>
              <span className="text-[11px] text-[#666666] uppercase tracking-wider">{label}</span>
            </div>
          ))}
        </div>

        {/* Expose new server — always visible */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-5">
          <p className="text-[11px] font-semibold text-[#666666] uppercase tracking-wider mb-4">
            Expose a Server
          </p>
          {error && (
            <div className="mb-3 px-3 py-2 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg text-[13px] text-[#EF4444]">
              {error}
            </div>
          )}
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
              <Plus size={14} />
              {exposing ? "Connecting..." : "Expose Server"}
            </button>
          </div>
          {activeSessions.length > 0 && (
            <p className="mt-2 text-[11px] text-[#555]">
              {activeSessions.length} server{activeSessions.length > 1 ? "s" : ""} currently exposed — you can expose more simultaneously.
            </p>
          )}
        </div>

        {/* Active sessions list */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-5">
          <p className="text-[11px] font-semibold text-[#666666] uppercase tracking-wider mb-4">
            Active Sessions ({activeSessions.length})
          </p>
          {activeSessions.length === 0 ? (
            <p className="text-[13px] text-[#555] text-center py-6">
              No servers exposed. Use the control above to expose one.
            </p>
          ) : (
            <div className="space-y-3">
              {activeSessions.map((session) => (
                <ExposedSessionCard
                  key={session.session_uuid}
                  session={session}
                  profile={profiles.find((p) => p.id === session.profile_id)}
                  disconnecting={disconnectingId === session.session_uuid}
                  onDisconnect={handleDisconnect}
                />
              ))}
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
