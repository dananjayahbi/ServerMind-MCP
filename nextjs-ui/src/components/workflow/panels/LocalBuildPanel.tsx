"use client";
import type { WFNode } from "@/types/workflow";

interface Props {
  d: Record<string, unknown>;
  update: (patch: Partial<WFNode["data"]>) => void;
  inputCls: string;
  labelCls: string;
  checkCls: string;
}

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

export function LocalBuildPanel({
  d,
  update,
  inputCls,
  labelCls,
  checkCls,
}: Props) {
  return (
    <>
      <Field label="Build Command" labelCls={labelCls}>
        <textarea
          className={inputCls + " font-mono resize-none h-24"}
          value={(d.command as string) || ""}
          onChange={(e) => update({ command: e.target.value })}
          placeholder="npm run build"
        />
      </Field>
      <Field label="Working Directory (optional)" labelCls={labelCls}>
        <input
          className={inputCls + " font-mono"}
          value={(d.working_directory as string) || ""}
          onChange={(e) => update({ working_directory: e.target.value })}
          placeholder="C:\projects\my-app"
        />
      </Field>
      <Field label="Timeout (seconds)" labelCls={labelCls}>
        <input
          type="number"
          className={inputCls}
          value={(d.timeout as number) || 300}
          onChange={(e) => update({ timeout: parseInt(e.target.value) })}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-[#A3A3A3] cursor-pointer">
        <input
          type="checkbox"
          className={checkCls}
          checked={!!(d.continue_on_error)}
          onChange={(e) => update({ continue_on_error: e.target.checked })}
        />
        Continue on error
      </label>
      <div className="rounded-lg border border-[#E879F9]/20 bg-[#E879F9]/5 p-2.5">
        <p className="text-[10px] text-[#E879F9]/80 leading-relaxed">
          This command runs on the{" "}
          <span className="font-semibold">local machine</span> where the
          ServerMind UI is hosted. Use it to build artifacts (e.g.{" "}
          <span className="font-mono text-[#E879F9]">npm run build</span>) before
          uploading them to a remote server.
        </p>
      </div>
    </>
  );
}
