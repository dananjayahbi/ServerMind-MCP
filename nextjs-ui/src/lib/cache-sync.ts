// JSON cache sync: reads MCP cache file and syncs to SQLite on startup
import fs from "fs";
import path from "path";
import os from "os";
import { prisma } from "./prisma";

const APP_NAME = "servermind-mcp";

function getCachePath(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, APP_NAME, "mcp_cache.json");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return path.join(xdg, APP_NAME, "mcp_cache.json");
  return path.join(os.homedir(), ".config", APP_NAME, "mcp_cache.json");
}

interface MCPCache {
  version: number;
  last_updated: string;
  profiles: Array<{
    id: string;
    display_name: string;
    hostname: string;
    port: number;
    username: string;
    ppk_file_path?: string | null;
    auth_method?: string;
    notes?: string | null;
    keepalive_transport_interval_sec?: number;
    keepalive_app_interval_sec?: number;
    connection_timeout_sec?: number;
    max_reconnect_attempts?: number | null;
    reconnect_base_delay_sec?: number;
    created_at: string;
    updated_at: string;
  }>;
  session?: {
    session_uuid?: string | null;
    profile_id?: string | null;
    state: string;
    connected_at?: string | null;
    commands_executed?: number;
  } | null;
  settings?: {
    ipc_port?: number;
    log_buffer_size?: number;
    log_max_file_size_mb?: number;
    log_backup_count?: number;
    default_command_timeout_sec?: number;
  } | null;
}

let _syncDone = false;

export async function syncCacheToDb(): Promise<void> {
  if (_syncDone) return;
  _syncDone = true;

  const cachePath = getCachePath();
  if (!fs.existsSync(cachePath)) return;

  let cache: MCPCache;
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, "utf-8")) as MCPCache;
  } catch {
    return;
  }

  // Sync profiles
  if (cache.profiles?.length) {
    for (const p of cache.profiles) {
      await prisma.cachedProfile.upsert({
        where: { id: p.id },
        update: {
          display_name: p.display_name,
          hostname: p.hostname,
          port: p.port,
          username: p.username,
          ppk_file_path: p.ppk_file_path ?? null,
          auth_method: p.auth_method ?? "ppk",
          notes: p.notes ?? null,
          keepalive_transport_interval: p.keepalive_transport_interval_sec ?? 30,
          keepalive_app_interval: p.keepalive_app_interval_sec ?? 60,
          connection_timeout: p.connection_timeout_sec ?? 30,
          max_reconnect_attempts: p.max_reconnect_attempts ?? null,
          reconnect_base_delay: p.reconnect_base_delay_sec ?? 5,
          updated_at: p.updated_at,
          synced_at: new Date(),
        },
        create: {
          id: p.id,
          display_name: p.display_name,
          hostname: p.hostname,
          port: p.port,
          username: p.username,
          ppk_file_path: p.ppk_file_path ?? null,
          auth_method: p.auth_method ?? "ppk",
          notes: p.notes ?? null,
          keepalive_transport_interval: p.keepalive_transport_interval_sec ?? 30,
          keepalive_app_interval: p.keepalive_app_interval_sec ?? 60,
          connection_timeout: p.connection_timeout_sec ?? 30,
          max_reconnect_attempts: p.max_reconnect_attempts ?? null,
          reconnect_base_delay: p.reconnect_base_delay_sec ?? 5,
          created_at: p.created_at,
          updated_at: p.updated_at,
        },
      });
    }
  }

  // Sync session snapshot
  if (cache.session) {
    await prisma.sessionSnapshot.create({
      data: {
        session_uuid: cache.session.session_uuid ?? null,
        profile_id: cache.session.profile_id ?? null,
        state: cache.session.state,
        connected_at: cache.session.connected_at ?? null,
        commands_executed: cache.session.commands_executed ?? 0,
      },
    });
  }

  // Sync settings
  if (cache.settings) {
    await prisma.cachedSettings.upsert({
      where: { id: 1 },
      update: {
        ipc_port: cache.settings.ipc_port ?? 17432,
        log_buffer_size: cache.settings.log_buffer_size ?? 5000,
        log_max_file_size_mb: cache.settings.log_max_file_size_mb ?? 10,
        log_backup_count: cache.settings.log_backup_count ?? 5,
        default_command_timeout: cache.settings.default_command_timeout_sec ?? 300,
        synced_at: new Date(),
      },
      create: {
        id: 1,
        ipc_port: cache.settings.ipc_port ?? 17432,
        log_buffer_size: cache.settings.log_buffer_size ?? 5000,
        log_max_file_size_mb: cache.settings.log_max_file_size_mb ?? 10,
        log_backup_count: cache.settings.log_backup_count ?? 5,
        default_command_timeout: cache.settings.default_command_timeout_sec ?? 300,
      },
    });
  }
}
