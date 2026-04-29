"use client";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Braces } from "lucide-react";
import type { VariableNodeData } from "@/types/workflow";

export function VariableNode({ data, selected }: NodeProps) {
  const d = data as unknown as VariableNodeData;
  return (
    <div className={`min-w-[220px] max-w-[300px] rounded-xl border-2 transition-all ${selected ? "border-[#FB923C] shadow-[0_0_10px_#FB923C]" : "border-[#FB923C]/30"} bg-[#1A0E05] p-3`}>
      <Handle type="target" position={Position.Top} className="!bg-[#FB923C] !border-[#0D0D0D] !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-[#FB923C]/15 flex items-center justify-center flex-shrink-0">
          <Braces size={14} className="text-[#FB923C]" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#FB923C]">Set Variable</p>
          <p className="text-[13px] font-medium text-[#F2F2F2] leading-tight truncate">{d.label}</p>
        </div>
      </div>
      <div className="rounded-md bg-[#0D0D0D] px-2 py-1.5 font-mono text-[11px] text-[#FB923C]">
        <span className="text-[#F2F2F2]">{d.key || "key"}</span>
        <span className="text-[#666]"> = </span>
        <span>{d.value || <span className="text-[#444]">empty</span>}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-[#FB923C] !border-[#0D0D0D] !w-3 !h-3" />
    </div>
  );
}
