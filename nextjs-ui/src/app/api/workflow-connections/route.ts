import { NextRequest, NextResponse } from "next/server";
import { getIpcBase } from "@/lib/ipc-client";

// GET /api/workflow-connections — list all connections (pool + MCP session)
export async function GET() {
  const conn = getIpcBase();
  if (!conn) {
    return NextResponse.json({ error: "MCP server not running" }, { status: 503 });
  }
  const res = await fetch(`${conn.url}/workflow-connections`, {
    headers: { "X-IPC-Token": conn.token },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

// POST /api/workflow-connections — connect a new server
export async function POST(request: NextRequest) {
  const conn = getIpcBase();
  if (!conn) {
    return NextResponse.json({ error: "MCP server not running" }, { status: 503 });
  }
  const body = await request.json();
  const res = await fetch(`${conn.url}/workflow-connections`, {
    method: "POST",
    headers: {
      "X-IPC-Token": conn.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
