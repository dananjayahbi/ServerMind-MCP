"""Exposure control panel - expose/disconnect with profile picker."""

from __future__ import annotations

import threading
import customtkinter as ctk
from gui.utils.formatting import format_duration
from gui.widgets.status_dot import StatusDot


class ExposureControlPanel(ctk.CTkFrame):

    def __init__(self, master, state, ipc_client, bridge, **kwargs):
        super().__init__(master, corner_radius=0, fg_color="transparent", **kwargs)
        self._state = state
        self._ipc = ipc_client
        self._bridge = bridge

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        ctk.CTkLabel(
            self,
            text="Session Control",
            font=ctk.CTkFont(size=22, weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="ew", padx=24, pady=(24, 12))

        # Control card
        card = ctk.CTkFrame(self, corner_radius=12)
        card.grid(row=1, column=0, sticky="ew", padx=24, pady=8)
        card.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(card, text="Profile:", anchor="w").grid(
            row=0, column=0, padx=(16, 8), pady=(16, 4), sticky="w"
        )

        self._profile_var = ctk.StringVar()
        self._profile_combo = ctk.CTkComboBox(
            card,
            variable=self._profile_var,
            values=["(no profiles)"],
            width=280,
        )
        self._profile_combo.grid(row=0, column=1, padx=(0, 16), pady=(16, 4), sticky="ew")

        self._dot = StatusDot(card, size=12)
        self._dot.grid(row=1, column=0, padx=(16, 8), pady=8)

        self._status_lbl = ctk.CTkLabel(card, text="DISCONNECTED", anchor="w")
        self._status_lbl.grid(row=1, column=1, padx=(0, 16), pady=8, sticky="ew")

        self._detail_lbl = ctk.CTkLabel(
            card,
            text="",
            font=ctk.CTkFont(size=11),
            text_color=("gray50", "gray55"),
            anchor="w",
        )
        self._detail_lbl.grid(row=2, column=0, columnspan=2, sticky="ew", padx=16, pady=(0, 8))

        btn_row = ctk.CTkFrame(card, fg_color="transparent")
        btn_row.grid(row=3, column=0, columnspan=2, sticky="ew", padx=16, pady=(4, 16))
        btn_row.grid_columnconfigure((0, 1), weight=1)

        self._expose_btn = ctk.CTkButton(btn_row, text="Expose", command=self._do_expose)
        self._expose_btn.grid(row=0, column=0, padx=(0, 6), sticky="ew")

        self._disconnect_btn = ctk.CTkButton(
            btn_row,
            text="Disconnect",
            fg_color=("#d20f39", "#f38ba8"),
            hover_color=("#a30030", "#c06070"),
            command=self._do_disconnect,
        )
        self._disconnect_btn.grid(row=0, column=1, padx=(6, 0), sticky="ew")

        state.subscribe("profiles", lambda _: self._refresh_profiles())
        state.subscribe("session", lambda _: self._refresh_status())
        state.subscribe("backend_available", lambda _: self._refresh_status())
        self._refresh_profiles()
        self._refresh_status()

    def _refresh_profiles(self) -> None:
        names = [p.get("display_name", "Unnamed") for p in self._state.profiles]
        self._profile_combo.configure(values=names if names else ["(no profiles)"])
        if names:
            self._profile_combo.set(names[0])

    def _refresh_status(self) -> None:
        s = self._state
        self._dot.set_state(s.session_state)
        self._status_lbl.configure(text=s.session_state)
        if s.session_state == "CONNECTED" and s.connected_at:
            self._detail_lbl.configure(
                text=f"Up: {format_duration(s.connected_at)}  |  Cmds: {s.commands_executed}"
            )
        else:
            self._detail_lbl.configure(text="")

        active = s.session_state not in ("DISCONNECTED",)
        avail = s.backend_available
        self._expose_btn.configure(state="normal" if (avail and not active) else "disabled")
        self._disconnect_btn.configure(state="normal" if (avail and active) else "disabled")

    def _selected_profile(self) -> dict | None:
        name = self._profile_var.get()
        for p in self._state.profiles:
            if p.get("display_name") == name:
                return p
        return self._state.profiles[0] if self._state.profiles else None

    def _do_expose(self) -> None:
        profile = self._selected_profile()
        if not profile:
            return
        pid = profile.get("id")
        threading.Thread(target=lambda: self._ipc.expose(pid), daemon=True).start()

    def _do_disconnect(self) -> None:
        threading.Thread(target=self._ipc.disconnect, daemon=True).start()
