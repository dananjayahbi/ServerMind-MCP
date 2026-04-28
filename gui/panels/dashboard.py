"""Dashboard panel - summary card and quick-action buttons."""

from __future__ import annotations

import customtkinter as ctk

from gui.utils.formatting import format_duration, format_timestamp, state_to_colour_key
from gui.widgets.status_dot import StatusDot


class DashboardPanel(ctk.CTkFrame):

    def __init__(self, master, state, ipc_client, bridge, **kwargs):
        super().__init__(master, corner_radius=0, fg_color="transparent", **kwargs)
        self._state = state
        self._ipc = ipc_client
        self._bridge = bridge

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        # Title
        title = ctk.CTkLabel(
            self,
            text="Dashboard",
            font=ctk.CTkFont(size=22, weight="bold"),
            anchor="w",
        )
        title.grid(row=0, column=0, sticky="ew", padx=24, pady=(24, 4))

        # Status card
        self._status_card = _StatusCard(self, state)
        self._status_card.grid(row=1, column=0, sticky="ew", padx=24, pady=12)

        # Quick actions
        actions = _QuickActionsFrame(self, state, ipc_client, bridge)
        actions.grid(row=2, column=0, sticky="new", padx=24, pady=8)

        # Subscribe to state updates
        state.subscribe("session", self._on_session_update)
        state.subscribe("backend_available", self._on_backend_change)

    def _on_session_update(self, state_dict: dict) -> None:
        self._status_card.refresh()

    def _on_backend_change(self, available: bool) -> None:
        self._status_card.refresh()


class _StatusCard(ctk.CTkFrame):

    def __init__(self, master, state, **kwargs):
        super().__init__(master, corner_radius=12, **kwargs)
        self._state = state
        self.grid_columnconfigure(1, weight=1)

        self._dot = StatusDot(self, state=state.session_state, size=14)
        self._dot.grid(row=0, column=0, padx=(16, 8), pady=16)

        self._state_lbl = ctk.CTkLabel(
            self,
            text=state.session_state,
            font=ctk.CTkFont(size=14, weight="bold"),
            anchor="w",
        )
        self._state_lbl.grid(row=0, column=1, sticky="ew", pady=16)

        self._detail_lbl = ctk.CTkLabel(
            self,
            text=self._build_detail(),
            font=ctk.CTkFont(size=11),
            text_color=("gray50", "gray55"),
            anchor="w",
        )
        self._detail_lbl.grid(row=1, column=0, columnspan=3, sticky="ew", padx=16, pady=(0, 16))

    def refresh(self) -> None:
        s = self._state
        self._dot.set_state(s.session_state)
        self._state_lbl.configure(text=s.session_state)
        self._detail_lbl.configure(text=self._build_detail())

    def _build_detail(self) -> str:
        s = self._state
        if not s.backend_available:
            return "Backend not available - waiting for MCP process..."
        if s.session_state == "DISCONNECTED":
            return "No active session. Select a profile and click Expose."
        parts = []
        if s.session_uuid:
            parts.append(f"UUID: {s.session_uuid[:8]}...")
        if s.connected_at:
            parts.append(f"Up: {format_duration(s.connected_at)}")
        parts.append(f"Commands: {s.commands_executed}")
        return "  |  ".join(parts) if parts else ""


class _QuickActionsFrame(ctk.CTkFrame):

    def __init__(self, master, state, ipc_client, bridge, **kwargs):
        super().__init__(master, corner_radius=12, fg_color="transparent", **kwargs)
        self._state = state
        self._ipc = ipc_client
        self._bridge = bridge

        self.grid_columnconfigure((0, 1), weight=1)

        ctk.CTkLabel(
            self,
            text="Quick Actions",
            font=ctk.CTkFont(size=13, weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 8))

        self._expose_btn = ctk.CTkButton(
            self,
            text="Expose Session",
            command=self._do_expose,
        )
        self._expose_btn.grid(row=1, column=0, padx=(0, 6), sticky="ew")

        self._disconnect_btn = ctk.CTkButton(
            self,
            text="Disconnect",
            fg_color=("#d20f39", "#f38ba8"),
            hover_color=("#a30030", "#c06070"),
            command=self._do_disconnect,
        )
        self._disconnect_btn.grid(row=1, column=1, padx=(6, 0), sticky="ew")

        state.subscribe("session", lambda _: self._refresh_buttons())
        state.subscribe("backend_available", lambda _: self._refresh_buttons())
        self._refresh_buttons()

    def _refresh_buttons(self) -> None:
        s = self._state
        connected = s.session_state == "CONNECTED"
        active = s.session_state not in ("DISCONNECTED",)
        avail = s.backend_available
        self._expose_btn.configure(state="normal" if (avail and not active) else "disabled")
        self._disconnect_btn.configure(state="normal" if (avail and active) else "disabled")

    def _do_expose(self) -> None:
        profiles = self._state.profiles
        if not profiles:
            return
        # Use first profile for quick-action
        profile_id = profiles[0].get("id")
        import threading
        threading.Thread(
            target=lambda: self._bridge.post(
                lambda r=self._ipc.expose(profile_id): None
            ),
            daemon=True,
        ).start()

    def _do_disconnect(self) -> None:
        import threading
        threading.Thread(
            target=lambda: self._bridge.post(
                lambda r=self._ipc.disconnect(): None
            ),
            daemon=True,
        ).start()
