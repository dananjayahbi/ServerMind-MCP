// Zustand store for client-side state
import { create } from "zustand";
import type { SessionStatus, LogEntry, ServerProfile, AppSettings } from "@/types/api";

interface AppStore {
  // Session
  session: SessionStatus | null;
  setSession: (s: SessionStatus | null) => void;

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
}

export const useAppStore = create<AppStore>((set) => ({
  session: null,
  setSession: (s) => set({ session: s }),

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
}));
