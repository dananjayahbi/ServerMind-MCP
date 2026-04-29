"use client";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { FileCode2 } from "lucide-react";
import type { FileWriteNodeData } from "@/types/workflow";

export function FileWriteNode({ data, selected }: NodeProps) {
  const d = data as unknown as FileWriteNodeData;
  return (
    <div className={`min-w-[240px] max-w-[320px] rounded-xl border-2 transition-all ${selected ? "border-[#60A5FA] shadow-[0_0_10px_#60A5FA]" : "border-[#60A5FA]/30"} bg-[#0D1220] p-3 relative`}>
      <Handle id="target" type="target" position={Position.Top} className="!bg-[#60A5FA]/60 !border-[#0D0D0D] !w-3 !h-3" />
      <Handle id="source" type="source" position={Position.Bottom} className="!bg-[#60A5FA] !border-[#0D0D0D] !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-[#60A5FA]/15 flex items-center justify-center flex-shrink-0">
          <FileCode2 size={14} className="text-[#60A5FA]" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#60A5FA]">Write File</p>
          <p className="text-[13px] font-medium text-[#F2F2F2] leading-tight truncate">{d.label}</p>
        </div>
      </div>
      <div className="rounded-md bg-[#0D0D0D] px-2 py-1.5 font-mono text-[11px] text-[#60A5FA] truncate">
        {d.remote_path || <span className="text-[#444]">No path</span>}
      </div>
      {d.sudo && (
        <span className="mt-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#60A5FA]/10 text-[#60A5FA] border border-[#60A5FA]/20">
          sudo
        </span>
      )}
    </div>
  );
}
