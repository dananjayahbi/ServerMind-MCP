"use client";
import { useState } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { WFNode } from "@/types/workflow";

interface Props {
  d: Record<string, unknown>;
  update: (patch: Partial<WFNode["data"]>) => void;
  inputCls: string;
  labelCls: string;
  checkCls: string;
}

type ValidationState = "idle" | "checking" | "ok" | "missing";

function Field({
  label,
  children,
  labelCls,
}: {
  label: string;
  children: React.ReactNode;
  labelCls: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export function LocalPathUploadPanel({
  d,
  update,
  inputCls,
  labelCls,
  checkCls,
}: Props) {
  const [validation, setValidation] = useState<ValidationState>("idle");

  async function checkPath() {
    const localPath = (d.local_path as string) || "";
    if (!localPath.trim()) return;
    setValidation("checking");
    try {
      const res = await fetch(
        `/api/workflows/validate-local-path?path=${encodeURIComponent(localPath)}`
      );
      const data = await res.json();
      setValidation(data.exists ? "ok" : "missing");
    } catch {
      setValidation("missing");
    }
  }

  return (
    <>
      <Field label="Local File Path" labelCls={labelCls}>
        <div className="flex gap-2">
          <input
            className={inputCls + " font-mono"}
            value={(d.local_path as string) || ""}
            onChange={(e) => {
              update({ local_path: e.target.value });
              setValidation("idle");
            }}
            placeholder="C:\builds\app.tar.gz"
          />
          <button
            type="button"
            onClick={checkPath}
            disabled={validation === "checking" || !(d.local_path as string)?.trim()}
            className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-[#888] hover:text-[#38BDF8] hover:border-[#38BDF8]/40 transition-colors disabled:opacity-40 text-[11px] whitespace-nowrap"
          >
            {validation === "checking" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              "Check"
            )}
          </button>
        </div>
        {validation === "ok" && (
          <p className="flex items-center gap-1 text-[10px] text-[#10B981] mt-1">
            <CheckCircle size={11} /> File found
          </p>
        )}
        {validation === "missing" && (
          <p className="flex items-center gap-1 text-[10px] text-[#EF4444] mt-1">
            <XCircle size={11} /> File not found at this path
          </p>
        )}
      </Field>

      <Field label="Remote Path" labelCls={labelCls}>
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
        <Field label="Extract to directory (optional)" labelCls={labelCls}>
          <input
            className={inputCls + " font-mono"}
            value={(d.extract_to as string) || ""}
            onChange={(e) => update({ extract_to: e.target.value })}
            placeholder="/home/ubuntu/ (default: same dir)"
          />
        </Field>
      )}

      <div className="rounded-lg border border-[#38BDF8]/20 bg-[#38BDF8]/5 p-2.5">
        <p className="text-[10px] text-[#38BDF8]/80 leading-relaxed">
          The file path is resolved on the local machine at execution time.
          Pre-execution validation will check if the file exists before starting
          the workflow.
        </p>
      </div>
    </>
  );
}
