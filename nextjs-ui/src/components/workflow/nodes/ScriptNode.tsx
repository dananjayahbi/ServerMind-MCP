"use client";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Code2 } from "lucide-react";
import type { ScriptNodeData } from "@/types/workflow";

export function ScriptNode({ data, selected }: NodeProps) {
  const d = data as unknown as ScriptNodeData;
  const lines = (d.script || "").split("\n").slice(0, 3).join("\n");
  return (
    <div className={`min-w-[240px] max-w-[320px] rounded-xl border-2 transition-all ${selected ? "border-[#A78BFA] shadow-[0_0_10px_#A78BFA]" : "border-[#A78BFA]/30"} bg-[#130D1A] p-3 relative`}>
      {/* Two inputs at top */}
      <Handle id="target-a" type="target" position={Position.Top} style={{ left: '30%' }} className="!bg-[#A78BFA]/60 !border-[#0D0D0D] !w-3 !h-3" />
      <Handle id="target-b" type="target" position={Position.Top} style={{ left: '70%' }} className="!bg-[#A78BFA]/60 !border-[#0D0D0D] !w-3 !h-3" />
      {/* Two outputs at bottom */}
      <Handle id="source-a" type="source" position={Position.Bottom} style={{ left: '30%' }} className="!bg-[#A78BFA] !border-[#0D0D0D] !w-3 !h-3" />
      <Handle id="source-b" type="source" position={Position.Bottom} style={{ left: '70%' }} className="!bg-[#A78BFA] !border-[#0D0D0D] !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-[#A78BFA]/15 flex items-center justify-center flex-shrink-0">
          <Code2 size={14} className="text-[#A78BFA]" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A78BFA]">Script</p>
          <p className="text-[13px] font-medium text-[#F2F2F2] leading-tight truncate">{d.label}</p>
        </div>
      </div>
      <div className="rounded-md bg-[#0D0D0D] px-2 py-1.5 font-mono text-[11px] text-[#A78BFA] leading-snug whitespace-pre-wrap line-clamp-3">
        {lines || <span className="text-[#444]">No script</span>}
      </div>
    </div>
  );
}
