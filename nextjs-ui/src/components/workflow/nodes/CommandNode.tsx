"use client";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Terminal } from "lucide-react";
import type { CommandNodeData } from "@/types/workflow";

export function CommandNode({ data, selected }: NodeProps) {
  const d = data as unknown as CommandNodeData;
  return (
    <div className={`min-w-[240px] max-w-[320px] rounded-xl border-2 transition-all ${selected ? "border-[#F59E0B] shadow-[0_0_10px_#F59E0B]" : "border-[#F59E0B]/30"} bg-[#1A1A0D] p-3`}>
      <Handle type="target" position={Position.Top} className="!bg-[#F59E0B] !border-[#0D0D0D] !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-[#F59E0B]/15 flex items-center justify-center flex-shrink-0">
          <Terminal size={14} className="text-[#F59E0B]" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#F59E0B]">Command</p>
          <p className="text-[13px] font-medium text-[#F2F2F2] leading-tight truncate">{d.label}</p>
        </div>
      </div>
      <div className="rounded-md bg-[#0D0D0D] px-2 py-1.5 font-mono text-[11px] text-[#49C5B6] break-all leading-snug line-clamp-2">
        {d.command || <span className="text-[#444]">No command</span>}
      </div>
      {d.continue_on_error && (
        <span className="mt-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20">
          continue on error
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-[#F59E0B] !border-[#0D0D0D] !w-3 !h-3" />
    </div>
  );
}
