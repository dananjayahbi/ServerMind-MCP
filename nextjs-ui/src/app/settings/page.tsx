"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/layout/PageHeader";
import { Save, RotateCcw, Info } from "lucide-react";
import type { AppSettings } from "@/types/api";

const DEFAULT_SETTINGS: AppSettings = {
  ipc_port: 17432,
  ui_theme: "dark",
  log_buffer_size: 5000,
  log_max_file_size_mb: 10,
  log_backup_count: 5,
  default_command_timeout_sec: 300,
  ipc_poll_interval_ms: 2000,
};

export default function SettingsPage() {
  const { settings, setSettings } = useAppStore();
  const [form, setForm] = useState<AppSettings>(settings ?? DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  function handleChange(field: keyof AppSettings, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) setError(data.detail || "Save failed");
      else { setSettings(data); setSuccess(true); setTimeout(() => setSuccess(false), 3000); }
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setForm(DEFAULT_SETTINGS);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Settings"
        description="Application configuration"
        actions={
          <div className="flex gap-2">
            <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-[#666666] hover:bg-[#1A1A1A] hover:text-[#F2F2F2] border border-[#2A2A2A] transition-all">
              <RotateCcw size={13} /> Reset
            </button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#49C5B6] hover:bg-[#13E8D5] text-[#0D0D0D] rounded-lg text-[12px] font-semibold transition-all disabled:opacity-40">
              <Save size={13} /> {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
        {error && (
          <div className="mb-4 px-3 py-2 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg text-[13px] text-[#EF4444]">{error}</div>
        )}
        {success && (
          <div className="mb-4 px-3 py-2 bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg text-[13px] text-[#10B981]">Settings saved successfully!</div>
        )}

        <div className="space-y-6">
          {/* IPC Settings */}
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-5">
            <h3 className="text-[12px] font-semibold text-[#666666] uppercase tracking-wider mb-4">IPC Bridge</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium text-[#666666] block mb-1.5">IPC Port</label>
                <input
                  type="number"
                  value={form.ipc_port}
                  onChange={(e) => handleChange("ipc_port", Number(e.target.value))}
                  className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#49C5B6] transition-all"
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-[#666666] block mb-1.5">Poll Interval (ms)</label>
                <input
                  type="number"
                  value={form.ipc_poll_interval_ms}
                  onChange={(e) => handleChange("ipc_poll_interval_ms", Number(e.target.value))}
                  className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#49C5B6] transition-all"
                />
              </div>
            </div>
          </div>

          {/* Logging */}
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-5">
            <h3 className="text-[12px] font-semibold text-[#666666] uppercase tracking-wider mb-4">Logging</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                ["log_buffer_size", "Buffer Size (entries)", "number"],
                ["log_max_file_size_mb", "Max File Size (MB)", "number"],
                ["log_backup_count", "Backup Count", "number"],
                ["default_command_timeout_sec", "Command Timeout (s)", "number"],
              ].map(([field, label, type]) => (
                <div key={field}>
                  <label className="text-[12px] font-medium text-[#666666] block mb-1.5">{label}</label>
                  <input
                    type={type}
                    value={form[field as keyof AppSettings] as number}
                    onChange={(e) => handleChange(field as keyof AppSettings, Number(e.target.value))}
                    className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#49C5B6] transition-all"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="flex items-start gap-3 px-4 py-3 bg-[#49C5B6]/5 border border-[#49C5B6]/20 rounded-xl">
            <Info size={14} className="text-[#49C5B6] flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-[#666666] leading-relaxed">
              Changes to IPC port require restarting the MCP backend. Other settings take effect immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
