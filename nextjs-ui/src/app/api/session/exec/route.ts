import { NextRequest, NextResponse } from "next/server";
import { ipcFetch } from "@/lib/ipc-client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await ipcFetch("/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}
