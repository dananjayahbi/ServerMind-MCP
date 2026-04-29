"use client";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Clock } from "lucide-react";
import type { DelayNodeData } from "@/types/workflow";

export function DelayNode({ data, selected }: NodeProps) {
  const d = data as unknown as DelayNodeData;
  return (
    <div className={`min-w-[180px] rounded-xl border-2 transition-all ${selected ? "border-[#94A3B8] shadow-[0_0_10px_#94A3B8]" : "border-[#94A3B8]/30"} bg-[#111318] p-3`}>
      <Handle type="target" position={Position.Top} className="!bg-[#94A3B8] !border-[#0D0D0D] !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[#94A3B8]/15 flex items-center justify-center flex-shrink-0">
          <Clock size={14} className="text-[#94A3B8]" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#94A3B8]">Delay</p>
          <p className="text-[13px] font-medium text-[#F2F2F2]">Wait {d.seconds ?? 0}s</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-[#94A3B8] !border-[#0D0D0D] !w-3 !h-3" />
    </div>
  );
}
