"use client";
import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import type { WFNode, CommandNodeData, ScriptNodeData, FileWriteNodeData, FileUploadNodeData, VariableNodeData, DelayNodeData, NoteNodeData, TriggerNodeData, ValidationNodeData } from "@/types/workflow";

interface Props {
  node: WFNode | null;
  onChange: (updated: WFNode) => void;
}

const inputCls = "w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-[#F2F2F2] focus:border-[#49C5B6] focus:outline-none transition-colors placeholder:text-[#444]";
const labelCls = "block text-[11px] font-medium text-[#666666] uppercase tracking-wider mb-1";
const checkCls = "w-4 h-4 rounded accent-[#49C5B6]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function FileUploadField({
  fileId,
  fileName,
  onUpload,
  onClear,
}: {
  fileId?: string;
  fileName?: string;
  onUpload: (fileId: string, fileName: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/workflows/upload-file", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onUpload(data.file_id, data.file_name);
    } catch (err) {
      setUploadError(String(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <label className={labelCls}>Local File</label>
      <input ref={inputRef} type="file" className="hidden" onChange={handleFile} />
      {fileId ? (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#0D0D0D] border border-[#10B981]/30">
          <Upload size={13} className="text-[#10B981] flex-shrink-0" />
          <span className="text-[11px] text-[#F2F2F2] truncate flex-1">{fileName}</span>
          <button
            onClick={onClear}
            className="text-[#555] hover:text-[#EF4444] transition-colors flex-shrink-0"
          >
            <X size={11} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-[#2A2A2A] text-[#555] hover:border-[#10B981]/40 hover:text-[#10B981] transition-all text-[12px] disabled:opacity-50"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? "Uploading..." : "Choose File"}
        </button>
      )}
      {uploadError && <p className="text-[10px] text-[#EF4444] mt-1">{uploadError}</p>}
    </div>
  );
}

export function NodePropertiesPanel({ node, onChange }: Props) {
  if (!node) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="w-12 h-12 rounded-2xl bg-[#1A1A1A] flex items-center justify-center mb-3">
          <span className="text-[#444] text-xl">↖</span>
        </div>
        <p className="text-[13px] text-[#555] leading-snug">Select a node to edit its properties</p>
      </div>
    );
  }

  function update(patch: Partial<WFNode["data"]>) {
    onChange({ ...node!, data: { ...node!.data, ...patch } as WFNode["data"] });
  }

  const d = node.data as unknown as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      <div>
        <p className="text-[12px] uppercase tracking-widest text-[#49C5B6] font-semibold mb-3">{node.type.replace("_", " ")}</p>
      </div>

      <Field label="Label">
        <input className={inputCls} value={(d.label as string) || ""} onChange={(e) => update({ label: e.target.value })} placeholder="Node label..." />
      </Field>

      {node.type === "trigger" && (
        <Field label="Description">
          <input className={inputCls} value={(d.description as string) || ""} onChange={(e) => update({ description: e.target.value })} placeholder="Optional description..." />
        </Field>
      )}

      {node.type === "command" && (
        <>
          <Field label="Command">
            <textarea className={inputCls + " font-mono resize-none h-24"} value={(d.command as string) || ""} onChange={(e) => update({ command: e.target.value })} placeholder="sudo apt update..." />
          </Field>
          <Field label="Timeout (seconds)">
            <input type="number" className={inputCls} value={(d.timeout as number) || 300} onChange={(e) => update({ timeout: parseInt(e.target.value) })} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-[#A3A3A3] cursor-pointer">
            <input type="checkbox" className={checkCls} checked={!!(d.continue_on_error)} onChange={(e) => update({ continue_on_error: e.target.checked })} />
            Continue on error
          </label>
        </>
      )}

      {node.type === "script" && (
        <>
          <Field label="Script (bash)">
            <textarea className={inputCls + " font-mono resize-none h-40"} value={(d.script as string) || ""} onChange={(e) => update({ script: e.target.value })} placeholder="#!/bin/bash&#10;..." />
          </Field>
          <Field label="Timeout (seconds)">
            <input type="number" className={inputCls} value={(d.timeout as number) || 600} onChange={(e) => update({ timeout: parseInt(e.target.value) })} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-[#A3A3A3] cursor-pointer">
            <input type="checkbox" className={checkCls} checked={!!(d.continue_on_error)} onChange={(e) => update({ continue_on_error: e.target.checked })} />
            Continue on error
          </label>
        </>
      )}

      {node.type === "file_write" && (
        <>
          <Field label="Remote Path">
            <input className={inputCls + " font-mono"} value={(d.remote_path as string) || ""} onChange={(e) => update({ remote_path: e.target.value })} placeholder="/etc/nginx/sites-available/app" />
          </Field>
          <Field label="File Content">
            <textarea className={inputCls + " font-mono resize-none h-40"} value={(d.content as string) || ""} onChange={(e) => update({ content: e.target.value })} placeholder="[Unit]&#10;Description=..." />
          </Field>
          <label className="flex items-center gap-2 text-sm text-[#A3A3A3] cursor-pointer">
            <input type="checkbox" className={checkCls} checked={!!(d.sudo)} onChange={(e) => update({ sudo: e.target.checked })} />
            Use sudo (tee)
          </label>
        </>
      )}

      {node.type === "file_upload" && (
        <>
          <FileUploadField
            fileId={d.local_file_id as string | undefined}
            fileName={d.local_file_name as string | undefined}
            onUpload={(fileId, fileName) => update({ local_file_id: fileId, local_file_name: fileName })}
            onClear={() => update({ local_file_id: "", local_file_name: "" })}
          />
          <Field label="Remote Path">
            <input
              className={inputCls + " font-mono"}
              value={(d.remote_path as string) || ""}
              onChange={(e) => update({ remote_path: e.target.value })}
              placeholder="/home/ubuntu/app.tar.gz"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-[#A3A3A3] cursor-pointer">
            <input
              type="checkbox"
              className={checkCls}
              checked={!!(d.extract)}
              onChange={(e) => update({ extract: e.target.checked })}
            />
            Auto-extract after upload (tar.gz)
          </label>
          {d.extract && (
            <Field label="Extract to directory (optional)">
              <input
                className={inputCls + " font-mono"}
                value={(d.extract_to as string) || ""}
                onChange={(e) => update({ extract_to: e.target.value })}
                placeholder="/home/ubuntu/ (default: same dir)"
              />
            </Field>
          )}
        </>
      )}

      {node.type === "variable" && (
        <>
          <Field label="Variable Key">
            <input className={inputCls + " font-mono"} value={(d.key as string) || ""} onChange={(e) => update({ key: e.target.value })} placeholder="app_name" />
          </Field>
          <Field label="Value (supports {{vars}})">
            <input className={inputCls + " font-mono"} value={(d.value as string) || ""} onChange={(e) => update({ value: e.target.value })} placeholder="{{other_var}}_suffix" />
          </Field>
        </>
      )}

      {node.type === "delay" && (
        <Field label="Seconds to wait">
          <input type="number" className={inputCls} value={(d.seconds as number) || 5} min={1} onChange={(e) => update({ seconds: parseInt(e.target.value) })} />
        </Field>
      )}

      {node.type === "note" && (
        <Field label="Note text">
          <textarea className={inputCls + " resize-none h-28"} value={(d.text as string) || ""} onChange={(e) => update({ text: e.target.value })} placeholder="Reminder: upload files before this step..." />
        </Field>
      )}

      {node.type === "validation" && (
        <>
          <Field label="Check Mode">
            <select className={inputCls} value={(d.mode as string) || "contains"} onChange={(e) => update({ mode: e.target.value as "contains" | "regex" | "exit_code" })}>
              <option value="contains">Contains text</option>
              <option value="regex">Regex match</option>
              <option value="exit_code">Exit code</option>
            </select>
          </Field>
          <Field label="Expected value / pattern">
            <input className={inputCls + " font-mono"} value={(d.expect as string) || ""} onChange={(e) => update({ expect: e.target.value })} placeholder={d.mode === "exit_code" ? "0" : "success|done"} />
          </Field>
          <Field label="On validation failure">
            <select className={inputCls} value={(d.on_fail as string) || "pause"} onChange={(e) => update({ on_fail: e.target.value as "pause" | "stop" | "continue" })}>
              <option value="pause">Pause and notify</option>
              <option value="stop">Stop workflow</option>
              <option value="continue">Continue anyway</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-[#A3A3A3] cursor-pointer">
            <input type="checkbox" className={checkCls} checked={!!(d.continue_on_error)} onChange={(e) => update({ continue_on_error: e.target.checked })} />
            Continue on error
          </label>
        </>
      )}

      <div className="text-[11px] text-[#333] mt-2">
        Node ID: {node.id}
      </div>
    </div>
  );
}
