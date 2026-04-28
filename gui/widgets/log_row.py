"""Single log entry row widget."""

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


class LogRow(ctk.CTkFrame):
    """Renders a single audit log entry."""

    def __init__(self, master, entry: dict, **kwargs):
        super().__init__(master, corner_radius=4, fg_color="transparent", **kwargs)

        self.grid_columnconfigure(2, weight=1)

        ts_lbl = ctk.CTkLabel(
            self,
            text=format_timestamp(entry.get("timestamp")),
            font=ctk.CTkFont(size=10, family="Consolas"),
            text_color=("gray50", "gray55"),
            width=70,
            anchor="w",
        )
        ts_lbl.grid(row=0, column=0, padx=(4, 6))

        level = entry.get("level", "INFO")
        level_colour = LEVEL_COLOURS.get(level, "#cdd6f4")
        level_lbl = ctk.CTkLabel(
            self,
            text=level[:4],
            font=ctk.CTkFont(size=10, weight="bold"),
            text_color=level_colour,
            width=36,
            anchor="w",
        )
        level_lbl.grid(row=0, column=1, padx=(0, 6))

        msg_lbl = ctk.CTkLabel(
            self,
            text=entry.get("message", ""),
            font=ctk.CTkFont(size=11, family="Consolas"),
            anchor="w",
            justify="left",
        )
        msg_lbl.grid(row=0, column=2, sticky="ew", padx=(0, 4))
