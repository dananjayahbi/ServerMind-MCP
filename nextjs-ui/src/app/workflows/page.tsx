"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  GitBranch, Plus, Play, Trash2, Clock, Layers, Search, RefreshCw,
  Server, LayoutGrid, List, Wifi, WifiOff, Loader2, X, CheckCircle2, AlertTriangle,
  SplitSquareHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowSummary } from "@/types/workflow";
import type { ServerProfile } from "@/types/api";
import { useAppStore, type WorkflowConnection } from "@/lib/store";

type ViewMode = "grid" | "list";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function tagColor(tag: string) {
  if (tag === "django") return "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20";
  if (tag === "nextjs" || tag === "nodejs") return "bg-[#60A5FA]/10 text-[#60A5FA] border-[#60A5FA]/20";
  if (tag === "nginx") return "bg-[#34D399]/10 text-[#34D399] border-[#34D399]/20";
  if (tag === "deploy" || tag === "update") return "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20";
  return "bg-[#49C5B6]/10 text-[#49C5B6] border-[#49C5B6]/20";
}

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<WorkflowSummary[]>([]);
  const [creating, setCreating] = useState(false);

  // ---- Workflow connections ----
  const { workflowConnections, setWorkflowConnections, profiles } = useAppStore();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/workflow-connections", { cache: "no-store" });
      if (res.ok) setWorkflowConnections(await res.json());
    } catch { /* ignore */ }
  }, [setWorkflowConnections]);

  useEffect(() => {
    refreshConnections();
    pollRef.current = setInterval(refreshConnections, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [refreshConnections]);

  async function connectServer(profileId: string) {
    setConnectingId(profileId);
    try {
      await fetch("/api/workflow-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId }),
      });
      await refreshConnections();
      setShowConnectModal(false);
    } finally {
      setConnectingId(null);
    }
  }

  async function disconnectServer(sessionUuid: string) {
    await fetch(`/api/workflow-connections/${sessionUuid}`, { method: "DELETE" });
    await refreshConnections();
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workflows");
      if (res.ok) setWorkflows(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadTemplates() {
    if (templates.length > 0) { setShowTemplates(true); return; }
    const res = await fetch("/api/workflows/templates");
    if (res.ok) {
      setTemplates(await res.json());
      setShowTemplates(true);
    }
  }

  async function createBlank() {
    setCreating(true);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Workflow", nodes: [], edges: [], variables: [] }),
      });
      if (res.ok) {
        const wf = await res.json();
        router.push(`/workflows/${wf.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  async function createFromTemplate(tpl: WorkflowSummary & { nodes?: unknown; edges?: unknown; variables?: unknown }) {
    setCreating(true);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tpl.name,
          description: tpl.description,
          nodes: tpl.nodes ?? [],
          edges: tpl.edges ?? [],
          variables: tpl.variables ?? [],
          tags: tpl.tags ?? [],
        }),
      });
      if (res.ok) {
        const wf = await res.json();
        router.push(`/workflows/${wf.id}`);
      }
    } finally {
      setCreating(false);
      setShowTemplates(false);
    }
  }

  async function deleteWorkflow(id: string) {
    if (!confirm("Delete this workflow?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/workflows/${id}`, { method: "DELETE" });
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  const filtered = workflows.filter((w) =>
    !search ||
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    (w.description || "").toLowerCase().includes(search.toLowerCase()) ||
    (w.tags || []).some((t) => t.includes(search.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Workflows"
        description="Visual server automation pipelines"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 rounded-lg text-[#666] hover:text-[#F2F2F2] hover:bg-[#1A1A1A] transition-colors">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={() => setViewMode((v) => v === "grid" ? "list" : "grid")} className="p-2 rounded-lg text-[#666] hover:text-[#F2F2F2] hover:bg-[#1A1A1A] transition-colors">
              {viewMode === "grid" ? <List size={16} /> : <LayoutGrid size={16} />}
            </button>
            <button onClick={loadTemplates} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-[#A3A3A3] hover:text-[#F2F2F2] hover:border-[#3A3A3A] text-sm transition-colors">
              <Layers size={14} />Templates
            </button>
            <Link href="/workflows/parallel" className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#49C5B6]/40 text-[#49C5B6] hover:bg-[#49C5B6]/10 hover:border-[#49C5B6]/60 text-sm font-medium transition-colors">
              <SplitSquareHorizontal size={14} />Parallel Runs
            </Link>
            <button onClick={createBlank} disabled={creating} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#49C5B6] text-[#0D0D0D] font-semibold text-sm hover:bg-[#3DB5A6] transition-colors disabled:opacity-60">
              <Plus size={15} />New Workflow
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Connected Servers Panel */}
        <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Server size={14} className="text-[#49C5B6]" />
              <span className="text-[13px] font-semibold text-[#F2F2F2]">Connected Servers</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1A1A1A] text-[#666] border border-[#2A2A2A]">
                {workflowConnections.filter(c => c.state === "CONNECTED").length} online
              </span>
            </div>
            <button
              onClick={() => setShowConnectModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#49C5B6]/10 hover:bg-[#49C5B6]/20 text-[#49C5B6] text-[11px] font-medium border border-[#49C5B6]/20 transition-colors"
            >
              <Plus size={12} /> Connect Server
            </button>
          </div>

          {workflowConnections.length === 0 ? (
            <p className="text-[12px] text-[#555] py-2">
              No servers connected. Connect a server to run workflows on it.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {workflowConnections.map((conn) => (
                <div
                  key={conn.session_uuid}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#111111] border border-[#2A2A2A] min-w-[200px]"
                >
                  {/* State indicator */}
                  {conn.state === "CONNECTED" && (
                    <CheckCircle2 size={13} className="text-[#10B981] flex-shrink-0" />
                  )}
                  {conn.state === "CONNECTING" && (
                    <Loader2 size={13} className="text-[#F59E0B] animate-spin flex-shrink-0" />
                  )}
                  {conn.state === "FAULT" && (
                    <AlertTriangle size={13} className="text-[#EF4444] flex-shrink-0" />
                  )}
                  {conn.state === "DISCONNECTED" && (
                    <WifiOff size={13} className="text-[#555] flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-[#F2F2F2] truncate">{conn.display_name}</p>
                    <p className="text-[10px] text-[#555] truncate">{conn.username}@{conn.hostname}</p>
                  </div>
                  {conn.is_mcp_session && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#49C5B6]/10 text-[#49C5B6] border border-[#49C5B6]/20 flex-shrink-0">
                      MCP
                    </span>
                  )}
                  {!conn.is_mcp_session && (
                    <button
                      onClick={() => disconnectServer(conn.session_uuid)}
                      className="p-1 rounded text-[#555] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors flex-shrink-0"
                      title="Disconnect"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Connect Server Modal */}
        {showConnectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A]">
                <div>
                  <h3 className="text-[14px] font-semibold text-[#F2F2F2]">Connect a Server</h3>
                  <p className="text-[12px] text-[#666]">Select a profile to connect for workflow execution</p>
                </div>
                <button onClick={() => setShowConnectModal(false)} className="text-[#666] hover:text-[#F2F2F2]">
                  <X size={16} />
                </button>
              </div>
              <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                {profiles.length === 0 && (
                  <p className="text-[12px] text-[#555] text-center py-4">No server profiles found. Add one in Settings.</p>
                )}
                {profiles.map((profile) => {
                  const alreadyConnected = workflowConnections.some(
                    c => c.profile_id === profile.id && c.state !== "DISCONNECTED"
                  );
                  return (
                    <button
                      key={profile.id}
                      disabled={alreadyConnected || connectingId === profile.id}
                      onClick={() => connectServer(profile.id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                        alreadyConnected
                          ? "border-[#49C5B6]/30 bg-[#49C5B6]/5 opacity-60 cursor-not-allowed"
                          : "border-[#2A2A2A] bg-[#0D0D0D] hover:border-[#49C5B6]/40 hover:bg-[#0D1A18] cursor-pointer"
                      )}
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
                        {connectingId === profile.id
                          ? <Loader2 size={14} className="text-[#49C5B6] animate-spin" />
                          : <Server size={14} className="text-[#49C5B6]" />
                        }
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-[#F2F2F2]">{profile.display_name}</p>
                        <p className="text-[11px] text-[#555]">{profile.username}@{profile.hostname}:{profile.port ?? 22}</p>
                      </div>
                      {alreadyConnected && (
                        <span className="text-[10px] text-[#49C5B6]">Connected</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workflows..."
            className="w-full bg-[#111111] border border-[#2A2A2A] rounded-lg pl-8 pr-3 py-2 text-sm text-[#F2F2F2] focus:border-[#49C5B6] focus:outline-none placeholder:text-[#444]"
          />
        </div>

        {/* Templates modal */}
        {showTemplates && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A]">
                <div>
                  <h3 className="text-[15px] font-semibold text-[#F2F2F2]">Workflow Templates</h3>
                  <p className="text-[12px] text-[#666]">Choose a template to get started quickly</p>
                </div>
                <button onClick={() => setShowTemplates(false)} className="text-[#666] hover:text-[#F2F2F2] text-xl leading-none">&times;</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 gap-3">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => createFromTemplate(tpl as WorkflowSummary & { nodes?: unknown; edges?: unknown; variables?: unknown })}
                    disabled={creating}
                    className="text-left flex items-start gap-4 p-4 rounded-xl bg-[#0D0D0D] border border-[#2A2A2A] hover:border-[#49C5B6]/40 hover:bg-[#0D1A18] transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#49C5B6]/10 flex items-center justify-center flex-shrink-0">
                      <GitBranch size={18} className="text-[#49C5B6]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#F2F2F2] group-hover:text-[#49C5B6] transition-colors">{tpl.name}</p>
                      <p className="text-[12px] text-[#666] mt-0.5 leading-snug">{tpl.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(tpl.tags || []).map((tag) => (
                          <span key={tag} className={cn("text-[10px] px-1.5 py-0.5 rounded border", tagColor(tag))}>{tag}</span>
                        ))}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1A1A1A] text-[#555] border border-[#2A2A2A]">{tpl.nodeCount} nodes</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#111111] border border-[#2A2A2A] flex items-center justify-center mb-4">
              <GitBranch size={28} className="text-[#333]" />
            </div>
            <p className="text-[15px] font-medium text-[#555]">No workflows yet</p>
            <p className="text-[13px] text-[#444] mt-1 mb-4">Create a blank workflow or start from a template</p>
            <div className="flex gap-3">
              <button onClick={loadTemplates} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-[#A3A3A3] hover:text-[#F2F2F2] text-sm">
                <Layers size={14} /> Use Template
              </button>
              <button onClick={createBlank} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#49C5B6] text-[#0D0D0D] font-semibold text-sm">
                <Plus size={14} /> Create Blank
              </button>
            </div>
          </div>
        )}

        {/* Grid view */}
        {viewMode === "grid" && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((wf) => (
              <WorkflowCard key={wf.id} wf={wf} onDelete={deleteWorkflow} deleting={deleting === wf.id} />
            ))}
          </div>
        )}

        {/* List view */}
        {viewMode === "list" && filtered.length > 0 && (
          <div className="flex flex-col gap-2">
            {filtered.map((wf) => (
              <WorkflowRow key={wf.id} wf={wf} onDelete={deleteWorkflow} deleting={deleting === wf.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowCard({ wf, onDelete, deleting }: { wf: WorkflowSummary; onDelete: (id: string) => void; deleting: boolean }) {
  return (
    <div className="group bg-[#111111] border border-[#2A2A2A] rounded-2xl p-4 hover:border-[#3A3A3A] transition-all flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#49C5B6]/10 flex items-center justify-center flex-shrink-0">
            <GitBranch size={16} className="text-[#49C5B6]" />
          </div>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-[#F2F2F2] truncate">{wf.name}</p>
            {wf.description && (
              <p className="text-[11px] text-[#666] leading-tight truncate">{wf.description}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {(wf.tags || []).map((tag) => (
          <span key={tag} className={cn("text-[10px] px-1.5 py-0.5 rounded border", tagColor(tag))}>{tag}</span>
        ))}
      </div>

      <div className="flex items-center gap-3 text-[11px] text-[#555]">
        <span className="flex items-center gap-1">
          <Server size={11} />
          {wf.nodeCount} nodes
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {formatDate(wf.updated_at)}
        </span>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-[#1A1A1A]">
        <Link
          href={`/workflows/${wf.id}`}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A1A1A] hover:bg-[#222] text-[#A3A3A3] hover:text-[#F2F2F2] text-[12px] font-medium transition-colors"
        >
          <Layers size={13} />
          Edit
        </Link>
        <Link
          href={`/workflows/${wf.id}/run`}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#49C5B6]/10 hover:bg-[#49C5B6]/20 text-[#49C5B6] text-[12px] font-medium transition-colors border border-[#49C5B6]/20"
        >
          <Play size={13} />
          Run
        </Link>
        <button
          onClick={() => onDelete(wf.id)}
          disabled={deleting}
          className="p-1.5 rounded-lg text-[#555] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function WorkflowRow({ wf, onDelete, deleting }: { wf: WorkflowSummary; onDelete: (id: string) => void; deleting: boolean }) {
  return (
    <div className="flex items-center gap-4 bg-[#111111] border border-[#2A2A2A] rounded-xl px-4 py-3 hover:border-[#3A3A3A] transition-all">
      <div className="w-8 h-8 rounded-lg bg-[#49C5B6]/10 flex items-center justify-center flex-shrink-0">
        <GitBranch size={14} className="text-[#49C5B6]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[#F2F2F2] truncate">{wf.name}</p>
        {wf.description && <p className="text-[11px] text-[#666] truncate">{wf.description}</p>}
      </div>
      <div className="flex flex-wrap gap-1 hidden sm:flex">
        {(wf.tags || []).slice(0, 3).map((tag) => (
          <span key={tag} className={cn("text-[10px] px-1.5 py-0.5 rounded border", tagColor(tag))}>{tag}</span>
        ))}
      </div>
      <span className="text-[11px] text-[#555] whitespace-nowrap hidden md:block">{wf.nodeCount} nodes</span>
      <span className="text-[11px] text-[#555] whitespace-nowrap hidden lg:block">{formatDate(wf.updated_at)}</span>
      <div className="flex items-center gap-2">
        <Link href={`/workflows/${wf.id}`} className="px-3 py-1.5 rounded-lg bg-[#1A1A1A] hover:bg-[#222] text-[#A3A3A3] hover:text-[#F2F2F2] text-[12px] transition-colors">
          Edit
        </Link>
        <Link href={`/workflows/${wf.id}/run`} className="px-3 py-1.5 rounded-lg bg-[#49C5B6]/10 hover:bg-[#49C5B6]/20 text-[#49C5B6] text-[12px] border border-[#49C5B6]/20 transition-colors flex items-center gap-1">
          <Play size={12} /> Run
        </Link>
        <button onClick={() => onDelete(wf.id)} disabled={deleting} className="p-1.5 rounded-lg text-[#555] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors disabled:opacity-40">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
