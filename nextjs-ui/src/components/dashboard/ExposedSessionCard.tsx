"use client";

import { PowerOff, Zap, Clock, Activity, Server } from "lucide-react";
import { cn, stateDotColor, stateColor, formatRelative } from "@/lib/utils";
import type { ExposedSession } from "@/types/api";
import type { ServerProfile } from "@/types/api";

interface ExposedSessionCardProps {
  session: ExposedSession;
  profile: ServerProfile | undefined;
  disconnecting: boolean;
  onDisconnect: (session_uuid: string) => void;
}

export function ExposedSessionCard({
  session,
  profile,
  disconnecting,
  onDisconnect,
}: ExposedSessionCardProps) {
  return (
    <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-xl p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", stateDotColor(session.state))} />
          <span className={cn("text-[13px] font-bold", stateColor(session.state))}>
            {session.state}
          </span>
          {profile && (
            <span className="text-[13px] text-[#F2F2F2] font-semibold truncate">
              — {profile.display_name}
            </span>
          )}
        </div>
        <button
          onClick={() => session.session_uuid && onDisconnect(session.session_uuid)}
          disabled={disconnecting || !session.session_uuid}
          title="Disconnect this session"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EF4444]/10 hover:bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/30 text-[12px] font-medium transition-all disabled:opacity-40 flex-shrink-0"
        >
          <PowerOff size={12} />
          {disconnecting ? "…" : "Disconnect"}
        </button>
      </div>

      {/* Details row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icon={Server} label="Host" value={profile ? `${profile.hostname}:${profile.port}` : "—"} />
        <Stat icon={Zap} label="Commands" value={String(session.commands_executed ?? 0)} />
        <Stat
          icon={Clock}
          label="Connected"
          value={session.connected_at ? formatRelative(session.connected_at) : "—"}
        />
        <Stat
          icon={Activity}
          label="Keep-alive"
          value={session.last_keepalive_at ? formatRelative(session.last_keepalive_at) : "—"}
        />
      </div>

      {/* UUID */}
      {session.session_uuid && (
        <p className="font-mono text-[10px] text-[#444] truncate">
          {session.session_uuid}
        </p>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[#555]">
        <Icon size={11} />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-[12px] font-semibold text-[#C4C4C4] truncate">{value}</span>
    </div>
  );
}
