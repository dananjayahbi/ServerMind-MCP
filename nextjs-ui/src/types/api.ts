// Shared TypeScript types matching the IPC bridge API

export type SessionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "FAULT";

export interface SessionStatus {
  session_uuid: string | null;
  profile_id: string | null;
  state: SessionState;
  connected_at: string | null;
  last_keepalive_at: string | null;
  reconnect_attempt_count: number;
  commands_executed: number;
  last_command_at: string | null;
}

export interface ServerProfile {
  id: string;
  display_name: string;
  hostname: string;
  port: number;
  username: string;
  ppk_file_path: string | null;
  auth_method: "ppk" | "password";
  password?: string | null;
  sudo_password?: string | null;
  notes: string | null;
  keepalive_transport_interval_sec: number;
  keepalive_app_interval_sec: number;
  connection_timeout_sec: number;
  max_reconnect_attempts: number | null;
  reconnect_base_delay_sec: number;
  created_at: string;
  updated_at: string;
}

export interface CreateProfileRequest {
  display_name: string;
  hostname: string;
  port: number;
  username: string;
  ppk_file_path?: string | null;
  auth_method?: "ppk" | "password";
  password?: string | null;
  sudo_password?: string | null;
  notes?: string | null;
  keepalive_transport_interval_sec?: number;
  keepalive_app_interval_sec?: number;
  connection_timeout_sec?: number;
  max_reconnect_attempts?: number | null;
  reconnect_base_delay_sec?: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  category: string;
  level: string;
  actor: string;
  message: string;
  profile_id?: string | null;
  session_uuid?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface AppSettings {
  ipc_port: number;
  ui_theme: string;
  log_buffer_size: number;
  log_max_file_size_mb: number;
  log_backup_count: number;
  default_command_timeout_sec: number;
  ipc_poll_interval_ms: number;
}

export interface WSEvent {
  type: string;
  payload: unknown;
  timestamp: string;
}

// WebSocket event types
export const WS_EVENTS = {
  LOG_ENTRY: "log.entry",
  SESSION_STATE_CHANGED: "session.state_changed",
  COMMAND_COMPLETED: "command.completed",
  TERMINAL_OUTPUT_CHUNK: "terminal.output_chunk",
} as const;
