"use client";
import { useRef, useState, useCallback } from "react";
import { Upload, X, Loader2 } from "lucide-react";

interface FileUploadFieldProps {
  fileId?: string;
  fileName?: string;
  onUpload: (fileId: string, fileName: string) => void;
  onClear: () => void;
}

const labelCls =
  "block text-[11px] font-medium text-[#666666] uppercase tracking-wider mb-1";

export function FileUploadField({
  fileId,
  fileName,
  onUpload,
  onClear,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/workflows/upload-file", {
        method: "POST",
        body: fd,
      });
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

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) await uploadFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div>
      <label className={labelCls}>Local File</label>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFileInput}
      />
      {fileId ? (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#0D0D0D] border border-[#10B981]/30">
          <Upload size={13} className="text-[#10B981] flex-shrink-0" />
          <span className="text-[11px] text-[#F2F2F2] truncate flex-1">
            {fileName}
          </span>
          <button
            onClick={onClear}
            className="text-[#555] hover:text-[#EF4444] transition-colors flex-shrink-0"
          >
            <X size={11} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={uploading}
          className={`w-full flex flex-col items-center justify-center gap-1.5 p-4 rounded-lg border-2 border-dashed transition-all text-[12px] disabled:opacity-50 ${
            isDraggingOver
              ? "border-[#10B981] bg-[#10B981]/10 text-[#10B981]"
              : "border-[#2A2A2A] text-[#555] hover:border-[#10B981]/40 hover:text-[#10B981]"
          }`}
        >
          {uploading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Upload size={16} />
          )}
          <span>
            {uploading
              ? "Uploading..."
              : isDraggingOver
              ? "Drop to upload"
              : "Choose File or Drag & Drop"}
          </span>
        </button>
      )}
      {uploadError && (
        <p className="text-[10px] text-[#EF4444] mt-1">{uploadError}</p>
      )}
    </div>
  );
}
