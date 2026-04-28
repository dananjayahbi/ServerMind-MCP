"""Settings panel - theme, log buffer size, about info."""

from __future__ import annotations

import customtkinter as ctk


class SettingsPanel(ctk.CTkFrame):

    def __init__(self, master, state, ipc_client, bridge, **kwargs):
        super().__init__(master, corner_radius=0, fg_color="transparent", **kwargs)
        self._state = state

        self.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            self,
            text="Settings",
            font=ctk.CTkFont(size=22, weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="ew", padx=24, pady=(24, 12))

        card = ctk.CTkFrame(self, corner_radius=12)
        card.grid(row=1, column=0, sticky="ew", padx=24, pady=8)
        card.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(card, text="Appearance", font=ctk.CTkFont(weight="bold"), anchor="w").grid(
            row=0, column=0, columnspan=2, padx=16, pady=(16, 8), sticky="ew"
        )

        ctk.CTkLabel(card, text="Theme:", anchor="w").grid(
            row=1, column=0, padx=(16, 8), pady=4, sticky="w"
        )
        self._theme_var = ctk.StringVar(value=state.theme.capitalize())
        theme_seg = ctk.CTkSegmentedButton(
            card,
            values=["Dark", "Light", "System"],
            variable=self._theme_var,
            command=self._on_theme_change,
        )
        theme_seg.grid(row=1, column=1, padx=(0, 16), pady=4, sticky="w")

        # About section
        about_card = ctk.CTkFrame(self, corner_radius=12)
        about_card.grid(row=2, column=0, sticky="ew", padx=24, pady=8)
        about_card.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            about_card,
            text="About ServerMind MCP",
            font=ctk.CTkFont(weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, padx=16, pady=(16, 4), sticky="ew")

        ctk.CTkLabel(
            about_card,
            text=(
                "ServerMind MCP - AI-native SSH infrastructure control\n"
                "IPC bridge at 127.0.0.1:17432\n"
                "GUI communicates with backend via REST + WebSocket"
            ),
            font=ctk.CTkFont(size=11),
            text_color=("gray50", "gray55"),
            justify="left",
            anchor="w",
        ).grid(row=1, column=0, padx=16, pady=(0, 16), sticky="ew")

    def _on_theme_change(self, value: str) -> None:
        ctk.set_appearance_mode(value.lower())
        self._state.set_theme(value.lower())
