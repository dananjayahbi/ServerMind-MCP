"""Modal confirmation dialog."""

from __future__ import annotations

import customtkinter as ctk


class ConfirmDialog(ctk.CTkToplevel):
    """A simple yes/no confirmation dialog."""

    def __init__(self, master, title: str, message: str, **kwargs):
        super().__init__(master, **kwargs)
        self.title(title)
        self.resizable(False, False)
        self.transient(master)
        self.grab_set()

        self.confirmed = False

        self.grid_columnconfigure(0, weight=1)
        self.grid_columnconfigure(1, weight=1)

        label = ctk.CTkLabel(
            self,
            text=message,
            wraplength=320,
            justify="center",
        )
        label.grid(row=0, column=0, columnspan=2, padx=20, pady=(20, 12))

        btn_cancel = ctk.CTkButton(
            self,
            text="Cancel",
            fg_color="transparent",
            border_width=1,
            command=self._cancel,
        )
        btn_cancel.grid(row=1, column=0, padx=(20, 6), pady=(4, 20), sticky="ew")

        btn_confirm = ctk.CTkButton(
            self,
            text="Confirm",
            fg_color=("#d20f39", "#f38ba8"),
            hover_color=("#a30030", "#c06070"),
            command=self._confirm,
        )
        btn_confirm.grid(row=1, column=1, padx=(6, 20), pady=(4, 20), sticky="ew")

        self.protocol("WM_DELETE_WINDOW", self._cancel)
        self._center_on_parent(master)

    def _confirm(self) -> None:
        self.confirmed = True
        self.destroy()

    def _cancel(self) -> None:
        self.confirmed = False
        self.destroy()

    def _center_on_parent(self, parent) -> None:
        parent.update_idletasks()
        px = parent.winfo_rootx() + parent.winfo_width() // 2
        py = parent.winfo_rooty() + parent.winfo_height() // 2
        self.update_idletasks()
        w = self.winfo_reqwidth()
        h = self.winfo_reqheight()
        self.geometry(f"+{px - w // 2}+{py - h // 2}")

    @classmethod
    def ask(cls, master, title: str, message: str) -> bool:
        dlg = cls(master, title=title, message=message)
        master.wait_window(dlg)
        return dlg.confirmed
