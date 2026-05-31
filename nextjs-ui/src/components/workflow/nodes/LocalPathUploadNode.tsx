"use client";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { FolderOpen } from "lucide-react";
import type { LocalPathUploadNodeData } from "@/types/workflow";

export function LocalPathUploadNode({ data, selected }: NodeProps) {
  const d = data as unknown as LocalPathUploadNodeData;
  const fileName = d.local_path
    ? d.local_path.split(/[/\\]/).pop() || d.local_path
    : null;

  return (
    <div
      className={`min-w-[240px] max-w-[320px] rounded-xl border-2 transition-all ${
        selected
          ? "border-[#38BDF8] shadow-[0_0_10px_#38BDF8]"
          : "border-[#38BDF8]/30"
      } bg-[#0A1320] p-3 relative`}
    >
      <Handle
        id="target"
        type="target"
        position={Position.Top}
        className="!bg-[#38BDF8]/60 !border-[#0D0D0D] !w-3 !h-3"
      />
      <Handle
        id="source"
        type="source"
        position={Position.Bottom}
        className="!bg-[#38BDF8] !border-[#0D0D0D] !w-3 !h-3"
      />
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-[#38BDF8]/15 flex items-center justify-center flex-shrink-0">
          <FolderOpen size={14} className="text-[#38BDF8]" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#38BDF8]">
            Path Upload
          </p>
          <p className="text-[13px] font-medium text-[#F2F2F2] leading-tight truncate">
            {d.label}
          </p>
        </div>
      </div>
      <div className="rounded-md bg-[#0D0D0D] px-2 py-1.5 font-mono text-[11px] truncate mb-1.5">
        {fileName ? (
          <span className="text-[#38BDF8]">{fileName}</span>
        ) : (
          <span className="text-[#444]">No path configured</span>
        )}
      </div>
      <div className="rounded-md bg-[#0D0D0D] px-2 py-1.5 font-mono text-[11px] text-[#38BDF8] truncate">
        {d.remote_path || <span className="text-[#444]">No remote path</span>}
      </div>
      {d.extract && (
        <span className="mt-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/20">
          auto-extract
        </span>
      )}
    </div>
  );
}
