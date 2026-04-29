"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/layout/PageHeader";
import { Plus, Trash2, Edit2, Server, Upload, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServerProfile, CreateProfileRequest } from "@/types/api";

const EMPTY_FORM: CreateProfileRequest = {
  display_name: "",
  hostname: "",
  port: 22,
  username: "",
  auth_method: "ppk",
  ppk_file_path: null,
  password: null,
  sudo_password: null,
  notes: null,
  keepalive_transport_interval_sec: 30,
  keepalive_app_interval_sec: 60,
  connection_timeout_sec: 30,
  max_reconnect_attempts: null,
  reconnect_base_delay_sec: 5,
};

export default function ServersPage() {
  const { profiles, setProfiles, session } = useAppStore();
  const [selected, setSelected] = useState<ServerProfile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<CreateProfileRequest>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function openNew() {
    setSelected(null);
    setIsNew(true);
    setForm(EMPTY_FORM);
    setError(null);
    setSuccess(null);
  }

  function openEdit(profile: ServerProfile) {
    setSelected(profile);
    setIsNew(false);
    setForm({
      display_name: profile.display_name,
      hostname: profile.hostname,
      port: profile.port,
      username: profile.username,
      auth_method: profile.auth_method,
      ppk_file_path: profile.ppk_file_path ?? null,
      password: null,
      sudo_password: null,
      notes: profile.notes ?? null,
      keepalive_transport_interval_sec: profile.keepalive_transport_interval_sec,
      keepalive_app_interval_sec: profile.keepalive_app_interval_sec,
      connection_timeout_sec: profile.connection_timeout_sec,
      max_reconnect_attempts: profile.max_reconnect_attempts ?? null,
      reconnect_base_delay_sec: profile.reconnect_base_delay_sec,
    });
    setError(null);
    setSuccess(null);
  }

  async function handleUploadKey(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/profiles/upload-key", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) setForm((f) => ({ ...f, ppk_file_path: data.path }));
      else setError(data.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const url = isNew ? "/api/profiles" : `/api/profiles/${selected!.id}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Save failed"); return; }

      // Refresh profiles
      const profRes = await fetch("/api/profiles");
      if (profRes.ok) setProfiles(await profRes.json());
      setSuccess(isNew ? "Profile created!" : "Profile updated!");
      if (isNew) { setIsNew(false); setSelected(data); }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this profile?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/profiles/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setProfiles(profiles.filter((p) => p.id !== id));
        if (selected?.id === id) { setSelected(null); setIsNew(false); }
      }
    } finally {
      setDeleting(null);
    }
  }

  const F = (field: keyof CreateProfileRequest) => ({
    value: (form[field] ?? "") as string | number,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value })),
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Servers"
        description="Manage SSH server profiles"
        actions={
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#49C5B6] hover:bg-[#13E8D5] text-[#0D0D0D] rounded-lg text-[12px] font-semibold transition-all"
          >
            <Plus size={14} /> New Profile
          </button>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Profile list */}
        <div className="w-[280px] min-w-[280px] border-r border-[#2A2A2A] bg-[#111111] overflow-y-auto">
          {profiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[#444444] p-6">
              <Server size={32} />
              <p className="text-[13px] text-center">No profiles yet.<br />Click New Profile to add one.</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {profiles.map((p) => {
                const isActive = session?.profile_id === p.id && session.state !== "DISCONNECTED";
                return (
                  <div
                    key={p.id}
                    onClick={() => openEdit(p)}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all",
                      selected?.id === p.id ? "bg-[#49C5B6]/10 border border-[#49C5B6]/30" : "hover:bg-[#1A1A1A] border border-transparent"
                    )}
                  >
                    <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", isActive ? "bg-[#10B981]" : "bg-[#444444]")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#F2F2F2] truncate">{p.display_name}</p>
                      <p className="text-[11px] text-[#666666] truncate">{p.username}@{p.hostname}:{p.port}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                      disabled={deleting === p.id}
                      className="p-1 text-[#444444] hover:text-[#EF4444] transition-all flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Edit/Create form */}
        <div className="flex-1 overflow-y-auto">
          {!selected && !isNew ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[#444444]">
              <Edit2 size={32} />
              <p className="text-[13px]">Select a profile to edit or create a new one</p>
            </div>
          ) : (
            <div className="p-6 max-w-2xl">
              <h2 className="text-[16px] font-bold text-[#F2F2F2] mb-6">
                {isNew ? "New Server Profile" : `Edit: ${selected?.display_name}`}
              </h2>

              {error && (
                <div className="mb-4 px-3 py-2 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg text-[13px] text-[#EF4444]">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 px-3 py-2 bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg text-[13px] text-[#10B981] flex items-center gap-2">
                  <Check size={14} /> {success}
                </div>
              )}

              <div className="space-y-4">
                {/* Basic info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[11px] font-medium text-[#666666] uppercase tracking-wider block mb-1.5">Display Name *</label>
                    <input {...F("display_name")} placeholder="My Production Server" className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#49C5B6] transition-all" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-[#666666] uppercase tracking-wider block mb-1.5">Hostname / IP *</label>
                    <input {...F("hostname")} placeholder="192.168.1.100" className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#49C5B6] transition-all" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-[#666666] uppercase tracking-wider block mb-1.5">Port</label>
                    <input {...F("port")} type="number" min={1} max={65535} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#49C5B6] transition-all" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-[#666666] uppercase tracking-wider block mb-1.5">Username *</label>
                    <input {...F("username")} placeholder="root" className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#49C5B6] transition-all" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-[#666666] uppercase tracking-wider block mb-1.5">Auth Method</label>
                    <select {...F("auth_method")} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#49C5B6] transition-all">
                      <option value="ppk">PPK Key File</option>
                      <option value="password">Password</option>
                    </select>
                  </div>
                </div>

                {/* Auth-specific fields */}
                {form.auth_method === "ppk" ? (
                  <div>
                    <label className="text-[11px] font-medium text-[#666666] uppercase tracking-wider block mb-1.5">PPK Key File</label>
                    <div className="flex gap-2">
                      <input {...F("ppk_file_path")} placeholder="/path/to/key.ppk" className="flex-1 bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#49C5B6] transition-all font-mono text-[11px]" />
                      <label className="flex items-center gap-1.5 px-3 py-2 bg-[#1E1E1E] border border-[#2A2A2A] hover:border-[#49C5B6] text-[#666666] hover:text-[#49C5B6] rounded-lg text-[12px] cursor-pointer transition-all">
                        <Upload size={13} /> {uploading ? "..." : "Upload"}
                        <input type="file" accept=".ppk" onChange={handleUploadKey} className="hidden" />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-medium text-[#666666] uppercase tracking-wider block mb-1.5">Password</label>
                      <input {...F("password")} type="password" placeholder="••••••••" className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#49C5B6] transition-all" />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-[#666666] uppercase tracking-wider block mb-1.5">Sudo Password</label>
                      <input {...F("sudo_password")} type="password" placeholder="Optional" className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#49C5B6] transition-all" />
                    </div>
                  </div>
                )}

                {/* Advanced settings */}
                <details className="group">
                  <summary className="text-[11px] font-medium text-[#666666] uppercase tracking-wider cursor-pointer hover:text-[#49C5B6] transition-all mb-3">
                    Advanced Settings
                  </summary>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    {[
                      ["keepalive_transport_interval_sec", "Transport Keepalive (s)"],
                      ["keepalive_app_interval_sec", "App Keepalive (s)"],
                      ["connection_timeout_sec", "Connection Timeout (s)"],
                      ["reconnect_base_delay_sec", "Reconnect Base Delay (s)"],
                      ["max_reconnect_attempts", "Max Reconnect Attempts"],
                    ].map(([field, label]) => (
                      <div key={field}>
                        <label className="text-[11px] font-medium text-[#666666] block mb-1.5">{label}</label>
                        <input
                          type="number"
                          value={form[field as keyof CreateProfileRequest] ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value === "" ? null : Number(e.target.value) }))}
                          className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#49C5B6] transition-all"
                        />
                      </div>
                    ))}
                    <div className="col-span-2">
                      <label className="text-[11px] font-medium text-[#666666] block mb-1.5">Notes</label>
                      <textarea
                        value={form.notes ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        rows={2}
                        className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-[#F2F2F2] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#49C5B6] transition-all resize-none"
                      />
                    </div>
                  </div>
                </details>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-[#49C5B6] hover:bg-[#13E8D5] text-[#0D0D0D] rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40"
                  >
                    <Check size={14} /> {saving ? "Saving..." : isNew ? "Create Profile" : "Save Changes"}
                  </button>
                  <button
                    onClick={() => { setSelected(null); setIsNew(false); }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1E1E1E] border border-[#2A2A2A] text-[#666666] hover:text-[#F2F2F2] rounded-lg text-[13px] transition-all"
                  >
                    <X size={14} /> Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
