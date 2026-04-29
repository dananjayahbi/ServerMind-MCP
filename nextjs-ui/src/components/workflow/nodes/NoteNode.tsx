"use client";
import { NodeProps } from "@xyflow/react";
import { StickyNote } from "lucide-react";
import type { NoteNodeData } from "@/types/workflow";

export function NoteNode({ data, selected }: NodeProps) {
  const d = data as unknown as NoteNodeData;
  return (
    <div className={`min-w-[200px] max-w-[280px] rounded-xl border-2 transition-all ${selected ? "border-[#FBBF24] shadow-[0_0_8px_#FBBF24]" : "border-[#FBBF24]/30"} bg-[#1A1800] p-3`}>
      <div className="flex items-center gap-2 mb-1.5">
        <StickyNote size={13} className="text-[#FBBF24]" />
        <p className="text-[11px] font-semibold text-[#FBBF24] truncate">{d.label}</p>
      </div>
      <p className="text-[12px] text-[#A3A3A3] leading-snug whitespace-pre-wrap">{d.text}</p>
    </div>
  );
}
