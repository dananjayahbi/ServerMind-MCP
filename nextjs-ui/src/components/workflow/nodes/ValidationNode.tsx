"use client";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { ShieldCheck } from "lucide-react";
import type { ValidationNodeData } from "@/types/workflow";

export function ValidationNode({ data, selected }: NodeProps) {
  const d = data as unknown as ValidationNodeData;
  const modeColor: Record<string, string> = {
    contains: "#22C55E", regex: "#86EFAC", exit_code: "#4ADE80"
  };
  return (
    <div className={`min-w-[240px] max-w-[320px] rounded-xl border-2 transition-all ${selected ? "border-[#22C55E] shadow-[0_0_10px_#22C55E]" : "border-[#22C55E]/30"} bg-[#0D1A10] p-3 relative`}>
      <Handle id="target" type="target" position={Position.Top} className="!bg-[#22C55E]/60 !border-[#0D0D0D] !w-3 !h-3" />
      {/* Two outputs: pass (left, green) and fail (right, red) */}
      <Handle id="source-pass" type="source" position={Position.Bottom} style={{ left: '30%' }} className="!bg-[#22C55E] !border-[#0D0D0D] !w-3 !h-3" />
      <Handle id="source-fail" type="source" position={Position.Bottom} style={{ left: '70%' }} className="!bg-[#EF4444] !border-[#0D0D0D] !w-3 !h-3" />

      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-[#22C55E]/15 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={14} className="text-[#22C55E]" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#22C55E]">Validation</p>
          <p className="text-[13px] font-medium text-[#F2F2F2] leading-tight truncate">{d.label}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium"
          style={{ color: modeColor[d.mode] || "#22C55E", borderColor: (modeColor[d.mode] || "#22C55E") + "40", background: (modeColor[d.mode] || "#22C55E") + "15" }}>
          {d.mode || "contains"}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444] font-medium">
          on fail: {d.on_fail || "pause"}
        </span>
      </div>
      <div className="rounded-md bg-[#0D0D0D] px-2 py-1.5 font-mono text-[11px] text-[#22C55E] truncate">
        {d.expect || <span className="text-[#444]">No pattern set</span>}
      </div>
    </div>
  );
}
