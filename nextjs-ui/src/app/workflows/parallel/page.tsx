"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, X, Play, Server, CheckCircle2, XCircle, Loader2, Clock,
  ChevronDown, ChevronUp, RefreshCw, GitBranch, Zap, Terminal, Code2,
  FileCode2, Braces, StickyNote, AlertTriangle, History, ShieldCheck, Upload,
  Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Workflow, WFVariableDef, WorkflowExecution, WFNodeLog, WFNode,
  CommandNodeData, ScriptNodeData, FileWriteNodeData, FileUploadNodeData,
  DelayNodeData, VariableNodeData, WorkflowSummary
} from "@/types/workflow";
import { useAppStore, type WorkflowConnection } from "@/lib/store";

// ─── Helpers shared with the run page ──────────────────────────────────────

function nodeIcon(type: string) {
  switch (type) {
    case "trigger": return <Zap size={12} className="text-[#49C5B6]" />;
    case "command": return <Terminal size={12} className="text-[#F59E0B]" />;
    case "script": return <Code2 size={12} className="text-[#A78BFA]" />;
    case "file_write": return <FileCode2 size={12} className="text-[#60A5FA]" />;
    case "file_upload": return <Upload size={12} className="text-[#49C5B6]" />;
    case "variable": return <Braces size={12} className="text-[#FB923C]" />;
    case "note": return <StickyNote size={12} className="text-[#FBBF24]" />;
    default: return <Zap size={12} className="text-[#49C5B6]" />;
  }
}

interface ValidationIssue { nodeLabel: string; nodeType: string; issues: string[]; }

function validateWorkflow(nodes: WFNode[]): ValidationIssue[] {
  const results: ValidationIssue[] = [];
  for (const node of nodes) {
    if (node.type === "trigger" || node.type === "note") continue;
    const label = (node.data as { label: string }).label || node.type;
    const issues: string[] = [];
    if (node.type === "command") {
      if (!(node.data as CommandNodeData).command?.trim()) issues.push("Command is empty");
    } else if (node.type === "script") {
      if (!(node.data as ScriptNodeData).script?.trim()) issues.push("Script is empty");
    } else if (node.type === "file_write") {
      const d = node.data as FileWriteNodeData;
      if (!d.remote_path?.trim()) issues.push("Remote path is empty");
      if (!d.content?.trim()) issues.push("Content is empty");
    } else if (node.type === "file_upload") {
      if (!(node.data as FileUploadNodeData).local_file_id) issues.push("No file selected");
    } else if (node.type === "delay") {
      const d = node.data as DelayNodeData;
      if (!d.seconds || d.seconds <= 0) issues.push("Delay must be > 0");
    } else if (node.type === "variable") {
      if (!(node.data as VariableNodeData).key?.trim()) issues.push("Variable key is empty");
    }
    if (issues.length) results.push({ nodeLabel: label, nodeType: node.type, issues });
  }
  return results;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-[#1A1A1A] text-[#666] border-[#2A2A2A]",
    running: "bg-[#49C5B6]/10 text-[#49C5B6] border-[#49C5B6]/30",
    success: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30",
    failed: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30",
    cancelled: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30",
    skipped: "bg-[#1A1A1A] text-[#555] border-[#2A2A2A]",
  };
  return (
    <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium uppercase tracking-wide", map[status] ?? map.pending)}>
      {status}
    </span>
  );
}

function NodeLogRow({ log }: { log: WFNodeLog }) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = !!(log.output || log.error);
  const progressMatch =
    log.status === "running" && log.output
      ? log.output.match(/^\[([█░]+)\]\s+(\d+)%\s+([\d.]+)\s*\/\s*([\d.]+)\s*MB(.*)/)
      : null;
  const isRunningWithProgress = log.status === "running" && !!log.output;

  return (
    <div className={cn(
      "rounded-xl border transition-all",
      log.status === "failed" ? "border-[#EF4444]/30 bg-[#1A0808]" :
      log.status === "success" ? "border-[#10B981]/20 bg-[#081A10]" :
      log.status === "running" ? "border-[#49C5B6]/30 bg-[#081A18]" :
      "border-[#2A2A2A] bg-[#111111]"
    )}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-shrink-0">
          {log.status === "success" && <CheckCircle2 size={15} className="text-[#10B981]" />}
          {log.status === "failed" && <XCircle size={15} className="text-[#EF4444]" />}
          {log.status === "running" && <Loader2 size={15} className="text-[#49C5B6] animate-spin" />}
          {(log.status === "skipped" || log.status === "pending") && <Clock size={15} className="text-[#555]" />}
        </div>
        <p className="text-[13px] font-medium text-[#E2E2E2] flex-1 min-w-0 truncate">{log.node_label}</p>
        <StatusBadge status={log.status} />
        {log.completed_at && log.started_at && (
          <span className="text-[10px] text-[#555] whitespace-nowrap hidden sm:block">
            {((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 1000).toFixed(1)}s
          </span>
        )}
        {hasOutput && !isRunningWithProgress && (
          <button onClick={() => setExpanded(v => !v)} className="text-[#555] hover:text-[#A3A3A3]">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>
      {progressMatch ? (
        <div className="px-4 pb-3">
          <div className="mb-1.5 flex items-center justify-between text-[10px]">
            <span className="text-[#A3A3A3] font-mono">
              {progressMatch[3]} / {progressMatch[4]} MB
              {progressMatch[5]?.trim() ? <span className="text-[#49C5B6]"> {progressMatch[5].trim()}</span> : null}
            </span>
            <span className="text-[#49C5B6] font-bold">{progressMatch[2]}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#0D0D0D] overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-[#10B981] to-[#49C5B6] transition-all duration-700" style={{ width: `${progressMatch[2]}%` }} />
          </div>
        </div>
      ) : isRunningWithProgress ? (
        <div className="px-4 pb-2">
          <pre className="text-[11px] text-[#49C5B6] font-mono whitespace-pre-wrap break-all">{log.output}</pre>
        </div>
      ) : null}
      {expanded && hasOutput && !isRunningWithProgress && (
        <div className="px-4 pb-3">
          {log.output && <pre className="rounded-lg bg-[#0D0D0D] p-3 text-[11px] text-[#A3A3A3] font-mono overflow-x-auto max-h-40 whitespace-pre-wrap break-all">{log.output}</pre>}
          {log.error && <pre className="rounded-lg bg-[#1A0808] border border-[#EF4444]/20 p-3 text-[11px] text-[#EF4444] font-mono overflow-x-auto max-h-40 whitespace-pre-wrap break-all mt-2">{log.error}</pre>}
        </div>
      )}
    </div>
  );
}

function TerminalMirror({ execution, prompt }: { execution: WorkflowExecution | null; prompt: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [execution?.logs.length, execution?.status]);
  return (
    <div className="flex flex-col h-full rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#111111] border-b border-[#2A2A2A] flex-shrink-0">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]/60" />
        </div>
        <span className="text-[11px] text-[#444] font-mono ml-1 truncate">{prompt}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
        {!execution ? (
          <span className="text-[#333]">Run the workflow to see terminal output...</span>
        ) : (
          <>
            <div className="text-[#49C5B6]">{`━━━ Workflow: ${execution.id.slice(0, 12)} ━━━`}</div>
            <div className="text-[#555] mb-2">{`Started: ${new Date(execution.started_at).toLocaleTimeString()}`}</div>
            {execution.logs.map((log) => (
              <div key={log.node_id} className="mb-1.5">
                {log.command_text ? (
                  <div className="flex flex-wrap">
                    <span className="text-[#22C55E] font-bold mr-1">{prompt}</span>
                    <span className="text-[#F2F2F2] break-all">{log.command_text}</span>
                  </div>
                ) : log.status === "running" ? (
                  <div>
                    <span className="text-[#F59E0B] font-bold mr-1">{prompt}</span>
                    <span className="text-[#F59E0B] animate-pulse">▌</span>
                  </div>
                ) : null}
                {log.output && <pre className="text-[#A3A3A3] whitespace-pre-wrap break-all m-0">{log.output}</pre>}
                {log.error && <pre className="text-[#EF4444] whitespace-pre-wrap break-all m-0">{log.error}</pre>}
              </div>
            ))}
            {execution.status === "success" && <div className="text-[#10B981] mt-1">━━━ Workflow complete ━━━</div>}
            {execution.status === "failed" && <div className="text-[#EF4444] mt-1">━━━ Workflow failed ━━━</div>}
            {execution.status === "running" && <div className="text-[#49C5B6] animate-pulse mt-1">● Running...</div>}
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Per-tab run panel ──────────────────────────────────────────────────────

interface WorkflowRunPanelProps {
  workflowId: string;
  preselectedSessionUuid: string | null;
}

function WorkflowRunPanel({ workflowId, preselectedSessionUuid }: WorkflowRunPanelProps) {
  const { workflowConnections } = useAppStore();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [selectedSessionUuid, setSelectedSessionUuid] = useState<string | null>(preselectedSessionUuid);
  const [running, setRunning] = useState(false);
  const [execId, setExecId] = useState<string | null>(null);
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [pastExecutions, setPastExecutions] = useState<WorkflowExecution[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[] | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connectedSessions = workflowConnections.filter(c => c.state === "CONNECTED");
  const selectedConn = connectedSessions.find(c => c.session_uuid === selectedSessionUuid) ?? null;
  const termPrompt = selectedConn ? `${selectedConn.username}@${selectedConn.hostname}:~$` : "server:~$";

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/workflows/${workflowId}`);
        if (res.ok) {
          const wf: Workflow = await res.json();
          setWorkflow(wf);
          const defaults: Record<string, string> = {};
          for (const v of wf.variables) defaults[v.key] = v.default || "";
          setVars(defaults);
        }
        const histRes = await fetch(`/api/workflows/${workflowId}/run`);
        if (histRes.ok) setPastExecutions(await histRes.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [workflowId]);

  useEffect(() => {
    if (!execId) return;
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/workflows/executions/${execId}`);
      if (res.ok) {
        const ex: WorkflowExecution = await res.json();
        setExecution(ex);
        if (ex.status === "success" || ex.status === "failed" || ex.status === "cancelled") {
          if (pollRef.current) clearInterval(pollRef.current);
          setRunning(false);
          const histRes = await fetch(`/api/workflows/${workflowId}/run`);
          if (histRes.ok) setPastExecutions(await histRes.json());
        }
      }
    }, 1000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [execId, workflowId]);

  async function handleRun() {
    if (!workflow) return;
    setRunning(true);
    setExecution(null);
    setExecId(null);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables: vars, session_uuid: selectedSessionUuid }),
      });
      if (res.ok) {
        const data = await res.json();
        setExecId(data.execution_id);
        setExecution({ id: data.execution_id, workflow_id: workflowId, profile_id: selectedSessionUuid || null, status: "running", variables: vars, logs: [], started_at: new Date().toISOString() });
      } else {
        const err = await res.json();
        alert(err.error || "Failed to start workflow");
        setRunning(false);
      }
    } catch (e) {
      alert(String(e));
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-[#555]">
        <Loader2 size={28} className="animate-spin mb-3 text-[#49C5B6]" />
        <p className="text-sm">Loading workflow...</p>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <p className="text-[#EF4444]">Workflow not found</p>
      </div>
    );
  }

  const requiredMissing = workflow.variables.filter((v) => v.required && !vars[v.key]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: config + run */}
      <div className="w-[280px] flex-shrink-0 flex flex-col border-r border-[#2A2A2A] bg-[#111111] overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Server selection */}
          <div>
            <label className="block text-[11px] font-medium text-[#666] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Server size={11} /> Target Server
            </label>
            {connectedSessions.length === 0 ? (
              <div className="rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 p-3 flex items-start gap-2">
                <AlertTriangle size={13} className="text-[#F59E0B] flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#F59E0B]">No servers connected. Connect servers from the Workflows page.</p>
              </div>
            ) : (
              <>
                <select
                  value={selectedSessionUuid ?? ""}
                  onChange={(e) => setSelectedSessionUuid(e.target.value || null)}
                  className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-[#F2F2F2] focus:border-[#49C5B6] focus:outline-none"
                >
                  <option value="">— Select server —</option>
                  {connectedSessions.map((c) => (
                    <option key={c.session_uuid} value={c.session_uuid}>
                      {c.display_name} ({c.hostname}){c.is_mcp_session ? " [MCP]" : ""}
                    </option>
                  ))}
                </select>
                {!selectedSessionUuid && (
                  <p className="text-[10px] text-[#F59E0B] mt-1 flex items-center gap-1">
                    <AlertTriangle size={10} /> No server selected
                  </p>
                )}
              </>
            )}
          </div>

          {/* Variables */}
          {workflow.variables.length > 0 && (
            <div>
              <label className="block text-[11px] font-medium text-[#666] uppercase tracking-wider mb-2">
                Variables ({workflow.variables.length})
              </label>
              <div className="space-y-2.5">
                {workflow.variables.map((v) => (
                  <div key={v.key}>
                    <label className="block text-[11px] text-[#A3A3A3] mb-1">
                      <span className="font-mono text-[#FB923C]">{"{{" + v.key + "}}"}</span>
                      {" "}{v.label}{v.required && <span className="text-[#EF4444] ml-1">*</span>}
                    </label>
                    <input
                      value={vars[v.key] ?? ""}
                      onChange={(e) => setVars(prev => ({ ...prev, [v.key]: e.target.value }))}
                      placeholder={v.default || v.label}
                      className="w-full bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-[#F2F2F2] font-mono focus:border-[#49C5B6] focus:outline-none placeholder:text-[#333]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {requiredMissing.length > 0 && (
            <div className="rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 p-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-[#F59E0B] flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-[#F59E0B]">
                {requiredMissing.length} required variable{requiredMissing.length > 1 ? "s" : ""} missing: {requiredMissing.map(v => v.key).join(", ")}
              </p>
            </div>
          )}

          <button
            onClick={() => setValidationIssues(validateWorkflow(workflow.nodes))}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] text-[#A3A3A3] hover:text-[#F2F2F2] hover:border-[#3A3A3A] font-medium text-sm transition-colors"
          >
            <ShieldCheck size={15} /> Validate Nodes
          </button>

          {validationIssues !== null && (
            <div className={cn("rounded-xl border p-3 space-y-2", validationIssues.length === 0 ? "bg-[#10B981]/10 border-[#10B981]/20" : "bg-[#EF4444]/5 border-[#EF4444]/20")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {validationIssues.length === 0
                    ? <CheckCircle2 size={13} className="text-[#10B981]" />
                    : <XCircle size={13} className="text-[#EF4444]" />
                  }
                  <span className={cn("text-[12px] font-semibold", validationIssues.length === 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
                    {validationIssues.length === 0 ? "All nodes valid" : `${validationIssues.length} node${validationIssues.length > 1 ? "s" : ""} need attention`}
                  </span>
                </div>
                <button onClick={() => setValidationIssues(null)} className="text-[#555] hover:text-[#A3A3A3] text-[11px]">✕</button>
              </div>
              {validationIssues.map((v, i) => (
                <div key={i} className="rounded-lg bg-[#0D0D0D] border border-[#2A2A2A] p-2.5">
                  <p className="text-[11px] font-semibold text-[#F2F2F2] mb-1">{v.nodeLabel}</p>
                  {v.issues.map((issue, j) => (
                    <p key={j} className="text-[11px] text-[#EF4444] flex items-start gap-1"><span className="flex-shrink-0 mt-0.5">•</span>{issue}</p>
                  ))}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleRun}
            disabled={running || requiredMissing.length > 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#49C5B6] text-[#0D0D0D] font-bold text-sm hover:bg-[#3DB5A6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? <><Loader2 size={16} className="animate-spin" />Running...</> : <><Play size={16} />Run Workflow</>}
          </button>

          <div className="rounded-xl bg-[#0D0D0D] border border-[#2A2A2A] p-3 space-y-1.5">
            <p className="text-[11px] uppercase tracking-widest text-[#555] font-medium">Workflow Summary</p>
            <div className="flex items-center justify-between text-[12px]"><span className="text-[#666]">Nodes</span><span className="text-[#A3A3A3]">{workflow.nodes.length}</span></div>
            <div className="flex items-center justify-between text-[12px]"><span className="text-[#666]">Variables</span><span className="text-[#A3A3A3]">{workflow.variables.length}</span></div>
            <div className="flex items-center justify-between text-[12px]"><span className="text-[#666]">Runs</span><span className="text-[#A3A3A3]">{pastExecutions.length}</span></div>
          </div>
        </div>
      </div>

      {/* Right: execution log + terminal */}
      <div className="flex-1 flex overflow-hidden bg-[#0D0D0D]">
        <div className="flex-1 overflow-y-auto p-4 min-w-0">
          {showHistory ? (
            <div className="space-y-3 max-w-2xl">
              <p className="text-[11px] uppercase tracking-widest text-[#49C5B6] font-semibold mb-3">Execution History</p>
              {pastExecutions.length === 0
                ? <p className="text-[13px] text-[#555] italic">No executions yet</p>
                : pastExecutions.map(ex => (
                  <button key={ex.id} onClick={() => { setExecution(ex); setExecId(null); setShowHistory(false); }}
                    className="w-full text-left rounded-xl bg-[#111111] border border-[#2A2A2A] hover:border-[#3A3A3A] p-4 transition-all flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge status={ex.status} />
                        <span className="text-[11px] text-[#555]">{new Date(ex.started_at).toLocaleString()}</span>
                      </div>
                      <p className="text-[11px] text-[#555]">{ex.logs.length} steps</p>
                    </div>
                    <ChevronDown size={14} className="text-[#555] rotate-[-90deg]" />
                  </button>
                ))
              }
            </div>
          ) : execution ? (
            <div className="max-w-2xl space-y-4">
              <div className="rounded-xl bg-[#111111] border border-[#2A2A2A] p-4 flex items-center gap-4">
                <div>
                  {execution.status === "running" && <Loader2 size={20} className="text-[#49C5B6] animate-spin" />}
                  {execution.status === "success" && <CheckCircle2 size={20} className="text-[#10B981]" />}
                  {execution.status === "failed" && <XCircle size={20} className="text-[#EF4444]" />}
                  {(execution.status === "pending" || execution.status === "cancelled") && <Clock size={20} className="text-[#666]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={execution.status} />
                    <span className="text-[11px] text-[#555]">Started {new Date(execution.started_at).toLocaleString()}</span>
                  </div>
                  {execution.error && <p className="text-[12px] text-[#EF4444] mt-1">{execution.error}</p>}
                </div>
                {execution.status === "running" && (
                  <div className="flex items-center gap-1 text-[11px] text-[#49C5B6]">
                    <RefreshCw size={11} className="animate-spin" /> Live
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {execution.logs.map(log => <NodeLogRow key={log.node_id} log={log} />)}
                {execution.logs.length === 0 && execution.status === "running" && (
                  <div className="flex items-center gap-2 text-[#555] text-sm">
                    <Loader2 size={14} className="animate-spin text-[#49C5B6]" /> Initializing...
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#111111] border border-[#2A2A2A] flex items-center justify-center mb-4">
                <Play size={24} className="text-[#333]" />
              </div>
              <p className="text-[14px] font-medium text-[#555]">Ready to run</p>
              <p className="text-[12px] text-[#444] mt-1">Configure variables and click Run Workflow</p>
            </div>
          )}
        </div>
        <div className="w-[400px] flex-shrink-0 border-l border-[#2A2A2A] p-3 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <button
              onClick={() => setShowHistory(v => !v)}
              className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-colors border", showHistory ? "bg-[#49C5B6]/10 text-[#49C5B6] border-[#49C5B6]/30" : "bg-[#1A1A1A] border-[#2A2A2A] text-[#666] hover:text-[#A3A3A3]")}
            >
              <History size={11} /> History ({pastExecutions.length})
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <TerminalMirror execution={!showHistory ? execution : null} prompt={termPrompt} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab type ───────────────────────────────────────────────────────────────

interface ParallelTab {
  id: string;
  workflowId: string;
  workflowName: string;
  sessionUuid: string | null;
  serverName: string;
  status: "idle" | "running" | "success" | "failed";
}

// ─── Main parallel page ─────────────────────────────────────────────────────

export default function ParallelWorkflowsPage() {
  const { workflowConnections } = useAppStore();
  const [tabs, setTabs] = useState<ParallelTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Add modal state
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [selectedSessionUuid, setSelectedSessionUuid] = useState<string>("");

  const connectedSessions = workflowConnections.filter(c => c.state === "CONNECTED");

  async function openAddModal() {
    setShowAddModal(true);
    setSelectedWorkflowId("");
    setSelectedSessionUuid(connectedSessions[0]?.session_uuid ?? "");
    setLoadingWorkflows(true);
    try {
      const res = await fetch("/api/workflows");
      if (res.ok) setWorkflows(await res.json());
    } finally {
      setLoadingWorkflows(false);
    }
  }

  function addTab() {
    if (!selectedWorkflowId) return;
    const wf = workflows.find(w => w.id === selectedWorkflowId);
    const conn = connectedSessions.find(c => c.session_uuid === selectedSessionUuid);
    const tabId = `tab-${Date.now()}`;
    const newTab: ParallelTab = {
      id: tabId,
      workflowId: selectedWorkflowId,
      workflowName: wf?.name ?? "Workflow",
      sessionUuid: selectedSessionUuid || null,
      serverName: conn ? `${conn.display_name}` : "No server",
      status: "idle",
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(tabId);
    setShowAddModal(false);
  }

  function removeTab(tabId: string) {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(next[next.length - 1]?.id ?? null);
      }
      return next;
    });
  }

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#111111] border-b border-[#2A2A2A] flex-shrink-0">
        <Link href="/workflows" className="p-1.5 rounded-lg text-[#666] hover:text-[#F2F2F2] hover:bg-[#1A1A1A] transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div className="w-px h-5 bg-[#2A2A2A]" />
        <Layers size={14} className="text-[#49C5B6]" />
        <span className="text-[13px] font-semibold text-[#F2F2F2]">Parallel Workflow Runs</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1A1A1A] text-[#666] border border-[#2A2A2A]">
          {tabs.length} tab{tabs.length !== 1 ? "s" : ""}
        </span>
        <div className="flex-1" />
        <button
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#49C5B6] text-[#0D0D0D] font-semibold text-[12px] hover:bg-[#3DB5A6] transition-colors"
        >
          <Plus size={13} /> Add Workflow Tab
        </button>
      </div>

      {/* Tab bar */}
      {tabs.length > 0 && (
        <div className="flex items-end gap-1 px-3 pt-2 bg-[#0D0D0D] border-b border-[#2A2A2A] overflow-x-auto flex-shrink-0">
          {tabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-t-lg cursor-pointer min-w-[160px] max-w-[220px] border border-b-0 transition-all select-none",
                activeTabId === tab.id
                  ? "bg-[#111111] border-[#2A2A2A] text-[#F2F2F2]"
                  : "bg-[#0D0D0D] border-transparent text-[#666] hover:text-[#A3A3A3] hover:border-[#2A2A2A]/50"
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold truncate">{tab.workflowName}</p>
                <p className="text-[10px] text-[#555] truncate">{tab.serverName}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
                className="p-0.5 rounded text-[#555] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors flex-shrink-0"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 flex overflow-hidden">
        {tabs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-[#111111] border border-[#2A2A2A] flex items-center justify-center">
              <Layers size={32} className="text-[#333]" />
            </div>
            <div>
              <p className="text-[15px] font-medium text-[#555]">No workflow tabs yet</p>
              <p className="text-[12px] text-[#444] mt-1">Add a tab to run multiple workflows in parallel</p>
            </div>
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#49C5B6] text-[#0D0D0D] font-bold text-sm hover:bg-[#3DB5A6] transition-colors"
            >
              <Plus size={15} /> Add Workflow Tab
            </button>
          </div>
        ) : activeTab ? (
          /* Render all panels but only show the active one — keeps state alive for all tabs */
          <div className="flex-1 flex overflow-hidden relative">
            {tabs.map(tab => (
              <div key={tab.id} className={cn("absolute inset-0 flex overflow-hidden", tab.id === activeTabId ? "visible" : "invisible pointer-events-none")}>
                <WorkflowRunPanel
                  workflowId={tab.workflowId}
                  preselectedSessionUuid={tab.sessionUuid}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Add Tab Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A]">
              <div>
                <h3 className="text-[14px] font-semibold text-[#F2F2F2]">Add Workflow Tab</h3>
                <p className="text-[12px] text-[#666]">Select a workflow and target server</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-[#666] hover:text-[#F2F2F2]">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Workflow picker */}
              <div>
                <label className="block text-[11px] font-medium text-[#666] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <GitBranch size={11} /> Workflow
                </label>
                {loadingWorkflows ? (
                  <div className="flex items-center gap-2 text-[#555] text-sm py-2">
                    <Loader2 size={14} className="animate-spin" /> Loading workflows...
                  </div>
                ) : (
                  <select
                    value={selectedWorkflowId}
                    onChange={e => setSelectedWorkflowId(e.target.value)}
                    className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-[#F2F2F2] focus:border-[#49C5B6] focus:outline-none"
                  >
                    <option value="">— Select workflow —</option>
                    {workflows.map(wf => (
                      <option key={wf.id} value={wf.id}>{wf.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Server picker */}
              <div>
                <label className="block text-[11px] font-medium text-[#666] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Server size={11} /> Target Server
                </label>
                {connectedSessions.length === 0 ? (
                  <div className="rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 p-3 flex items-start gap-2">
                    <AlertTriangle size={13} className="text-[#F59E0B] flex-shrink-0 mt-0.5" />
                    <p className="text-[12px] text-[#F59E0B]">No servers connected. Connect servers from the Workflows page first.</p>
                  </div>
                ) : (
                  <select
                    value={selectedSessionUuid}
                    onChange={e => setSelectedSessionUuid(e.target.value)}
                    className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-[#F2F2F2] focus:border-[#49C5B6] focus:outline-none"
                  >
                    <option value="">— No specific server (use MCP session) —</option>
                    {connectedSessions.map(c => (
                      <option key={c.session_uuid} value={c.session_uuid}>
                        {c.display_name} ({c.hostname}){c.is_mcp_session ? " [MCP]" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#2A2A2A]">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-[#A3A3A3] hover:text-[#F2F2F2] text-sm transition-colors">
                Cancel
              </button>
              <button
                onClick={addTab}
                disabled={!selectedWorkflowId}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#49C5B6] text-[#0D0D0D] font-semibold text-sm hover:bg-[#3DB5A6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={14} /> Add Tab
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
