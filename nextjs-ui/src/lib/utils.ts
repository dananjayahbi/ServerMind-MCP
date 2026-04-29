// Utility: clsx + tailwind-merge
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format duration in ms to human-readable
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

// Format ISO timestamp to local time
export function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// Format ISO timestamp to relative time
export function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch {
    return iso;
  }
}

// Get state color class
export function stateColor(state: string): string {
  switch (state) {
    case "CONNECTED":
      return "text-success";
    case "CONNECTING":
    case "RECONNECTING":
      return "text-warning";
    case "FAULT":
      return "text-error";
    default:
      return "text-muted-foreground";
  }
}

// Get state dot color class
export function stateDotColor(state: string): string {
  switch (state) {
    case "CONNECTED":
      return "bg-success";
    case "CONNECTING":
    case "RECONNECTING":
      return "bg-warning animate-pulse";
    case "FAULT":
      return "bg-error";
    default:
      return "bg-muted-foreground";
  }
}
