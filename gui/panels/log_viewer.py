"""Log viewer panel - scrollable filtered audit log."""

from __future__ import annotations

import customtkinter as ctk
from gui.utils.formatting import format_timestamp

LEVEL_COLOURS = {
    "CRITICAL": "#f38ba8",
    "ERROR": "#f38ba8",
    "WARNING": "#f9e2af",
    "INFO": "#cdd6f4",
    "DEBUG": "#6c7086",
}


class LogViewerPanel(ctk.CTkFrame):

    def __init__(self, master, state, ipc_client, bridge, **kwargs):
        super().__init__(master, corner_radius=0, fg_color="transparent", **kwargs)
        self._state = state
        self._ipc = ipc_client

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        # Header row
        hdr = ctk.CTkFrame(self, fg_color="transparent")
        hdr.grid(row=0, column=0, sticky="ew", padx=24, pady=(24, 4))
        hdr.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            hdr,
            text="Audit Log",
            font=ctk.CTkFont(size=22, weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="ew")

        clear_btn = ctk.CTkButton(
            hdr,
            text="Clear",
            width=80,
            fg_color="transparent",
            border_width=1,
            command=self._clear,
        )
        clear_btn.grid(row=0, column=1, padx=(8, 0))

        # Filter row
        filter_row = ctk.CTkFrame(self, fg_color="transparent")
        filter_row.grid(row=1, column=0, sticky="ew", padx=24, pady=4)

        ctk.CTkLabel(filter_row, text="Level:").grid(row=0, column=0, padx=(0, 6))
        self._level_var = ctk.StringVar(value="ALL")
        level_combo = ctk.CTkComboBox(
            filter_row,
            variable=self._level_var,
            values=["ALL", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
            width=120,
            command=lambda _: self._refresh_view(),
        )
        level_combo.grid(row=0, column=1, padx=(0, 12))

        ctk.CTkLabel(filter_row, text="Category:").grid(row=0, column=2, padx=(0, 6))
        self._cat_var = ctk.StringVar(value="ALL")
        cat_combo = ctk.CTkComboBox(
            filter_row,
            variable=self._cat_var,
            values=["ALL", "CONNECTION", "COMMAND", "CONFIG", "IPC", "SYSTEM", "SECURITY"],
            width=140,
            command=lambda _: self._refresh_view(),
        )
        cat_combo.grid(row=0, column=3)

        # Log text area
        self._text = ctk.CTkTextbox(
            self,
            font=ctk.CTkFont(size=11, family="Consolas"),
            wrap="none",
        )
        self._text.grid(row=2, column=0, sticky="nsew", padx=24, pady=(4, 24))

        state.subscribe("log_entry", lambda _: self._refresh_view())
        state.subscribe("logs_reset", lambda _: self._refresh_view())
        self._refresh_view()

    def _refresh_view(self) -> None:
        level_filter = self._level_var.get()
        cat_filter = self._cat_var.get()

        entries = self._state.recent_logs
        if level_filter != "ALL":
            entries = [e for e in entries if e.get("level") == level_filter]
        if cat_filter != "ALL":
            entries = [e for e in entries if e.get("category") == cat_filter]

        self._text.configure(state="normal")
        self._text.delete("1.0", "end")
        for entry in entries[-500:]:
            ts = format_timestamp(entry.get("timestamp"))
            level = entry.get("level", "INFO")[:4]
            cat = entry.get("category", "")[:8]
            msg = entry.get("message", "")
            self._text.insert("end", f"{ts} [{level}] [{cat}] {msg}\n")
        self._text.configure(state="disabled")
        self._text.see("end")

    def _clear(self) -> None:
        self._state.recent_logs.clear()
        self._refresh_view()
