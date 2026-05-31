import { NextRequest, NextResponse } from "next/server";
import { ipcFetch } from "@/lib/ipc-client";

/** POST /api/sessions/[uuid]/disconnect — disconnect a specific session */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await params;
    const res = await ipcFetch("/session/disconnect", {
      method: "POST",
      body: JSON.stringify({ session_uuid: uuid }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}
