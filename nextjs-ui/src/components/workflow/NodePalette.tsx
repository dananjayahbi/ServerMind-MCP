"use client";
import { Zap, Terminal, Code2, FileCode2, Braces, Clock, StickyNote, ShieldCheck, Upload } from "lucide-react";

const NODE_TYPES = [
  {
    group: "Execution",
    items: [
      { type: "trigger", label: "Trigger", desc: "Start of workflow", icon: Zap, color: "#49C5B6" },
      { type: "command", label: "Command", desc: "Run a shell command", icon: Terminal, color: "#F59E0B" },
      { type: "script", label: "Script", desc: "Multi-line bash script", icon: Code2, color: "#A78BFA" },
      { type: "file_write", label: "Write File", desc: "Write file to remote", icon: FileCode2, color: "#60A5FA" },
      { type: "file_upload", label: "Upload File", desc: "Upload local file via SFTP", icon: Upload, color: "#10B981" },
    ],
  },
  {
    group: "Utilities",
    items: [
      { type: "variable", label: "Set Variable", desc: "Define/override a variable", icon: Braces, color: "#FB923C" },
      { type: "delay", label: "Delay", desc: "Pause execution", icon: Clock, color: "#94A3B8" },
      { type: "validation", label: "Validation", desc: "Check output / exit code", icon: ShieldCheck, color: "#22C55E" },
      { type: "note", label: "Note", desc: "Annotation / comment", icon: StickyNote, color: "#FBBF24" },
    ],
  },
];

function onDragStart(event: React.DragEvent, nodeType: string) {
  event.dataTransfer.setData("application/reactflow", nodeType);
  event.dataTransfer.effectAllowed = "move";
}

export function NodePalette() {
  return (
    <div className="flex flex-col gap-4 p-3 overflow-y-auto">
      <p className="text-[11px] uppercase tracking-widest text-[#49C5B6] font-semibold px-1">Nodes</p>
      {NODE_TYPES.map((group) => (
        <div key={group.group}>
          <p className="text-[10px] uppercase tracking-widest text-[#555] px-1 mb-2">{group.group}</p>
          <div className="flex flex-col gap-1.5">
            {group.items.map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => onDragStart(e, item.type)}
                className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#111111] border border-[#2A2A2A] cursor-grab hover:border-[#3A3A3A] hover:bg-[#181818] transition-all select-none active:cursor-grabbing"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: item.color + "20" }}
                >
                  <item.icon size={14} style={{ color: item.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-[#E2E2E2] leading-tight">{item.label}</p>
                  <p className="text-[10px] text-[#555] leading-tight">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-2 px-1">
        <p className="text-[10px] text-[#444] leading-relaxed">
          Drag nodes onto the canvas. Use <span className="text-[#49C5B6]">{"{{variable}}"}</span> syntax in commands.
        </p>
      </div>
    </div>
  );
}
