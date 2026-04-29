"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Terminal,
  Server,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Activity,
  BarChart2,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/terminal", label: "Terminal", icon: Terminal },
  { href: "/statistics", label: "Statistics", icon: BarChart2 },
  { href: "/servers", label: "Servers", icon: Server },
  { href: "/logs", label: "Audit Log", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, ipcConnected, wsConnected, session } = useAppStore();

  const isConnected = session?.state === "CONNECTED";

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-[#111111] border-r border-[#2A2A2A] transition-all duration-200",
        sidebarCollapsed ? "w-[60px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-5 border-b border-[#2A2A2A]",
        sidebarCollapsed && "justify-center px-0"
      )}>
        <div className="w-8 h-8 rounded-lg bg-[#49C5B6] flex items-center justify-center flex-shrink-0">
          <Activity size={16} className="text-[#0D0D0D]" />
        </div>
        {!sidebarCollapsed && (
          <span className="font-bold text-[15px] text-[#F2F2F2] whitespace-nowrap">
            ServerMind
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 text-[13.5px] font-medium",
                sidebarCollapsed && "justify-center px-0",
                active
                  ? "bg-[#49C5B6]/10 text-[#49C5B6]"
                  : "text-[#666666] hover:bg-[#1A1A1A] hover:text-[#F2F2F2]"
              )}
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-[#2A2A2A] space-y-2">
        {/* Status */}
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0D0D0D] text-[11px] text-[#666666]">
            <div
              className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                isConnected ? "bg-[#10B981]" :
                ipcConnected ? "bg-[#F59E0B] animate-pulse" :
                "bg-[#666666]"
              )}
            />
            <span className="truncate">
              {isConnected ? "Connected" :
               ipcConnected ? "MCP Running" : "MCP Offline"}
            </span>
          </div>
        )}
        {/* Toggle */}
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-lg text-[#666666] hover:bg-[#1A1A1A] hover:text-[#F2F2F2] transition-all"
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
