"use client";
import { useCallback, useRef, useEffect } from "react";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TriggerNode } from "./nodes/TriggerNode";
import { CommandNode } from "./nodes/CommandNode";
import { ScriptNode } from "./nodes/ScriptNode";
import { FileWriteNode } from "./nodes/FileWriteNode";
import { VariableNode } from "./nodes/VariableNode";
import { DelayNode } from "./nodes/DelayNode";
import { NoteNode } from "./nodes/NoteNode";
import type { WFNode, WFEdge, WFNodeType } from "@/types/workflow";

const nodeTypes = {
  trigger: TriggerNode,
  command: CommandNode,
  script: ScriptNode,
  file_write: FileWriteNode,
  variable: VariableNode,
  delay: DelayNode,
  note: NoteNode,
};

function toRFNode(n: WFNode): Node {
  return { id: n.id, type: n.type, position: n.position, data: n.data as unknown as Record<string, unknown> };
}
function toRFEdge(e: WFEdge): Edge {
  return { id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined, label: e.label, animated: true, style: { stroke: "#49C5B6", strokeWidth: 2 } };
}
function fromRFNode(n: Node): WFNode {
  return { id: n.id, type: n.type as WFNodeType, position: n.position, data: n.data as unknown as WFNode["data"] };
}
function fromRFEdge(e: Edge): WFEdge {
  return { id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null, label: typeof e.label === "string" ? e.label : undefined };
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

function CanvasInner({ nodes: propNodes, edges: propEdges, selectedNodeId, onNodesChange, onEdgesChange, onSelectNode }: Props) {
  const [rfNodes, setRfNodes, onRFNodesChange] = useNodesState(propNodes.map(toRFNode));
  const [rfEdges, setRfEdges, onRFEdgesChange] = useEdgesState(propEdges.map(toRFEdge));
  const { screenToFlowPosition } = useReactFlow();
  const idCounter = useRef(Date.now());

  // Sync from parent when props change (e.g. template applied)
  const lastPropNodes = useRef<string>("");
  useEffect(() => {
    const s = JSON.stringify(propNodes);
    if (s !== lastPropNodes.current) {
      lastPropNodes.current = s;
      setRfNodes(propNodes.map(toRFNode));
    }
  }, [propNodes]);

  const lastPropEdges = useRef<string>("");
  useEffect(() => {
    const s = JSON.stringify(propEdges);
    if (s !== lastPropEdges.current) {
      lastPropEdges.current = s;
      setRfEdges(propEdges.map(toRFEdge));
    }
  }, [propEdges]);

  const handleNodesChange: OnNodesChange = useCallback((changes) => {
    onRFNodesChange(changes);
  }, [onRFNodesChange]);

  const handleEdgesChange: OnEdgesChange = useCallback((changes) => {
    onRFEdgesChange(changes);
  }, [onRFEdgesChange]);

  const handleConnect: OnConnect = useCallback((connection) => {
    setRfEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: "#49C5B6", strokeWidth: 2 } }, eds));
  }, []);

  // Propagate changes upward
  useEffect(() => {
    onNodesChange(rfNodes.map(fromRFNode));
  }, [rfNodes]);

  useEffect(() => {
    onEdgesChange(rfEdges.map(fromRFEdge));
  }, [rfEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/reactflow") as WFNodeType;
    if (!type) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const newNode: Node = {
      id: `n${++idCounter.current}`,
      type,
      position,
      data: defaultNodeData(type) as unknown as Record<string, unknown>,
    };
    setRfNodes((nds) => [...nds, newNode]);
  }, [screenToFlowPosition]);

  return (
    <ReactFlow
      nodes={rfNodes.map((n) => ({ ...n, selected: n.id === selectedNodeId }))}
      edges={rfEdges}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      onConnect={handleConnect}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      onPaneClick={() => onSelectNode(null)}
      onDragOver={onDragOver}
      onDrop={onDrop}
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
          return "#FBBF24";
        }}
        maskColor="rgba(0,0,0,0.6)"
      />
    </ReactFlow>
  );
}

export function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
