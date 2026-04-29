// IPC Bridge client — server-side only
// Reads runtime.json for the IPC token and proxies requests to the bridge

import fs from "fs";
import path from "path";
import os from "os";

const APP_NAME = "servermind-mcp";
const IPC_API_PREFIX = "/api/v1";

function getRuntimeStatePath(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, APP_NAME, "runtime.json");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return path.join(xdg, APP_NAME, "runtime.json");
  return path.join(os.homedir(), ".config", APP_NAME, "runtime.json");
}

interface RuntimeState {
  ipc_token: string;
  ipc_port: number;
  pid: number;
  started_at: string;
}

function readRuntimeState(): RuntimeState | null {
  try {
    const p = getRuntimeStatePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as RuntimeState;
  } catch {
    return null;
  }
}

export function getIpcBase(): { url: string; token: string } | null {
  const state = readRuntimeState();
  if (!state) return null;
  return {
    url: `http://127.0.0.1:${state.ipc_port}${IPC_API_PREFIX}`,
    token: state.ipc_token,
  };
}

export function getIpcPort(): number {
  const state = readRuntimeState();
  return state?.ipc_port ?? 17432;
}

export function getIpcToken(): string | null {
  const state = readRuntimeState();
  return state?.ipc_token ?? null;
}

export async function ipcFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const conn = getIpcBase();
  if (!conn) {
    throw new Error("MCP backend is not running (runtime.json not found)");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-IPC-Token": conn.token,
    ...(options.headers as Record<string, string>),
  };

  return fetch(`${conn.url}${endpoint}`, {
    ...options,
    headers,
    // Disable next.js fetch caching for live data
    cache: "no-store",
  });
}
