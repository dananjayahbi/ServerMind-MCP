// Zustand store for client-side state
import { create } from "zustand";
import type { SessionStatus, LogEntry, ServerProfile, AppSettings, ExposedSession } from "@/types/api";

export interface WorkflowConnection {
  session_uuid: string;
  profile_id: string | null;
  display_name: string;
  hostname: string;
  username: string;
  state: "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "FAULT";
  connected_at: string | null;
  error: string | null;
  is_mcp_session: boolean;
}

interface AppStore {
  // Session (backward compat: first active session)
  session: SessionStatus | null;
  setSession: (s: SessionStatus | null) => void;

  // Multi-session: all exposed sessions
  exposedSessions: ExposedSession[];
  setExposedSessions: (sessions: ExposedSession[]) => void;
  addOrUpdateSession: (s: ExposedSession) => void;
  removeSession: (session_uuid: string) => void;

  // Profiles
  profiles: ServerProfile[];
  setProfiles: (p: ServerProfile[]) => void;

  // Logs
  logs: LogEntry[];
  addLog: (entry: LogEntry) => void;
  setLogs: (entries: LogEntry[]) => void;

  // Settings
  settings: AppSettings | null;
  setSettings: (s: AppSettings | null) => void;

  // UI state
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // IPC connection
  ipcConnected: boolean;
  setIpcConnected: (v: boolean) => void;

  // WS connection
  wsConnected: boolean;
  setWsConnected: (v: boolean) => void;

  // IPC token (fetched from /api/auth/token)
  ipcToken: string | null;
  ipcPort: number;
  setIpcCredentials: (token: string, port: number) => void;

  // Workflow server connections
  workflowConnections: WorkflowConnection[];
  setWorkflowConnections: (c: WorkflowConnection[]) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  session: null,
  setSession: (s) => set({ session: s }),

  exposedSessions: [],
  setExposedSessions: (sessions) => set({ exposedSessions: sessions }),
  addOrUpdateSession: (s) =>
    set((state) => {
      const idx = state.exposedSessions.findIndex(
        (e) => e.session_uuid === s.session_uuid
      );
      if (idx >= 0) {
        const updated = [...state.exposedSessions];
        updated[idx] = s;
        return { exposedSessions: updated };
      }
      return { exposedSessions: [...state.exposedSessions, s] };
    }),
  removeSession: (session_uuid) =>
    set((state) => ({
      exposedSessions: state.exposedSessions.filter(
        (e) => e.session_uuid !== session_uuid
      ),
    })),

  profiles: [],
  setProfiles: (p) => set({ profiles: p }),

  logs: [],
  addLog: (entry) =>
    set((state) => ({
      logs: [entry, ...state.logs].slice(0, 500),
    })),
  setLogs: (entries) => set({ logs: entries.slice(0, 500) }),

  settings: null,
  setSettings: (s) => set({ settings: s }),

  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  ipcConnected: false,
  setIpcConnected: (v) => set({ ipcConnected: v }),

  wsConnected: false,
  setWsConnected: (v) => set({ wsConnected: v }),

  ipcToken: null,
  ipcPort: 17432,
  setIpcCredentials: (token, port) => set({ ipcToken: token, ipcPort: port }),

  workflowConnections: [],
  setWorkflowConnections: (c) => set({ workflowConnections: c }),
}));
