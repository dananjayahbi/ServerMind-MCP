"use client";
import { useCallback, useRef, useEffect, useState, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { RefreshCw, Trash2 } from "lucide-react";
import { TriggerNode } from "./nodes/TriggerNode";
import { CommandNode } from "./nodes/CommandNode";
import { ScriptNode } from "./nodes/ScriptNode";
import { FileWriteNode } from "./nodes/FileWriteNode";
import { VariableNode } from "./nodes/VariableNode";
import { DelayNode } from "./nodes/DelayNode";
import { NoteNode } from "./nodes/NoteNode";
import { ValidationNode } from "./nodes/ValidationNode";
import type { WFNode, WFEdge, WFNodeType } from "@/types/workflow";

const nodeTypes = {
  trigger: TriggerNode,
  command: CommandNode,
  script: ScriptNode,
  file_write: FileWriteNode,
  variable: VariableNode,
  delay: DelayNode,
  note: NoteNode,
  validation: ValidationNode,
};

function pathExists(from: string, to: string, edges: Edge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const visited = new Set<string>();
  const queue = [from];
  while (queue.length) {
    const node = queue.shift()!;
    if (node === to) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const next of (adj.get(node) || [])) queue.push(next);
  }
  return false;
}

function detectLoopEdges(edges: Edge[]): Set<string> {
  const adj = new Map<string, { edgeId: string; target: string }[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push({ edgeId: e.id, target: e.target });
  }
  const loopEdgeIds = new Set<string>();
  const allNodes = new Set([...edges.map(e => e.source), ...edges.map(e => e.target)]);
  const globalVisited = new Set<string>();

  for (const startNode of allNodes) {
    if (globalVisited.has(startNode)) continue;
    const stack = new Set<string>();

    function dfs(node: string): void {
      globalVisited.add(node);
      stack.add(node);
      const neighbors = adj.get(node) || [];
      for (const { edgeId, target } of neighbors) {
        if (!globalVisited.has(target)) {
          dfs(target);
        } else if (stack.has(target)) {
          loopEdgeIds.add(edgeId);
        }
      }
      stack.delete(node);
    }
    dfs(startNode);
  }
  return loopEdgeIds;
}

function toRFNode(n: WFNode): Node {
  return { id: n.id, type: n.type, position: n.position, data: n.data as unknown as Record<string, unknown> };
}

function toRFEdge(e: WFEdge, isLoop = false): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    label: isLoop ? `⟲ ${e.loop_config?.iterations ?? "?"}x` : e.label,
    animated: true,
    style: isLoop
      ? { stroke: "#F59E0B", strokeWidth: 2.5, strokeDasharray: "6 3" }
      : { stroke: "#49C5B6", strokeWidth: 2 },
    data: e.loop_config ? { loop_config: e.loop_config } : undefined,
  };
}

function fromRFNode(n: Node): WFNode {
  return { id: n.id, type: n.type as WFNodeType, position: n.position, data: n.data as unknown as WFNode["data"] };
}

function fromRFEdge(e: Edge): WFEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    label: typeof e.label === "string" ? e.label : undefined,
    loop_config: (e.data as { loop_config?: { iterations: number } } | undefined)?.loop_config,
  };
}

function defaultNodeData(type: WFNodeType): WFNode["data"] {
  switch (type) {
    case "trigger": return { label: "Trigger", description: "" };
    case "command": return { label: "Command", command: "", timeout: 300, continue_on_error: false };
    case "script": return { label: "Script", script: "", timeout: 600, continue_on_error: false };
    case "file_write": return { label: "Write File", remote_path: "", content: "", sudo: false };
    case "variable": return { label: "Set Variable", key: "", value: "" };
    case "delay": return { label: "Delay", seconds: 5 };
    case "note": return { label: "Note", text: "" };
    case "validation": return { label: "Validate", pattern: "", mode: "contains", expect: "", on_fail: "pause", continue_on_error: false };
    default: return { label: "Node" };
  }
}

interface Props {
  nodes: WFNode[];
  edges: WFEdge[];
  selectedNodeId: string | null;
  onNodesChange: (nodes: WFNode[]) => void;
  onEdgesChange: (edges: WFEdge[]) => void;
  onSelectNode: (id: string | null) => void;
}

interface LoopDialogState {
  connection: Connection;
}

interface ContextMenuState {
  x: number;
  y: number;
  edgeId: string;
}

function ContextMenuPanel({
  menu,
  onDelete,
  onClose,
}: {
  menu: ContextMenuState;
  onDelete: (edgeId: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // close on any click outside
      onClose();
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      className="absolute z-50 bg-[#111111] border border-[#2A2A2A] rounded-xl shadow-2xl py-1 min-w-[140px]"
      style={{ left: menu.x, top: menu.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => { onDelete(menu.edgeId); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#EF4444] hover:bg-[#1A1A1A] transition-colors"
      >
        <Trash2 size={12} />
        Delete Edge
      </button>
    </div>
  );
}

function LoopConfigDialog({ onConfirm, onCancel, initialIterations, title, description }: {
  onConfirm: (iterations: number) => void;
  onCancel: () => void;
  initialIterations?: number;
  title?: string;
  description?: string;
}) {
  const [iterations, setIterations] = useState(initialIterations ?? 3);
  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#111111] border border-[#F59E0B]/40 rounded-2xl p-6 w-80 shadow-2xl">
        <div className="flex items-center gap-2 mb-4">
          <RefreshCw size={16} className="text-[#F59E0B]" />
          <p className="text-[14px] font-bold text-[#F2F2F2]">{title ?? "Loop Detected"}</p>
        </div>
        <p className="text-[12px] text-[#666] mb-4">{description ?? "Configure the number of iterations before the workflow continues."}</p>
        <label className="block text-[11px] text-[#666] uppercase tracking-wider mb-1">Iterations (min 1, max 100)</label>
        <input
          type="number" min={1} max={100} value={iterations}
          onChange={(e) => setIterations(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
          className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-[#F2F2F2] focus:border-[#F59E0B] focus:outline-none mb-2"
        />
        <p className="text-[11px] text-[#555] mb-4">The loop exits after {iterations} iteration{iterations !== 1 ? "s" : ""} and continues to the next connected node.</p>
        <div className="flex gap-2">
          <button onClick={() => onConfirm(iterations)} className="flex-1 bg-[#F59E0B] text-[#0D0D0D] rounded-lg py-2 text-sm font-bold hover:bg-[#D97706] transition-colors">Confirm Loop</button>
          <button onClick={onCancel} className="flex-1 bg-[#1A1A1A] border border-[#2A2A2A] text-[#666] rounded-lg py-2 text-sm hover:text-[#A3A3A3] transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function CanvasInner({ nodes: propNodes, edges: propEdges, selectedNodeId, onNodesChange, onEdgesChange, onSelectNode }: Props) {
  const [rfNodes, setRfNodes, onRFNodesChange] = useNodesState(propNodes.map(toRFNode));
  const [rfEdges, setRfEdges, onRFEdgesChange] = useEdgesState(propEdges.map((e) => toRFEdge(e)));
  const { screenToFlowPosition } = useReactFlow();
  const idCounter = useRef(Date.now());
  const isDragging = useRef(false);
  const [loopDialog, setLoopDialog] = useState<LoopDialogState | null>(null);
  const [editingLoopEdge, setEditingLoopEdge] = useState<{ edgeId: string; iterations: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Loop edge detection
  const loopEdgeIds = useMemo(() => detectLoopEdges(rfEdges), [rfEdges]);

  // Sync from parent when props change (e.g. template applied)
  const lastPropNodes = useRef<string>("");
  useEffect(() => {
    const s = JSON.stringify(propNodes);
    if (s !== lastPropNodes.current) {
      lastPropNodes.current = s;
      setRfNodes(propNodes.map(toRFNode));
    }
  }, [propNodes, setRfNodes]);

  const lastPropEdges = useRef<string>("");
  useEffect(() => {
    const s = JSON.stringify(propEdges);
    if (s !== lastPropEdges.current) {
      lastPropEdges.current = s;
      setRfEdges(propEdges.map((e) => toRFEdge(e, loopEdgeIds.has(e.id))));
    }
  }, [propEdges, setRfEdges, loopEdgeIds]);

  // Stable ref to always-fresh rfNodes — updated every render (safe for refs)
  const rfNodesRef = useRef(rfNodes);
  rfNodesRef.current = rfNodes;

  // Stable ref to always-fresh rfEdges
  const rfEdgesRef = useRef(rfEdges);
  rfEdgesRef.current = rfEdges;

  const handleNodesChange: OnNodesChange = useCallback((changes) => {
    onRFNodesChange(changes);
    // Propagate node deletions upward immediately (without waiting for useEffect)
    const removed = changes.filter(c => c.type === "remove");
    if (removed.length > 0) {
      const removedIds = new Set(removed.map(c => (c as { id: string }).id));
      const remaining = rfNodesRef.current.filter(n => !removedIds.has(n.id));
      onNodesChange(remaining.map(fromRFNode));
    }
  }, [onRFNodesChange, onNodesChange]);

  const handleEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    // Get position relative to the canvas container div
    const rect = (event.currentTarget as Element).closest('.react-flow')?.getBoundingClientRect();
    const x = rect ? event.clientX - rect.left : event.clientX;
    const y = rect ? event.clientY - rect.top : event.clientY;
    setContextMenu({ x, y, edgeId: edge.id });
  }, []);

  const handleContextMenuDelete = useCallback((edgeId: string) => {
    const updated = rfEdgesRef.current.filter((e) => e.id !== edgeId);
    setRfEdges(updated);
    onEdgesChange(updated.map(fromRFEdge));
  }, [setRfEdges, onEdgesChange]);

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleEdgesChange: OnEdgesChange = useCallback((changes) => {
    onRFEdgesChange(changes);
    // Propagate edge deletions upward immediately
    const removed = changes.filter(c => c.type === "remove");
    if (removed.length > 0) {
      const removedIds = new Set(removed.map(c => (c as { id: string }).id));
      const remaining = rfEdgesRef.current.filter(e => !removedIds.has(e.id));
      onEdgesChange(remaining.map(fromRFEdge));
    }
  }, [onRFEdgesChange, onEdgesChange]);

  const handleConnect: OnConnect = useCallback((connection) => {
    if (connection.source && connection.target &&
        pathExists(connection.target, connection.source, rfEdgesRef.current)) {
      setLoopDialog({ connection });
      return;
    }
    const newEdge = addEdge({
      ...connection,
      animated: true,
      style: { stroke: "#49C5B6", strokeWidth: 2 }
    }, rfEdgesRef.current);
    setRfEdges(newEdge);
    onEdgesChange(newEdge.map(fromRFEdge));
  }, [setRfEdges, onEdgesChange]);

  const handleLoopConfirm = useCallback((iterations: number) => {
    if (!loopDialog) return;
    const { connection } = loopDialog;
    const newEdge: Edge = {
      id: `e${++idCounter.current}`,
      source: connection.source!,
      target: connection.target!,
      sourceHandle: connection.sourceHandle ?? null,
      targetHandle: connection.targetHandle ?? null,
      animated: true,
      label: `⟲ ${iterations}x`,
      style: { stroke: "#F59E0B", strokeWidth: 2.5, strokeDasharray: "6 3" },
      data: { loop_config: { iterations } },
    };
    const updated = [...rfEdgesRef.current, newEdge];
    setRfEdges(updated);
    onEdgesChange(updated.map(fromRFEdge));
    setLoopDialog(null);
  }, [loopDialog, setRfEdges, onEdgesChange]);

  const handleLoopCancel = useCallback(() => {
    setLoopDialog(null);
  }, []);

  // Edit existing loop edge (click on amber loop edge)
  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    if (loopEdgeIds.has(edge.id)) {
      const currentIterations = (edge.data as { loop_config?: { iterations: number } })?.loop_config?.iterations ?? 3;
      setEditingLoopEdge({ edgeId: edge.id, iterations: currentIterations });
    }
  }, [loopEdgeIds]);

  const handleEditLoopConfirm = useCallback((iterations: number) => {
    if (!editingLoopEdge) return;
    const updated = rfEdgesRef.current.map((e) =>
      e.id === editingLoopEdge.edgeId
        ? { ...e, label: `⟲ ${iterations}x`, data: { loop_config: { iterations } } }
        : e
    );
    setRfEdges(updated);
    onEdgesChange(updated.map(fromRFEdge));
    setEditingLoopEdge(null);
  }, [editingLoopEdge, setRfEdges, onEdgesChange]);

  const handleEditLoopCancel = useCallback(() => {
    setEditingLoopEdge(null);
  }, []);

  // NO useEffect propagating rfNodes upward — that caused a cascade during drag.
  // Instead, propagation is done explicitly in specific event handlers below.

  const onNodeDragStart = useCallback(() => {
    isDragging.current = true;
  }, []);

  // onNodeDragStop uses rfNodesRef (stable, always fresh) — no stale closure risk
  const onNodeDragStop = useCallback(() => {
    isDragging.current = false;
    onNodesChange(rfNodesRef.current.map(fromRFNode));
  }, [onNodesChange]); // stable — no rfNodes in deps

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/reactflow") as WFNodeType;
    if (!type) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const wfNode: WFNode = {
      id: `n${++idCounter.current}`,
      type: type as WFNodeType,
      position,
      data: defaultNodeData(type as WFNodeType),
    };
    const rfNode: Node = {
      id: wfNode.id, type: wfNode.type, position: wfNode.position,
      data: wfNode.data as unknown as Record<string, unknown>,
    };
    setRfNodes((nds) => [...nds, rfNode]);
    // Propagate to parent immediately (rfNodesRef not yet updated for this render)
    onNodesChange([...rfNodesRef.current.map(fromRFNode), wfNode]);
  }, [screenToFlowPosition, setRfNodes, onNodesChange]);

  // Apply loop styling to loop edges
  const styledEdges = useMemo(() =>
    rfEdges.map((e) => loopEdgeIds.has(e.id)
      ? { ...e, style: { stroke: "#F59E0B", strokeWidth: 2.5, strokeDasharray: "6 3" }, animated: true }
      : e
    ),
  [rfEdges, loopEdgeIds]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={rfNodes.map((n) => ({ ...n, selected: n.id === selectedNodeId }))}
        edges={styledEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onEdgeClick={handleEdgeClick}
        onPaneClick={() => { onSelectNode(null); setContextMenu(null); }}
        onEdgeContextMenu={handleEdgeContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode="Delete"
        proOptions={{ hideAttribution: true }}
        style={{ background: "#0D0D0D" }}
      >
        <Background variant={BackgroundVariant.Dots} color="#1A1A1A" gap={20} size={1.5} />
        <Controls
          style={{ background: "#111111", border: "1px solid #2A2A2A" }}
          showInteractive={false}
        />
        <MiniMap
          style={{ background: "#111111", border: "1px solid #2A2A2A" }}
          nodeColor={(n) => {
            const t = n.type;
            if (t === "trigger") return "#49C5B6";
            if (t === "command") return "#F59E0B";
            if (t === "script") return "#A78BFA";
            if (t === "file_write") return "#60A5FA";
            if (t === "variable") return "#FB923C";
            if (t === "delay") return "#94A3B8";
            if (t === "validation") return "#22C55E";
            return "#FBBF24";
          }}
          maskColor="rgba(0,0,0,0.6)"
        />
      </ReactFlow>
      {loopDialog && (
        <LoopConfigDialog onConfirm={handleLoopConfirm} onCancel={handleLoopCancel} />
      )}
      {editingLoopEdge && (
        <LoopConfigDialog
          onConfirm={handleEditLoopConfirm}
          onCancel={handleEditLoopCancel}
          initialIterations={editingLoopEdge.iterations}
          title="Edit Loop"
          description="Update the number of iterations for this loop connection."
        />
      )}
      {contextMenu && (
        <ContextMenuPanel
          menu={contextMenu}
          onDelete={handleContextMenuDelete}
          onClose={handleContextMenuClose}
        />
      )}
    </div>
  );
}

export function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
