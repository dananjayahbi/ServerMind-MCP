"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  RefreshCw,
  Server,
  Clock,
  Thermometer,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const selectSession = (s: ReturnType<typeof useAppStore.getState>) => s.session;
const selectProfiles = (s: ReturnType<typeof useAppStore.getState>) => s.profiles;

interface Stats {
  cpu_percent: number;
  mem_used_mb: number;
  mem_total_mb: number;
  mem_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
  disk_percent: number;
  load_1: number;
  load_5: number;
  load_15: number;
  uptime_str: string;
  os_name: string;
  kernel: string;
  logged_users: number;
  rx_bytes: number;
  tx_bytes: number;
  processes: number;
  cpu_cores: number;
}

type HistPoint = { t: number; v: number };

function Sparkline({ data, color = "#49C5B6", height = 40 }: { data: HistPoint[]; color?: string; height?: number }) {
  if (data.length < 2) return <div style={{ height }} className="flex items-end justify-center text-[10px] text-[#444]">No data</div>;
  const w = 200;
  const h = height;
  const max = Math.max(...data.map((d) => d.v), 1);
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (d.v / max) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const area = `M ${pts[0]} L ${pts.slice(1).join(" L ")} L ${w},${h} L 0,${h} Z`;
  const line = `M ${pts[0]} L ${pts.slice(1).join(" L ")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace("#","")})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function GaugeBar({ percent, color = "#49C5B6", label }: { percent: number; color?: string; label?: string }) {
  const p = Math.min(100, Math.max(0, percent));
  const c = p > 85 ? "#EF4444" : p > 65 ? "#F59E0B" : color;
  return (
    <div className="w-full">
      <div className="flex justify-between text-[11px] mb-1">
        {label && <span className="text-[#666]">{label}</span>}
        <span className="text-[#F2F2F2] font-mono ml-auto">{p.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full bg-[#1A1A1A] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p}%`, backgroundColor: c }} />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, title, value, sub, color = "#49C5B6", children }: {
  icon: React.ElementType; title: string; value: string; sub?: string; color?: string; children?: React.ReactNode;
}) {
  return (
    <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
            <Icon size={14} style={{ color }} />
          </div>
          <span className="text-[11px] font-medium text-[#666666] uppercase tracking-wider">{title}</span>
        </div>
      </div>
      <div>
        <span className="text-[22px] font-bold text-[#F2F2F2]">{value}</span>
        {sub && <span className="text-[11px] text-[#666666] ml-2">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

async function execCmd(command: string): Promise<string> {
  const res = await fetch("/api/session/exec", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, timeout_sec: 8 }),
  });
  if (!res.ok) return "";
  const d = await res.json();
  return (d.stdout ?? "").trim();
}

function parseFloat2(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

async function fetchStats(): Promise<Partial<Stats>> {
  // One-shot compound command to minimise round-trips
  const script = [
    // CPU usage (1-second sample via /proc/stat)
    "CPU_IDLE=$(awk '/^cpu / {idle=$5; total=0; for(i=2;i<=NF;i++) total+=$i; print idle\" \"total}' /proc/stat); sleep 1; CPU_IDLE2=$(awk '/^cpu / {idle=$5; total=0; for(i=2;i<=NF;i++) total+=$i; print idle\" \"total}' /proc/stat); echo \"CPUIDLE $CPU_IDLE -- $CPU_IDLE2\"",
    // Memory
    "echo \"MEM $(awk '/^MemTotal/{t=$2}/^MemAvailable/{a=$2}END{print t\" \"a}' /proc/meminfo)\"",
    // Disk /
    "echo \"DISK $(df / | awk 'NR==2{print $2\" \"$3\" \"$5}')\"",
    // Load
    "echo \"LOAD $(cat /proc/loadavg | awk '{print $1\" \"$2\" \"$3}')\"",
    // Uptime
    "echo \"UPTIME $(uptime -p 2>/dev/null || uptime)\"",
    // OS
    "echo \"OS $(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d= -f2 | tr -d '\"' || uname -s)\"",
    // Kernel
    "echo \"KERNEL $(uname -r)\"",
    // Logged users
    "echo \"USERS $(who | wc -l)\"",
    // Processes
    "echo \"PROCS $(ls /proc | grep -c '^[0-9]')\"",
    // CPU cores
    "echo \"CORES $(nproc)\"",
    // Network rx/tx bytes (eth0 or first non-lo)
    "echo \"NET $(cat /proc/net/dev | awk 'NR>2 && !/lo:/{rx+=$2; tx+=$10} END{print rx\" \"tx}')\"",
  ].join("; ");

  const out = await execCmd(`bash -c '${script.replace(/'/g, "'\\''")}'`);
  const stats: Partial<Stats> = {};

  const line = (key: string) => {
    const m = out.match(new RegExp(`${key} ([^\\n]+)`));
    return m ? m[1].trim() : "";
  };

  // CPU
  const cpuRaw = line("CPUIDLE");
  const cpuMatch = cpuRaw.match(/(\d+) (\d+) -- (\d+) (\d+)/);
  if (cpuMatch) {
    const idle1 = parseInt(cpuMatch[1]), total1 = parseInt(cpuMatch[2]);
    const idle2 = parseInt(cpuMatch[3]), total2 = parseInt(cpuMatch[4]);
    const dIdle = idle2 - idle1, dTotal = total2 - total1;
    stats.cpu_percent = dTotal > 0 ? parseFloat2(((1 - dIdle / dTotal) * 100).toFixed(1)) : 0;
  }

  // Memory
  const memRaw = line("MEM").split(" ");
  if (memRaw.length >= 2) {
    const total_kb = parseInt(memRaw[0]), avail_kb = parseInt(memRaw[1]);
    stats.mem_total_mb = Math.round(total_kb / 1024);
    stats.mem_used_mb = Math.round((total_kb - avail_kb) / 1024);
    stats.mem_percent = total_kb > 0 ? parseFloat2(((stats.mem_used_mb / stats.mem_total_mb) * 100).toFixed(1)) : 0;
  }

  // Disk
  const diskRaw = line("DISK").split(" ");
  if (diskRaw.length >= 3) {
    stats.disk_total_gb = parseFloat2((parseInt(diskRaw[0]) / 1024 / 1024).toFixed(1));
    stats.disk_used_gb = parseFloat2((parseInt(diskRaw[1]) / 1024 / 1024).toFixed(1));
    stats.disk_percent = parseFloat2(diskRaw[2].replace("%", ""));
  }

  // Load
  const loadRaw = line("LOAD").split(" ");
  if (loadRaw.length >= 3) {
    stats.load_1 = parseFloat2(loadRaw[0]);
    stats.load_5 = parseFloat2(loadRaw[1]);
    stats.load_15 = parseFloat2(loadRaw[2]);
  }

  stats.uptime_str = line("UPTIME").replace(/^up /, "");
  stats.os_name = line("OS");
  stats.kernel = line("KERNEL");
  stats.logged_users = parseInt(line("USERS")) || 0;
  stats.processes = parseInt(line("PROCS")) || 0;
  stats.cpu_cores = parseInt(line("CORES")) || 1;

  const netRaw = line("NET").split(" ");
  if (netRaw.length >= 2) {
    stats.rx_bytes = parseInt(netRaw[0]) || 0;
    stats.tx_bytes = parseInt(netRaw[1]) || 0;
  }

  return stats;
}

function fmt_bytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

const MAX_HIST = 30;

export default function StatisticsPage() {
  const session = useAppStore(selectSession);
  const profiles = useAppStore(selectProfiles);
  const isActive = session?.state === "CONNECTED";

  const [stats, setStats] = useState<Partial<Stats>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sessionUptime, setSessionUptime] = useState("");

  const cpuHist = useRef<HistPoint[]>([]);
  const memHist = useRef<HistPoint[]>([]);
  const [, forceRender] = useState(0);

  const activeProfile = profiles.find((p) => p.id === session?.profile_id);

  // Session uptime ticker
  useEffect(() => {
    if (!session?.connected_at) { setSessionUptime(""); return; }
    const connectedAt = new Date(session.connected_at).getTime();
    function tick() {
      const elapsed = Math.floor((Date.now() - connectedAt) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      setSessionUptime(`${h}h ${m}m ${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session?.connected_at]);

  const refresh = useCallback(async () => {
    if (!isActive) return;
    setLoading(true);
    try {
      const s = await fetchStats();
      setStats(s);
      const t = Date.now();
      if (s.cpu_percent !== undefined) {
        cpuHist.current = [...cpuHist.current, { t, v: s.cpu_percent }].slice(-MAX_HIST);
      }
      if (s.mem_percent !== undefined) {
        memHist.current = [...memHist.current, { t, v: s.mem_percent }].slice(-MAX_HIST);
      }
      setLastUpdated(new Date());
      forceRender((n) => n + 1);
    } finally {
      setLoading(false);
    }
  }, [isActive]);

  // Auto-refresh every 10s
  useEffect(() => {
    if (!isActive) return;
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [isActive, refresh]);

  const cpuColor = (stats.cpu_percent ?? 0) > 85 ? "#EF4444" : (stats.cpu_percent ?? 0) > 65 ? "#F59E0B" : "#49C5B6";
  const memColor = (stats.mem_percent ?? 0) > 85 ? "#EF4444" : (stats.mem_percent ?? 0) > 65 ? "#F59E0B" : "#6C9EF8";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Statistics"
        description="Live server performance metrics"
        actions={
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[11px] text-[#444]">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={refresh}
              disabled={loading || !isActive}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-all",
                isActive
                  ? "text-[#49C5B6] border border-[#49C5B630] hover:bg-[#49C5B610]"
                  : "text-[#444] border border-[#2A2A2A] cursor-not-allowed"
              )}
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4">
        {!isActive ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[#444]">
            <Activity size={40} />
            <p className="text-[14px]">No active session</p>
            <p className="text-[12px] text-[#333]">Expose a server from the Dashboard to view statistics</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-6xl mx-auto">
            {/* Connection info bar */}
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-4 flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                <span className="text-[13px] font-semibold text-[#F2F2F2]">
                  {activeProfile?.display_name ?? "Unknown"}
                </span>
              </div>
              {activeProfile && (
                <span className="text-[12px] text-[#666] font-mono">
                  {activeProfile.username}@{activeProfile.hostname}:{activeProfile.port}
                </span>
              )}
              {stats.os_name && (
                <span className="text-[12px] text-[#666]">{stats.os_name}</span>
              )}
              {stats.kernel && (
                <span className="text-[11px] text-[#444] font-mono">{stats.kernel}</span>
              )}
              {sessionUptime && (
                <div className="flex items-center gap-1.5 text-[12px] text-[#49C5B6] ml-auto">
                  <Clock size={12} /> Session: {sessionUptime}
                </div>
              )}
            </div>

            {/* Top stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Cpu} title="CPU Usage" value={`${stats.cpu_percent?.toFixed(1) ?? "--"}%`} sub={`${stats.cpu_cores ?? "--"} cores`} color={cpuColor}>
                <GaugeBar percent={stats.cpu_percent ?? 0} color={cpuColor} />
                <Sparkline data={cpuHist.current} color={cpuColor} />
              </StatCard>

              <StatCard icon={MemoryStick} title="Memory" value={`${stats.mem_used_mb ?? "--"}`} sub={`/ ${stats.mem_total_mb ?? "--"} MB`} color={memColor}>
                <GaugeBar percent={stats.mem_percent ?? 0} color={memColor} />
                <Sparkline data={memHist.current} color={memColor} />
              </StatCard>

              <StatCard icon={HardDrive} title="Disk (/)" value={`${stats.disk_used_gb ?? "--"}`} sub={`/ ${stats.disk_total_gb ?? "--"} GB`} color="#BD93F9">
                <GaugeBar percent={stats.disk_percent ?? 0} color="#BD93F9" />
              </StatCard>

              <StatCard icon={Activity} title="Load Avg" value={`${stats.load_1?.toFixed(2) ?? "--"}`} sub="1 min" color="#F1FA8C">
                <div className="space-y-1.5 mt-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#666]">5 min</span>
                    <span className="text-[#F2F2F2] font-mono">{stats.load_5?.toFixed(2) ?? "--"}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#666]">15 min</span>
                    <span className="text-[#F2F2F2] font-mono">{stats.load_15?.toFixed(2) ?? "--"}</span>
                  </div>
                </div>
              </StatCard>
            </div>

            {/* Secondary row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Clock} title="OS Uptime" value={stats.uptime_str ? stats.uptime_str.split(",")[0] : "--"} sub={stats.uptime_str?.includes(",") ? stats.uptime_str.split(",").slice(1).join(",").trim() : undefined} color="#13E8D5" />

              <StatCard icon={Server} title="Processes" value={`${stats.processes ?? "--"}`} color="#6C9EF8" />

              <StatCard icon={Users} title="Logged Users" value={`${stats.logged_users ?? "--"}`} color="#BD93F9" />

              <StatCard icon={Thermometer} title="Network I/O" value={fmt_bytes(stats.rx_bytes ?? 0)} sub="total RX" color="#F59E0B">
                <div className="flex justify-between text-[11px] mt-1">
                  <span className="text-[#666]">TX Total</span>
                  <span className="text-[#F2F2F2] font-mono">{fmt_bytes(stats.tx_bytes ?? 0)}</span>
                </div>
              </StatCard>
            </div>

            {/* CPU + Memory detail row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#49C5B620]">
                    <Cpu size={14} className="text-[#49C5B6]" />
                  </div>
                  <span className="text-[12px] font-semibold text-[#F2F2F2]">CPU History (last 30 samples)</span>
                </div>
                <Sparkline data={cpuHist.current} color={cpuColor} height={80} />
                <div className="flex justify-between text-[10px] text-[#444] mt-1">
                  <span>oldest</span><span>now</span>
                </div>
              </div>

              <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#6C9EF820]">
                    <MemoryStick size={14} className="text-[#6C9EF8]" />
                  </div>
                  <span className="text-[12px] font-semibold text-[#F2F2F2]">Memory History (last 30 samples)</span>
                </div>
                <Sparkline data={memHist.current} color={memColor} height={80} />
                <div className="flex justify-between text-[10px] text-[#444] mt-1">
                  <span>oldest</span><span>now</span>
                </div>
              </div>
            </div>

            {/* Disk detail */}
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#BD93F920]">
                  <HardDrive size={14} className="text-[#BD93F9]" />
                </div>
                <span className="text-[12px] font-semibold text-[#F2F2F2]">Disk Usage</span>
              </div>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <p className="text-[11px] text-[#666] mb-1">Used</p>
                  <p className="text-[18px] font-bold text-[#F2F2F2]">{stats.disk_used_gb ?? "--"} <span className="text-[12px] text-[#666]">GB</span></p>
                </div>
                <div>
                  <p className="text-[11px] text-[#666] mb-1">Free</p>
                  <p className="text-[18px] font-bold text-[#F2F2F2]">
                    {stats.disk_total_gb != null && stats.disk_used_gb != null
                      ? (stats.disk_total_gb - stats.disk_used_gb).toFixed(1)
                      : "--"} <span className="text-[12px] text-[#666]">GB</span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#666] mb-1">Total</p>
                  <p className="text-[18px] font-bold text-[#F2F2F2]">{stats.disk_total_gb ?? "--"} <span className="text-[12px] text-[#666]">GB</span></p>
                </div>
              </div>
              <div className="mt-3">
                <GaugeBar percent={stats.disk_percent ?? 0} color="#BD93F9" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
