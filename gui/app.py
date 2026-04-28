"""Root application window and lifecycle management."""

from __future__ import annotations

import logging
import threading
import time

import customtkinter as ctk

from gui.ipc_client import IPCClient
from gui.state import GUIState
from gui.utils.thread_bridge import ThreadBridge
from gui.widgets.confirm_dialog import ConfirmDialog
from gui.widgets.nav_button import NavButton
from gui.widgets.status_dot import StatusDot

logger = logging.getLogger(__name__)

_PANELS = [
    ("dashboard", "Dashboard"),
    ("exposure", "Session Control"),
    ("config", "Server Config"),
    ("terminal", "Terminal"),
    ("logs", "Audit Log"),
    ("settings", "Settings"),
]


class ServerMindApp(ctk.CTk):

    def __init__(self) -> None:
        super().__init__()
        self.title("ServerMind MCP")
        self.geometry("1100x700")
        self.minsize(900, 560)

        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        self._state = GUIState()
        self._ipc = IPCClient()
        self._bridge = ThreadBridge()
        self._panels: dict = {}
        self._nav_buttons: dict[str, NavButton] = {}
        self._current_panel_widget = None

        self._build_layout()
        self._load_ipc_token()
        self._start_backend_poll()
        self._start_ws_listener()
        self._drain_bridge()

        self.protocol("WM_DELETE_WINDOW", self._on_close)

    # ------------------------------------------------------------------
    # Layout
    # ------------------------------------------------------------------

    def _build_layout(self) -> None:
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # Left nav rail
        self._nav_rail = ctk.CTkFrame(self, width=180, corner_radius=0)
        self._nav_rail.grid(row=0, column=0, rowspan=2, sticky="nsew")
        self._nav_rail.grid_propagate(False)
        self._nav_rail.grid_rowconfigure(len(_PANELS) + 1, weight=1)

        app_lbl = ctk.CTkLabel(
            self._nav_rail,
            text="ServerMind",
            font=ctk.CTkFont(size=15, weight="bold"),
            anchor="w",
        )
        app_lbl.grid(row=0, column=0, padx=16, pady=(20, 16), sticky="ew")

        for i, (key, label) in enumerate(_PANELS):
            btn = NavButton(
                self._nav_rail,
                text=label,
                panel_key=key,
                on_select=self._select_panel,
            )
            btn.grid(row=i + 1, column=0, padx=8, pady=2, sticky="ew")
            self._nav_buttons[key] = btn

        # Status dot in nav footer
        self._nav_status_dot = StatusDot(self._nav_rail, size=10)
        self._nav_status_lbl = ctk.CTkLabel(
            self._nav_rail,
            text="Offline",
            font=ctk.CTkFont(size=10),
            text_color=("gray50", "gray55"),
            anchor="w",
        )
        self._nav_status_dot.grid(row=len(_PANELS) + 2, column=0, padx=(16, 4), pady=(0, 12), sticky="w")
        self._nav_status_lbl.grid(row=len(_PANELS) + 2, column=0, padx=(32, 0), pady=(0, 12), sticky="w")

        # Content area
        self._content = ctk.CTkFrame(self, corner_radius=0, fg_color=("gray95", "#1e1e2e"))
        self._content.grid(row=0, column=1, sticky="nsew")
        self._content.grid_columnconfigure(0, weight=1)
        self._content.grid_rowconfigure(0, weight=1)

        # Status bar
        self._status_bar = ctk.CTkFrame(self, height=28, corner_radius=0)
        self._status_bar.grid(row=1, column=1, sticky="ew")
        self._status_bar.grid_columnconfigure(0, weight=1)
        self._status_bar.grid_propagate(False)

        self._status_bar_lbl = ctk.CTkLabel(
            self._status_bar,
            text="Waiting for backend...",
            font=ctk.CTkFont(size=10),
            text_color=("gray50", "gray55"),
            anchor="w",
        )
        self._status_bar_lbl.grid(row=0, column=0, padx=12, sticky="ew")

        self._select_panel("dashboard")

        self._state.subscribe("session", self._on_session_update)
        self._state.subscribe("backend_available", self._on_backend_change)

    # ------------------------------------------------------------------
    # Panel management
    # ------------------------------------------------------------------

    def _select_panel(self, key: str) -> None:
        if self._current_panel_widget is not None:
            self._current_panel_widget.grid_forget()

        if key not in self._panels:
            self._panels[key] = self._create_panel(key)

        panel = self._panels[key]
        panel.grid(row=0, column=0, sticky="nsew")
        self._current_panel_widget = panel

        for k, btn in self._nav_buttons.items():
            btn.set_selected(k == key)

        self._state.set_panel(key)

    def _create_panel(self, key: str):
        from gui.panels.dashboard import DashboardPanel
        from gui.panels.server_config import ServerConfigPanel
        from gui.panels.exposure_control import ExposureControlPanel
        from gui.panels.log_viewer import LogViewerPanel
        from gui.panels.manual_terminal import ManualTerminalPanel
        from gui.panels.settings import SettingsPanel

        kwargs = dict(
            master=self._content,
            state=self._state,
            ipc_client=self._ipc,
            bridge=self._bridge,
        )
        mapping = {
            "dashboard": DashboardPanel,
            "config": ServerConfigPanel,
            "exposure": ExposureControlPanel,
            "logs": LogViewerPanel,
            "terminal": ManualTerminalPanel,
            "settings": SettingsPanel,
        }
        cls = mapping.get(key)
        if cls is None:
            return ctk.CTkLabel(self._content, text=f"Panel '{key}' not found")
        return cls(**kwargs)

    # ------------------------------------------------------------------
    # IPC polling and events
    # ------------------------------------------------------------------

    def _load_ipc_token(self) -> None:
        from config.paths import get_runtime_state_path
        runtime_path = get_runtime_state_path()
        if runtime_path.exists():
            self._ipc.load_token(runtime_path)

    def _start_backend_poll(self) -> None:
        """Poll health endpoint every 2s in a background thread."""
        def poll():
            while True:
                health = self._ipc.health()
                available = health is not None

                if available:
                    # Always reload token so backend restarts are picked up automatically
                    self._load_ipc_token()

                if available and self._ipc.has_token:
                    status = self._ipc.get_session_status()
                    if status:
                        self._bridge.post(lambda s=status: self._state.update_session(s))

                    profiles = self._ipc.get_profiles()
                    if profiles:
                        self._bridge.post(lambda p=profiles: self._state.set_profiles(p))

                self._bridge.post(
                    lambda a=available: self._state.set_backend_available(a)
                )
                time.sleep(2)

        threading.Thread(target=poll, name="ipc-poll", daemon=True).start()

    def _start_ws_listener(self) -> None:
        self._ipc.add_event_callback(self._on_ws_event)
        self._ipc.start_ws_listener()

    def _on_ws_event(self, event: dict) -> None:
        event_type = event.get("type", "")
        data = event.get("payload", {})

        if event_type == "session.state_changed":
            self._bridge.post(lambda d=data: self._state.update_session(d))
        elif event_type == "log.entry":
            self._bridge.post(lambda d=data: self._state.append_log(d))
        elif event_type == "command.completed":
            pass  # Future: notify terminal panel
        elif event_type == "terminal.output_chunk":
            chunk = data.get("chunk", "") if isinstance(data, dict) else ""
            if chunk:
                self._bridge.post(lambda c=chunk: self._route_terminal_chunk(c))

    def _route_terminal_chunk(self, chunk: str) -> None:
        terminal_panel = self._panels.get("terminal")
        if terminal_panel and hasattr(terminal_panel, "append_chunk"):
            terminal_panel.append_chunk(chunk)

    def _drain_bridge(self) -> None:
        """Process queued bridge tasks every 50ms."""
        self._bridge.drain()
        self.after(50, self._drain_bridge)

    # ------------------------------------------------------------------
    # State change reactions
    # ------------------------------------------------------------------

    def _on_session_update(self, state_dict: dict) -> None:
        session_state = state_dict.get("state", "DISCONNECTED")
        self._nav_status_dot.set_state(session_state)
        self._status_bar_lbl.configure(text=f"Session: {session_state}")

    def _on_backend_change(self, available: bool) -> None:
        if available:
            self._nav_status_lbl.configure(text="Online")
            self._status_bar_lbl.configure(text="Backend connected")
        else:
            self._nav_status_lbl.configure(text="Offline")
            self._nav_status_dot.set_state("DISCONNECTED")
            self._status_bar_lbl.configure(text="Waiting for backend...")

    # ------------------------------------------------------------------
    # Shutdown
    # ------------------------------------------------------------------

    def _on_close(self) -> None:
        s = self._state
        if s.session_state not in ("DISCONNECTED", "FAULT") and s.backend_available:
            confirmed = ConfirmDialog.ask(
                self,
                title="Disconnect Before Closing?",
                message=(
                    f"An SSH session is currently {s.session_state}.\n"
                    "Disconnect now before closing the GUI?"
                ),
            )
            if confirmed:
                self._ipc.disconnect()
                # Wait up to 10s for DISCONNECTED state
                deadline = time.time() + 10
                while time.time() < deadline:
                    status = self._ipc.get_session_status()
                    if status and status.get("state") == "DISCONNECTED":
                        break
                    time.sleep(0.5)

        self._ipc.stop_ws_listener()
        self._ipc.close()
        self.destroy()
