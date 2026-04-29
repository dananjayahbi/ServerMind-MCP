"use client";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import type { TriggerNodeData } from "@/types/workflow";

export function TriggerNode({ data, selected }: NodeProps) {
  const d = data as unknown as TriggerNodeData;
  return (
    <div className={`min-w-[220px] rounded-xl border-2 transition-all ${selected ? "border-[#49C5B6] shadow-[0_0_12px_#49C5B6]" : "border-[#49C5B6]/40"} bg-[#0D1F1D] p-3`}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[#49C5B6]/20 flex items-center justify-center flex-shrink-0">
          <Zap size={14} className="text-[#49C5B6]" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#49C5B6]">Trigger</p>
          <p className="text-[13px] font-medium text-[#F2F2F2] leading-tight">{d.label}</p>
        </div>
      </div>
      {d.description && <p className="mt-1.5 text-[11px] text-[#666666] leading-snug">{d.description}</p>}
      <Handle type="source" position={Position.Bottom} className="!bg-[#49C5B6] !border-[#0D0D0D] !w-3 !h-3" />
    </div>
  );
}
