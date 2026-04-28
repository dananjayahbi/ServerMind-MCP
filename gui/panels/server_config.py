"""Server configuration panel - profile list + add/edit/delete form."""

from __future__ import annotations

import threading
import customtkinter as ctk

from gui.widgets.profile_card import ProfileCard
from gui.widgets.confirm_dialog import ConfirmDialog


class ServerConfigPanel(ctk.CTkFrame):

    def __init__(self, master, state, ipc_client, bridge, **kwargs):
        super().__init__(master, corner_radius=0, fg_color="transparent", **kwargs)
        self._state = state
        self._ipc = ipc_client
        self._bridge = bridge
        self._selected_profile: dict | None = None
        self._profile_cards: list[ProfileCard] = []
        self._form_mode: str = "view"  # "view" | "add" | "edit"

        self.grid_columnconfigure(0, weight=0, minsize=260)
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # ---- Header ----
        hdr = ctk.CTkFrame(self, fg_color="transparent")
        hdr.grid(row=0, column=0, columnspan=2, sticky="ew", padx=24, pady=(24, 8))
        hdr.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            hdr,
            text="Server Configuration",
            font=ctk.CTkFont(size=22, weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="ew")

        # ---- Left panel: profile list ----
        left = ctk.CTkFrame(self, corner_radius=12)
        left.grid(row=1, column=0, sticky="nsew", padx=(24, 6), pady=4)
        left.grid_rowconfigure(1, weight=1)
        left.grid_columnconfigure(0, weight=1)

        list_hdr = ctk.CTkFrame(left, fg_color="transparent")
        list_hdr.grid(row=0, column=0, sticky="ew", padx=10, pady=(10, 4))
        list_hdr.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            list_hdr,
            text="Profiles",
            font=ctk.CTkFont(size=13, weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="ew")

        add_btn = ctk.CTkButton(
            list_hdr,
            text="+ Add",
            width=60,
            height=26,
            command=self._start_add,
        )
        add_btn.grid(row=0, column=1)

        self._list_scroll = ctk.CTkScrollableFrame(left, fg_color="transparent")
        self._list_scroll.grid(row=1, column=0, sticky="nsew", padx=4, pady=4)
        self._list_scroll.grid_columnconfigure(0, weight=1)

        # ---- Right panel: detail / form ----
        self._right = ctk.CTkFrame(self, corner_radius=12)
        self._right.grid(row=1, column=1, sticky="nsew", padx=(6, 24), pady=4)
        self._right.grid_columnconfigure(0, weight=1)
        self._right.grid_rowconfigure(0, weight=1)

        self._show_placeholder()

        state.subscribe("profiles", lambda _: self._refresh_list())
        self._refresh_list()

    # ------------------------------------------------------------------
    # List management
    # ------------------------------------------------------------------

    def _refresh_list(self) -> None:
        for card in self._profile_cards:
            card.destroy()
        self._profile_cards.clear()

        for i, profile in enumerate(self._state.profiles):
            selected = (
                self._selected_profile is not None
                and self._selected_profile.get("id") == profile.get("id")
            )
            card = ProfileCard(
                self._list_scroll,
                profile=profile,
                on_select=self._select_profile,
                selected=selected,
            )
            card.grid(row=i, column=0, sticky="ew", pady=3)
            self._profile_cards.append(card)

        if not self._state.profiles:
            ctk.CTkLabel(
                self._list_scroll,
                text="No profiles yet.\nClick '+ Add' to create one.",
                text_color=("gray50", "gray55"),
                justify="center",
            ).grid(row=0, column=0, pady=20)

    def _select_profile(self, profile_id: str) -> None:
        for p in self._state.profiles:
            if p.get("id") == profile_id:
                self._selected_profile = p
                break
        for card in self._profile_cards:
            card.set_selected(card.profile.get("id") == profile_id)
        self._show_detail(self._selected_profile)

    # ------------------------------------------------------------------
    # Right-panel views
    # ------------------------------------------------------------------

    def _clear_right(self) -> None:
        for widget in self._right.winfo_children():
            widget.destroy()
        # Reset all row weights so prior layout doesn't bleed into next view
        for i in range(10):
            self._right.grid_rowconfigure(i, weight=0)

    def _show_placeholder(self) -> None:
        self._clear_right()
        self._right.grid_columnconfigure(0, weight=1)
        self._right.grid_rowconfigure(0, weight=1)
        ctk.CTkLabel(
            self._right,
            text="Select a profile to view details,\nor click '+ Add' to create one.",
            text_color=("gray50", "gray55"),
            justify="center",
        ).grid(row=0, column=0, sticky="nsew", padx=20, pady=20)

    def _show_detail(self, profile: dict) -> None:
        """Show read-only detail view with Edit / Delete buttons."""
        self._clear_right()
        self._form_mode = "view"
        self._right.grid_rowconfigure(0, weight=0)
        self._right.grid_rowconfigure(1, weight=1)
        self._right.grid_columnconfigure(0, weight=1)

        # Action bar
        bar = ctk.CTkFrame(self._right, fg_color="transparent")
        bar.grid(row=0, column=0, sticky="ew", padx=16, pady=(12, 4))
        bar.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            bar,
            text=profile.get("display_name", ""),
            font=ctk.CTkFont(size=16, weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="ew")

        edit_btn = ctk.CTkButton(
            bar,
            text="Edit",
            width=70,
            command=lambda: self._start_edit(profile),
        )
        edit_btn.grid(row=0, column=1, padx=(8, 0))

        del_btn = ctk.CTkButton(
            bar,
            text="Delete",
            width=70,
            fg_color=("#d20f39", "#f38ba8"),
            hover_color=("#a30030", "#c06070"),
            command=lambda: self._do_delete(profile),
        )
        del_btn.grid(row=0, column=2, padx=(6, 0))

        # Detail fields
        detail_scroll = ctk.CTkScrollableFrame(self._right, fg_color="transparent")
        detail_scroll.grid(row=1, column=0, sticky="nsew", padx=8, pady=4)
        detail_scroll.grid_columnconfigure(1, weight=1)

        fields = [
            ("Display Name", profile.get("display_name", "")),
            ("Hostname", profile.get("hostname", "")),
            ("Port", str(profile.get("port", 22))),
            ("Username", profile.get("username", "")),
            ("PPK File Path", profile.get("ppk_file_path", "(password auth)")),
            ("Notes", profile.get("notes", "")),
            ("Keepalive (transport)", f"{profile.get('keepalive_transport_interval_sec', 60)}s"),
            ("Keepalive (app)", f"{profile.get('keepalive_app_interval_sec', 120)}s"),
            ("Connect Timeout", f"{profile.get('connection_timeout_sec', 30)}s"),
            ("Max Reconnects", str(profile.get("max_reconnect_attempts", "unlimited"))),
            ("Profile ID", profile.get("id", "")),
            ("Created", profile.get("created_at", "")[:19]),
            ("Updated", profile.get("updated_at", "")[:19]),
        ]
        for i, (label, value) in enumerate(fields):
            ctk.CTkLabel(
                detail_scroll,
                text=label + ":",
                font=ctk.CTkFont(size=12, weight="bold"),
                anchor="w",
            ).grid(row=i, column=0, sticky="w", padx=(12, 8), pady=3)
            ctk.CTkLabel(
                detail_scroll,
                text=value or "-",
                font=ctk.CTkFont(size=12),
                anchor="w",
                wraplength=320,
                justify="left",
            ).grid(row=i, column=1, sticky="ew", padx=(0, 12), pady=3)

    def _show_form(self, profile: dict | None = None) -> None:
        """Show Add (profile=None) or Edit form."""
        self._clear_right()
        self._right.grid_rowconfigure(0, weight=0)
        self._right.grid_rowconfigure(1, weight=1)
        self._right.grid_columnconfigure(0, weight=1)

        is_edit = profile is not None
        title = "Edit Profile" if is_edit else "Add New Server"

        # Title bar - row 0, no weight so it stays at top
        title_bar = ctk.CTkFrame(self._right, fg_color="transparent")
        title_bar.grid(row=0, column=0, sticky="ew", padx=16, pady=(12, 4))
        title_bar.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(
            title_bar,
            text=title,
            font=ctk.CTkFont(size=16, weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="ew")

        # Scrollable form body - row 1, gets all remaining space
        scroll = ctk.CTkScrollableFrame(self._right, fg_color="transparent")
        scroll.grid(row=1, column=0, sticky="nsew", padx=8, pady=(0, 4))
        scroll.grid_columnconfigure(0, weight=0, minsize=170)
        scroll.grid_columnconfigure(1, weight=1)

        # ------ Form fields ------
        def row_entry(parent, row, label, default="", placeholder=""):
            ctk.CTkLabel(parent, text=label + ":", anchor="w", font=ctk.CTkFont(size=12)).grid(
                row=row, column=0, sticky="w", padx=(12, 8), pady=4
            )
            var = ctk.StringVar(value=default)
            entry = ctk.CTkEntry(parent, textvariable=var, placeholder_text=placeholder)
            entry.grid(row=row, column=1, sticky="ew", padx=(0, 12), pady=4)
            return var

        self._f_display_name = row_entry(scroll, 0, "Display Name *",
            default=profile.get("display_name", "") if is_edit else "",
            placeholder="My Production Server")
        self._f_hostname = row_entry(scroll, 1, "Hostname *",
            default=profile.get("hostname", "") if is_edit else "",
            placeholder="192.168.1.100")
        self._f_port = row_entry(scroll, 2, "Port",
            default=str(profile.get("port", 22)) if is_edit else "22")
        self._f_username = row_entry(scroll, 3, "Username *",
            default=profile.get("username", "") if is_edit else "",
            placeholder="admin")

        # PPK field with Browse button
        ctk.CTkLabel(scroll, text="PPK File Path:", anchor="w",
                     font=ctk.CTkFont(size=12)).grid(
            row=4, column=0, sticky="w", padx=(12, 8), pady=4
        )
        ppk_frame = ctk.CTkFrame(scroll, fg_color="transparent")
        ppk_frame.grid(row=4, column=1, sticky="ew", padx=(0, 12), pady=4)
        ppk_frame.grid_columnconfigure(0, weight=1)

        self._f_ppk_path = ctk.StringVar(
            value=profile.get("ppk_file_path", "") if is_edit else ""
        )
        ppk_entry = ctk.CTkEntry(
            ppk_frame,
            textvariable=self._f_ppk_path,
            placeholder_text="Leave empty for password auth",
        )
        ppk_entry.grid(row=0, column=0, sticky="ew")

        browse_btn = ctk.CTkButton(
            ppk_frame,
            text="Browse",
            width=72,
            command=self._browse_ppk,
        )
        browse_btn.grid(row=0, column=1, padx=(6, 0))

        self._f_notes = row_entry(scroll, 5, "Notes",
            default=profile.get("notes", "") if is_edit else "",
            placeholder="Optional description")

        # Advanced section toggle
        adv_label = ctk.CTkLabel(
            scroll, text="Advanced Settings", font=ctk.CTkFont(size=12, weight="bold"), anchor="w"
        )
        adv_label.grid(row=6, column=0, columnspan=2, sticky="ew", padx=12, pady=(12, 4))

        self._f_keepalive_transport = row_entry(scroll, 7, "Keepalive Transport (s)",
            default=str(profile.get("keepalive_transport_interval_sec", 60)) if is_edit else "60")
        self._f_keepalive_app = row_entry(scroll, 8, "Keepalive App (s)",
            default=str(profile.get("keepalive_app_interval_sec", 120)) if is_edit else "120")
        self._f_conn_timeout = row_entry(scroll, 9, "Connection Timeout (s)",
            default=str(profile.get("connection_timeout_sec", 30)) if is_edit else "30")
        self._f_max_reconnect = row_entry(scroll, 10, "Max Reconnects (blank=unlimited)",
            default=str(profile.get("max_reconnect_attempts", "")) if is_edit and profile.get("max_reconnect_attempts") else "")
        self._f_reconnect_delay = row_entry(scroll, 11, "Reconnect Base Delay (s)",
            default=str(profile.get("reconnect_base_delay_sec", 5)) if is_edit else "5")

        # Error label
        self._form_error_var = ctk.StringVar(value="")
        error_lbl = ctk.CTkLabel(
            scroll,
            textvariable=self._form_error_var,
            text_color=("#d20f39", "#f38ba8"),
            anchor="w",
            wraplength=340,
        )
        error_lbl.grid(row=12, column=0, columnspan=2, sticky="ew", padx=12, pady=4)

        # Buttons
        btn_row = ctk.CTkFrame(scroll, fg_color="transparent")
        btn_row.grid(row=13, column=0, columnspan=2, sticky="ew", padx=12, pady=(8, 16))
        btn_row.grid_columnconfigure((0, 1), weight=1)

        save_btn = ctk.CTkButton(
            btn_row,
            text="Save" if is_edit else "Create",
            command=lambda: self._do_save(profile.get("id") if is_edit else None),
        )
        save_btn.grid(row=0, column=0, padx=(0, 6), sticky="ew")

        cancel_btn = ctk.CTkButton(
            btn_row,
            text="Cancel",
            fg_color="transparent",
            border_width=1,
            command=self._cancel_form,
        )
        cancel_btn.grid(row=0, column=1, padx=(6, 0), sticky="ew")

    def _browse_ppk(self) -> None:
        """Open a file dialog to pick a .ppk key file."""
        from tkinter import filedialog
        path = filedialog.askopenfilename(
            title="Select PPK Key File",
            filetypes=[
                ("PuTTY Private Key", "*.ppk"),
                ("All Files", "*.*"),
            ],
        )
        if path:
            self._f_ppk_path.set(path)

    # ------------------------------------------------------------------
    # Form actions
    # ------------------------------------------------------------------

    def _start_add(self) -> None:
        self._form_mode = "add"
        self._selected_profile = None
        for card in self._profile_cards:
            card.set_selected(False)
        self._show_form(profile=None)

    def _start_edit(self, profile: dict) -> None:
        self._form_mode = "edit"
        self._show_form(profile=profile)

    def _cancel_form(self) -> None:
        if self._selected_profile:
            self._show_detail(self._selected_profile)
        else:
            self._show_placeholder()

    def _collect_form_data(self) -> dict | None:
        """Collect and validate form fields. Returns dict or None on error."""
        display_name = self._f_display_name.get().strip()
        hostname = self._f_hostname.get().strip()
        username = self._f_username.get().strip()

        if not display_name:
            self._form_error_var.set("Display Name is required.")
            return None
        if not hostname:
            self._form_error_var.set("Hostname is required.")
            return None
        if not username:
            self._form_error_var.set("Username is required.")
            return None

        try:
            port = int(self._f_port.get().strip() or "22")
        except ValueError:
            self._form_error_var.set("Port must be a number.")
            return None

        max_reconnect_str = self._f_max_reconnect.get().strip()
        max_reconnect = None
        if max_reconnect_str:
            try:
                max_reconnect = int(max_reconnect_str)
            except ValueError:
                self._form_error_var.set("Max Reconnects must be a number or blank.")
                return None

        try:
            keepalive_transport = int(self._f_keepalive_transport.get().strip() or "60")
            keepalive_app = int(self._f_keepalive_app.get().strip() or "120")
            conn_timeout = int(self._f_conn_timeout.get().strip() or "30")
            reconnect_delay = int(self._f_reconnect_delay.get().strip() or "5")
        except ValueError:
            self._form_error_var.set("Advanced timing fields must be numbers.")
            return None

        return {
            "display_name": display_name,
            "hostname": hostname,
            "port": port,
            "username": username,
            "ppk_file_path": self._f_ppk_path.get().strip(),
            "notes": self._f_notes.get().strip(),
            "keepalive_transport_interval_sec": keepalive_transport,
            "keepalive_app_interval_sec": keepalive_app,
            "connection_timeout_sec": conn_timeout,
            "max_reconnect_attempts": max_reconnect,
            "reconnect_base_delay_sec": reconnect_delay,
        }

    def _do_save(self, profile_id: str | None) -> None:
        """Save (create or update) profile via IPC."""
        data = self._collect_form_data()
        if data is None:
            return

        self._form_error_var.set("Saving...")

        def run():
            if profile_id:
                result = self._ipc.update_profile(profile_id, data)
            else:
                result = self._ipc.create_profile(data)

            if result is None:
                self._bridge.post(lambda: self._form_error_var.set(
                    "Failed to save. Is the MCP backend running?"
                ))
                return

            # Refresh profiles list
            profiles = self._ipc.get_profiles()
            if profiles:
                self._bridge.post(lambda p=profiles: self._state.set_profiles(p))

            saved_id = result.get("id", profile_id)
            self._bridge.post(lambda: self._after_save(saved_id, result))

        threading.Thread(target=run, daemon=True).start()

    def _after_save(self, profile_id: str, profile_data: dict) -> None:
        self._selected_profile = profile_data
        # Refresh cards selection
        for card in self._profile_cards:
            card.set_selected(card.profile.get("id") == profile_id)
        self._show_detail(profile_data)

    def _do_delete(self, profile: dict) -> None:
        confirmed = ConfirmDialog.ask(
            self.winfo_toplevel(),
            title="Delete Profile",
            message=f"Delete '{profile.get('display_name', '')}' permanently?",
        )
        if not confirmed:
            return

        def run():
            ok = self._ipc.delete_profile(profile.get("id"))
            profiles = self._ipc.get_profiles()
            if profiles is not None:
                self._bridge.post(lambda p=profiles: self._state.set_profiles(p))
            if ok:
                self._bridge.post(self._show_placeholder)
            else:
                self._bridge.post(lambda: None)  # Already deleted or backend error

        self._selected_profile = None
        threading.Thread(target=run, daemon=True).start()

