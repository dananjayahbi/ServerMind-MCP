import { NextRequest, NextResponse } from "next/server";
import { getIpcBase } from "@/lib/ipc-client";

// POST /api/workflow-connections/[session_uuid]/upload-local
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ session_uuid: string }> }
) {
  const { session_uuid } = await params;
  const conn = getIpcBase();
  if (!conn) {
    return NextResponse.json({ error: "MCP server not running" }, { status: 503 });
  }
  const body = await request.json();
  const res = await fetch(
    `${conn.url}/workflow-connections/${session_uuid}/upload-local`,
    {
      method: "POST",
      headers: {
        "X-IPC-Token": conn.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
