import { NextRequest, NextResponse } from "next/server";
import { ipcFetch } from "@/lib/ipc-client";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const conn = await import("@/lib/ipc-client").then((m) => m.getIpcBase());
    if (!conn) {
      return NextResponse.json({ error: "MCP backend not running" }, { status: 503 });
    }
    // Forward multipart form to IPC bridge
    const res = await fetch(`${conn.url}/profiles/upload-key`, {
      method: "POST",
      headers: { "X-IPC-Token": conn.token },
      body: formData,
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}
