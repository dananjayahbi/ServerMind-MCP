"use client";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Upload } from "lucide-react";
import type { FileUploadNodeData } from "@/types/workflow";

export function FileUploadNode({ data, selected }: NodeProps) {
  const d = data as unknown as FileUploadNodeData;
  return (
    <div className={`min-w-[240px] max-w-[320px] rounded-xl border-2 transition-all ${selected ? "border-[#10B981] shadow-[0_0_10px_#10B981]" : "border-[#10B981]/30"} bg-[#0A1A12] p-3 relative`}>
      <Handle id="target" type="target" position={Position.Top} className="!bg-[#10B981]/60 !border-[#0D0D0D] !w-3 !h-3" />
      <Handle id="source" type="source" position={Position.Bottom} className="!bg-[#10B981] !border-[#0D0D0D] !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-[#10B981]/15 flex items-center justify-center flex-shrink-0">
          <Upload size={14} className="text-[#10B981]" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#10B981]">Upload File</p>
          <p className="text-[13px] font-medium text-[#F2F2F2] leading-tight truncate">{d.label}</p>
        </div>
      </div>
      <div className="rounded-md bg-[#0D0D0D] px-2 py-1.5 font-mono text-[11px] text-[#A3A3A3] truncate mb-1.5">
        {d.local_file_name ? (
          <span className="text-[#10B981]">{d.local_file_name}</span>
        ) : (
          <span className="text-[#444]">No file selected</span>
        )}
      </div>
      <div className="rounded-md bg-[#0D0D0D] px-2 py-1.5 font-mono text-[11px] text-[#10B981] truncate">
        {d.remote_path || <span className="text-[#444]">No remote path</span>}
      </div>
      {d.extract && (
        <span className="mt-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">
          auto-extract
        </span>
      )}
    </div>
  );
}
