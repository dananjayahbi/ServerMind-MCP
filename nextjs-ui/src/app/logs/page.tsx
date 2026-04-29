"use client";
import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/layout/PageHeader";
import { RefreshCw, Filter, Download } from "lucide-react";
import { cn, formatTimestamp } from "@/lib/utils";

const CATEGORIES = ["", "CONNECTION", "COMMAND", "CONFIG", "IPC", "SYSTEM", "SECURITY"];
const LEVELS = ["", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"];

function levelBadge(level: string): string {
  switch (level) {
    case "ERROR": case "CRITICAL": return "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20";
    case "WARNING": return "bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20";
    case "INFO": return "bg-[#49C5B6]/10 text-[#49C5B6] border border-[#49C5B6]/20";
    default: return "bg-[#1A1A1A] text-[#666666] border border-[#2A2A2A]";
  }
}

export default function LogsPage() {
  const { logs, setLogs } = useAppStore();
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLTableRowElement>(null);

  const filtered = logs.filter((e) => {
    if (category && e.category !== category) return false;
    if (level && e.level !== level) return false;
    if (search && !e.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, autoScroll]);

  async function refresh() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "1000" });
      if (category) params.set("category", category);
      if (level) params.set("level", level);
      const res = await fetch(`/api/logs?${params}`);
      if (res.ok) setLogs(await res.json());
    } finally {
      setLoading(false);
    }
  }

  function exportLogs() {
    const text = filtered.map((e) =>
      `${e.timestamp} [${e.level}] [${e.category}] ${e.actor}: ${e.message}`
    ).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `servermind-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Audit Log"
        description={`${filtered.length} of ${logs.length} entries`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={exportLogs} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-[#666666] hover:bg-[#1A1A1A] hover:text-[#F2F2F2] transition-all">
              <Download size={13} /> Export
            </button>
            <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-[#666666] hover:bg-[#1A1A1A] hover:text-[#F2F2F2] transition-all">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2A2A2A] bg-[#111111] flex-wrap">
        <Filter size={13} className="text-[#666666]" />
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-2 py-1 text-[12px] outline-none focus:border-[#49C5B6]">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c || "All Categories"}</option>)}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)}
          className="bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-2 py-1 text-[12px] outline-none focus:border-[#49C5B6]">
          {LEVELS.map((l) => <option key={l} value={l}>{l || "All Levels"}</option>)}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages..."
          className="bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-1 text-[12px] outline-none focus:border-[#49C5B6] w-48"
        />
        <label className="flex items-center gap-1.5 text-[12px] text-[#666666] cursor-pointer ml-auto">
          <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="accent-[#49C5B6]" />
          Auto-scroll
        </label>
      </div>

      {/* Log table */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#444444] text-[13px]">
            No log entries match the current filters
          </div>
        ) : (
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 bg-[#111111] z-10">
              <tr className="border-b border-[#2A2A2A]">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-[#444444] uppercase tracking-wider w-[160px]">Time</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-[#444444] uppercase tracking-wider w-[80px]">Level</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-[#444444] uppercase tracking-wider w-[100px]">Category</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-[#444444] uppercase tracking-wider w-[80px]">Actor</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-[#444444] uppercase tracking-wider">Message</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id} className="border-b border-[#1A1A1A] hover:bg-[#141414] transition-colors">
                  <td className="px-4 py-2 font-mono text-[#666666] whitespace-nowrap">{formatTimestamp(entry.timestamp)}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase", levelBadge(entry.level))}>
                      {entry.level}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#666666] text-[11px]">{entry.category}</td>
                  <td className="px-3 py-2 text-[#666666] text-[11px]">{entry.actor}</td>
                  <td className="px-3 py-2 text-[#F2F2F2] max-w-0 w-full truncate">{entry.message}</td>
                </tr>
              ))}
              <tr ref={bottomRef} />
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
