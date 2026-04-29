// GET /api/auth/token — returns IPC token + port to authenticated same-origin requests
import { NextResponse } from "next/server";
import { getIpcToken, getIpcPort } from "@/lib/ipc-client";

export async function GET() {
  const token = getIpcToken();
  const port = getIpcPort();

  if (!token) {
    return NextResponse.json(
      { error: "MCP backend not running" },
      { status: 503 }
    );
  }

  return NextResponse.json({ token, port });
}
