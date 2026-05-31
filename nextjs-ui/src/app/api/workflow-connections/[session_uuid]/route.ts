import { NextRequest, NextResponse } from "next/server";
import { getIpcBase } from "@/lib/ipc-client";

// GET /api/workflow-connections/[session_uuid] — get status
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ session_uuid: string }> }
) {
  const { session_uuid } = await params;
  const conn = getIpcBase();
  if (!conn) {
    return NextResponse.json({ error: "MCP server not running" }, { status: 503 });
  }
  const res = await fetch(
    `${conn.url}/workflow-connections/${session_uuid}/status`,
    { headers: { "X-IPC-Token": conn.token }, cache: "no-store" }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

// DELETE /api/workflow-connections/[session_uuid] — disconnect
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ session_uuid: string }> }
) {
  const { session_uuid } = await params;
  const conn = getIpcBase();
  if (!conn) {
    return NextResponse.json({ error: "MCP server not running" }, { status: 503 });
  }
  const res = await fetch(
    `${conn.url}/workflow-connections/${session_uuid}`,
    {
      method: "DELETE",
      headers: { "X-IPC-Token": conn.token },
    }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
