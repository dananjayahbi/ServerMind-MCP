"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Save, Play, ArrowLeft, Plus, Trash2, Settings2, GitBranch,
  ChevronLeft, ChevronRight, Tag, X, Check, Loader2, Info
} from "lucide-react";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { NodePalette } from "@/components/workflow/NodePalette";
import { NodePropertiesPanel } from "@/components/workflow/NodePropertiesPanel";
import { cn } from "@/lib/utils";
import type { WFNode, WFEdge, WFVariableDef, Workflow } from "@/types/workflow";

type Panel = "nodes" | "variables" | "settings";

export default function WorkflowBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // Workflow state
  const [name, setName] = useState("Loading...");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [nodes, setNodes] = useState<WFNode[]>([]);
  const [edges, setEdges] = useState<WFEdge[]>([]);
  const [variables, setVariables] = useState<WFVariableDef[]>([]);

  // UI state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [leftPanel, setLeftPanel] = useState<Panel>("nodes");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  const isDirty = useRef(false);

  // Load workflow
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/workflows/${id}`);
        if (!res.ok) { setError("Workflow not found"); return; }
        const wf: Workflow = await res.json();
        setName(wf.name);
        setDescription(wf.description || "");
        setTags(wf.tags || []);
        setNodes(wf.nodes);
        setEdges(wf.edges);
        setVariables(wf.variables);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Mark dirty on changes
  const handleNodesChange = useCallback((n: WFNode[]) => {
    setNodes(n);
    isDirty.current = true;
    setSaved(false);
  }, []);

  const handleEdgesChange = useCallback((e: WFEdge[]) => {
    setEdges(e);
    isDirty.current = true;
    setSaved(false);
  }, []);

  // Auto-save (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isDirty.current || loading) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(), 2000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [nodes, edges, variables, name, description, tags]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, nodes, edges, variables, tags }),
      });
      if (res.ok) {
        setSaved(true);
        isDirty.current = false;
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  function updateNode(updated: WFNode) {
    setNodes((prev) => prev.map((n) => n.id === updated.id ? updated : n));
    isDirty.current = true;
    setSaved(false);
  }

  function addVariable() {
    setVariables((prev) => [...prev, { key: `var${prev.length + 1}`, label: "New Variable", default: "", required: false }]);
    isDirty.current = true;
  }

  function updateVariable(idx: number, patch: Partial<WFVariableDef>) {
    setVariables((prev) => prev.map((v, i) => i === idx ? { ...v, ...patch } : v));
    isDirty.current = true;
    setSaved(false);
  }

  function removeVariable(idx: number) {
    setVariables((prev) => prev.filter((_, i) => i !== idx));
    isDirty.current = true;
    setSaved(false);
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags((prev) => [...prev, t]);
      isDirty.current = true;
      setSaved(false);
    }
    setTagInput("");
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-[#555]">
        <Loader2 size={28} className="animate-spin mb-3 text-[#49C5B6]" />
        <p className="text-sm">Loading workflow...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center px-6">
        <p className="text-[#EF4444] font-medium mb-2">{error}</p>
        <Link href="/workflows" className="text-[#49C5B6] text-sm underline">Back to workflows</Link>
      </div>
    );
  }

  const inputCls = "w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-[#F2F2F2] focus:border-[#49C5B6] focus:outline-none transition-colors placeholder:text-[#444]";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0D0D0D]">
      {/* Top toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#111111] border-b border-[#2A2A2A] flex-shrink-0">
        <Link href="/workflows" className="p-1.5 rounded-lg text-[#666] hover:text-[#F2F2F2] hover:bg-[#1A1A1A] transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div className="w-px h-5 bg-[#2A2A2A]" />
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <GitBranch size={15} className="text-[#49C5B6] flex-shrink-0" />
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); isDirty.current = true; setSaved(false); }}
            className="bg-transparent text-[14px] font-semibold text-[#F2F2F2] focus:outline-none border-b border-transparent focus:border-[#49C5B6] min-w-0 max-w-[240px] transition-colors"
          />
        </div>

        {/* Node count */}
        <span className="text-[11px] text-[#555] hidden sm:block">{nodes.length} nodes · {edges.length} edges</span>

        {/* Save status */}
        <div className="flex items-center gap-1.5 text-[12px]">
          {saving && <><Loader2 size={13} className="animate-spin text-[#49C5B6]" /><span className="text-[#49C5B6]">Saving...</span></>}
          {saved && <><Check size={13} className="text-[#10B981]" /><span className="text-[#10B981]">Saved</span></>}
          {!saving && !saved && isDirty.current && <span className="text-[#666]">Unsaved changes</span>}
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-[#A3A3A3] hover:text-[#F2F2F2] hover:border-[#3A3A3A] text-[12px] transition-colors disabled:opacity-50"
        >
          <Save size={13} />
          Save
        </button>
        <Link
          href={`/workflows/${id}/run`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#49C5B6] text-[#0D0D0D] font-semibold text-[12px] hover:bg-[#3DB5A6] transition-colors"
        >
          <Play size={13} />
          Run
        </Link>
      </div>

      {/* Main 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className={cn(
          "flex flex-col bg-[#111111] border-r border-[#2A2A2A] transition-all duration-200 flex-shrink-0",
          leftCollapsed ? "w-[44px]" : "w-[220px]"
        )}>
          {!leftCollapsed ? (
            <>
              {/* Panel tabs */}
              <div className="flex border-b border-[#2A2A2A]">
                {(["nodes", "variables", "settings"] as Panel[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setLeftPanel(p)}
                    className={cn(
                      "flex-1 py-2 text-[11px] font-medium uppercase tracking-wider transition-colors",
                      leftPanel === p ? "text-[#49C5B6] border-b-2 border-[#49C5B6]" : "text-[#555] hover:text-[#888]"
                    )}
                  >
                    {p === "nodes" ? "Nodes" : p === "variables" ? "Vars" : "Info"}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto">
                {leftPanel === "nodes" && <NodePalette />}
                {leftPanel === "variables" && (
                  <div className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-widest text-[#49C5B6] font-semibold">Variables</p>
                      <button onClick={addVariable} className="p-1 rounded text-[#555] hover:text-[#49C5B6] transition-colors">
                        <Plus size={13} />
                      </button>
                    </div>
                    <p className="text-[10px] text-[#444] leading-relaxed">
                      Define variables for this workflow. Use <span className="text-[#49C5B6] font-mono">{"{{key}}"}</span> in commands.
                    </p>
                    {variables.map((v, i) => (
                      <div key={i} className="rounded-lg bg-[#0D0D0D] border border-[#2A2A2A] p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <input
                            value={v.key}
                            onChange={(e) => updateVariable(i, { key: e.target.value })}
                            placeholder="key"
                            className="font-mono text-[11px] text-[#FB923C] bg-transparent focus:outline-none flex-1 min-w-0"
                          />
                          <button onClick={() => removeVariable(i)} className="text-[#444] hover:text-[#EF4444] transition-colors ml-1">
                            <X size={11} />
                          </button>
                        </div>
                        <input
                          value={v.label}
                          onChange={(e) => updateVariable(i, { label: e.target.value })}
                          placeholder="Label"
                          className="w-full text-[11px] text-[#A3A3A3] bg-transparent focus:outline-none border-b border-[#2A2A2A] focus:border-[#49C5B6] pb-0.5"
                        />
                        <input
                          value={v.default || ""}
                          onChange={(e) => updateVariable(i, { default: e.target.value })}
                          placeholder="Default value"
                          className="w-full text-[11px] text-[#666] bg-transparent focus:outline-none border-b border-[#2A2A2A] focus:border-[#49C5B6] pb-0.5"
                        />
                        <label className="flex items-center gap-1.5 text-[10px] text-[#555] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={v.required || false}
                            onChange={(e) => updateVariable(i, { required: e.target.checked })}
                            className="w-3 h-3 accent-[#49C5B6]"
                          />
                          Required
                        </label>
                      </div>
                    ))}
                    {variables.length === 0 && (
                      <p className="text-[11px] text-[#444] italic">No variables defined</p>
                    )}
                  </div>
                )}
                {leftPanel === "settings" && (
                  <div className="p-3 space-y-3">
                    <p className="text-[11px] uppercase tracking-widest text-[#49C5B6] font-semibold">Workflow Info</p>
                    <div>
                      <label className="block text-[10px] text-[#555] uppercase tracking-wider mb-1">Description</label>
                      <textarea
                        value={description}
                        onChange={(e) => { setDescription(e.target.value); isDirty.current = true; setSaved(false); }}
                        rows={3}
                        className={inputCls + " resize-none text-xs"}
                        placeholder="What does this workflow do?"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#555] uppercase tracking-wider mb-1">Tags</label>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {tags.map((t) => (
                          <span key={t} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#49C5B6]/10 text-[#49C5B6] border border-[#49C5B6]/20">
                            {t}
                            <button onClick={() => { setTags((p) => p.filter((x) => x !== t)); isDirty.current = true; }}>
                              <X size={9} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <input
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addTag()}
                          placeholder="Add tag..."
                          className={inputCls + " text-xs"}
                        />
                        <button onClick={addTag} className="p-1.5 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-[#666] hover:text-[#49C5B6] transition-colors">
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-[#2A2A2A]">
                      <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Workflow ID</p>
                      <p className="font-mono text-[10px] text-[#444] break-all">{id}</p>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setLeftCollapsed(true)}
                className="flex items-center justify-center py-2 border-t border-[#2A2A2A] text-[#555] hover:text-[#F2F2F2] hover:bg-[#1A1A1A] transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
            </>
          ) : (
            <button
              onClick={() => setLeftCollapsed(false)}
              className="flex-1 flex items-center justify-center text-[#555] hover:text-[#F2F2F2] hover:bg-[#1A1A1A] transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden">
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-center">
                <p className="text-[14px] text-[#333] font-medium">Drag nodes from the left panel</p>
                <p className="text-[12px] text-[#2A2A2A] mt-1">or connect existing nodes by dragging from handles</p>
              </div>
            </div>
          )}
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onSelectNode={setSelectedNodeId}
          />
        </div>

        {/* Right panel - Properties */}
        <div className={cn(
          "flex flex-col bg-[#111111] border-l border-[#2A2A2A] transition-all duration-200 flex-shrink-0",
          rightCollapsed ? "w-[44px]" : "w-[260px]"
        )}>
          {!rightCollapsed ? (
            <>
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2A2A2A]">
                <div className="flex items-center gap-2">
                  <Settings2 size={13} className="text-[#49C5B6]" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#49C5B6]">Properties</p>
                </div>
                <button onClick={() => setRightCollapsed(true)} className="text-[#555] hover:text-[#F2F2F2] transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <NodePropertiesPanel node={selectedNode} onChange={updateNode} />
              </div>
            </>
          ) : (
            <button
              onClick={() => setRightCollapsed(false)}
              className="flex-1 flex items-center justify-center text-[#555] hover:text-[#F2F2F2] hover:bg-[#1A1A1A] transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
