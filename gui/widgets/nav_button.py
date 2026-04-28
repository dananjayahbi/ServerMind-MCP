"""Navigation rail button widget."""

from __future__ import annotations

import customtkinter as ctk


class NavButton(ctk.CTkButton):
    """A navigation rail button with selected/deselected visual states."""

    def __init__(
        self,
        master,
        text: str,
        panel_key: str,
        on_select,
        **kwargs,
    ):
        super().__init__(
            master,
            text=text,
            anchor="w",
            corner_radius=8,
            height=36,
            fg_color="transparent",
            hover_color=("#ccd0da", "#45475a"),
            text_color=("#4c4f69", "#cdd6f4"),
            command=lambda: on_select(panel_key),
            **kwargs,
        )
        self._panel_key = panel_key
        self._selected = False

    def set_selected(self, selected: bool) -> None:
        self._selected = selected
        if selected:
            self.configure(fg_color=("#ccd0da", "#313244"))
        else:
            self.configure(fg_color="transparent")
