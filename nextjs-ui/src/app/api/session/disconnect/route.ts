import { NextResponse } from "next/server";
import { ipcFetch } from "@/lib/ipc-client";

export async function POST() {
  try {
    const res = await ipcFetch("/session/disconnect", { method: "POST" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}
