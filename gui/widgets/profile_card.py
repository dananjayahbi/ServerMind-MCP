"""Server profile list card widget."""

from __future__ import annotations

import customtkinter as ctk


class ProfileCard(ctk.CTkFrame):
    """Displays a single server profile summary."""

    def __init__(
        self,
        master,
        profile: dict,
        on_select: callable,
        selected: bool = False,
        **kwargs,
    ):
        super().__init__(master, corner_radius=8, **kwargs)
        self.profile = profile
        self.on_select = on_select
        self._selected = selected

        self.grid_columnconfigure(0, weight=1)

        name_lbl = ctk.CTkLabel(
            self,
            text=profile.get("display_name", "Unnamed"),
            font=ctk.CTkFont(size=13, weight="bold"),
            anchor="w",
        )
        name_lbl.grid(row=0, column=0, sticky="ew", padx=12, pady=(10, 2))

        host_lbl = ctk.CTkLabel(
            self,
            text=f"{profile.get('username', '')}@{profile.get('hostname', '')}:{profile.get('port', 22)}",
            font=ctk.CTkFont(size=11),
            text_color=("gray50", "gray60"),
            anchor="w",
        )
        host_lbl.grid(row=1, column=0, sticky="ew", padx=12, pady=(0, 10))

        self.bind("<Button-1>", lambda e: on_select(profile.get("id")))
        name_lbl.bind("<Button-1>", lambda e: on_select(profile.get("id")))
        host_lbl.bind("<Button-1>", lambda e: on_select(profile.get("id")))

        self._update_selection_style()

    def set_selected(self, selected: bool) -> None:
        self._selected = selected
        self._update_selection_style()

    def _update_selection_style(self) -> None:
        if self._selected:
            self.configure(fg_color=("#ccd0da", "#45475a"))
        else:
            self.configure(fg_color=("gray90", "#313244"))
