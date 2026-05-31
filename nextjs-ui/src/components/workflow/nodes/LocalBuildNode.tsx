"use client";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { HammerIcon } from "lucide-react";
import type { LocalBuildNodeData } from "@/types/workflow";

export function LocalBuildNode({ data, selected }: NodeProps) {
  const d = data as unknown as LocalBuildNodeData;
  return (
    <div
      className={`min-w-[240px] max-w-[320px] rounded-xl border-2 transition-all ${
        selected
          ? "border-[#E879F9] shadow-[0_0_10px_#E879F9]"
          : "border-[#E879F9]/30"
      } bg-[#170D1F] p-3 relative`}
    >
      <Handle
        id="target"
        type="target"
        position={Position.Top}
        className="!bg-[#E879F9]/60 !border-[#0D0D0D] !w-3 !h-3"
      />
      <Handle
        id="source"
        type="source"
        position={Position.Bottom}
        className="!bg-[#E879F9] !border-[#0D0D0D] !w-3 !h-3"
      />
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-[#E879F9]/15 flex items-center justify-center flex-shrink-0">
          <HammerIcon size={14} className="text-[#E879F9]" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E879F9]">
            Local Build
          </p>
          <p className="text-[13px] font-medium text-[#F2F2F2] leading-tight truncate">
            {d.label}
          </p>
        </div>
      </div>
      <div className="rounded-md bg-[#0D0D0D] px-2 py-1.5 font-mono text-[11px] text-[#49C5B6] break-all leading-snug line-clamp-2">
        {d.command || <span className="text-[#444]">No command</span>}
      </div>
      {d.working_directory && (
        <div className="mt-1.5 rounded-md bg-[#0D0D0D] px-2 py-1 font-mono text-[10px] text-[#888] truncate">
          📁 {d.working_directory}
        </div>
      )}
      {d.continue_on_error && (
        <span className="mt-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#E879F9]/10 text-[#E879F9] border border-[#E879F9]/20">
          continue on error
        </span>
      )}
    </div>
  );
}
