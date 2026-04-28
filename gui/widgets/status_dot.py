"""Coloured connection status indicator widget."""

from __future__ import annotations

import customtkinter as ctk


STATE_COLOURS = {
    "CONNECTED": "#a6e3a1",
    "CONNECTING": "#f9e2af",
    "RECONNECTING": "#fab387",
    "FAULT": "#f38ba8",
    "DISCONNECTED": "#6c7086",
}


class StatusDot(ctk.CTkLabel):
    """A small circular dot coloured by session state."""

    def __init__(self, master, state: str = "DISCONNECTED", size: int = 12, **kwargs):
        colour = STATE_COLOURS.get(state, "#6c7086")
        super().__init__(
            master,
            text="",
            width=size,
            height=size,
            corner_radius=size // 2,
            fg_color=colour,
            **kwargs,
        )
        self._state = state

    def set_state(self, state: str) -> None:
        colour = STATE_COLOURS.get(state, "#6c7086")
        self.configure(fg_color=colour)
        self._state = state
