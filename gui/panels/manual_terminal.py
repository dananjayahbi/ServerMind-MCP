"""Manual terminal panel - shell mode terminal with command history."""

from __future__ import annotations

import threading
import customtkinter as ctk


class ManualTerminalPanel(ctk.CTkFrame):

    def __init__(self, master, state, ipc_client, bridge, **kwargs):
        super().__init__(master, corner_radius=0, fg_color="transparent", **kwargs)
        self._state = state
        self._ipc = ipc_client
        self._history: list[str] = []
        self._history_pos: int = -1

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        ctk.CTkLabel(
            self,
            text="Manual Terminal",
            font=ctk.CTkFont(size=22, weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="ew", padx=24, pady=(24, 8))

        self._output = ctk.CTkTextbox(
            self,
            font=ctk.CTkFont(size=12, family="Consolas"),
            wrap="none",
            state="disabled",
        )
        self._output.grid(row=1, column=0, sticky="nsew", padx=24, pady=4)

        input_row = ctk.CTkFrame(self, fg_color="transparent")
        input_row.grid(row=2, column=0, sticky="ew", padx=24, pady=(4, 24))
        input_row.grid_columnconfigure(0, weight=1)

        self._input_var = ctk.StringVar()
        self._input_box = ctk.CTkEntry(
            input_row,
            textvariable=self._input_var,
            placeholder_text="Type command and press Enter...",
            font=ctk.CTkFont(size=12, family="Consolas"),
        )
        self._input_box.grid(row=0, column=0, sticky="ew", padx=(0, 8))
        self._input_box.bind("<Return>", self._send)
        self._input_box.bind("<Up>", self._history_up)
        self._input_box.bind("<Down>", self._history_down)

        send_btn = ctk.CTkButton(
            input_row,
            text="Send",
            width=80,
            command=self._send,
        )
        send_btn.grid(row=0, column=1)

        self._append_output("ServerMind MCP - Manual Terminal\n")
        self._append_output("Connect a session first, then type commands.\n\n")

    def _send(self, event=None) -> None:
        cmd = self._input_var.get().strip()
        if not cmd:
            return
        self._history.append(cmd)
        self._history_pos = -1
        self._input_var.set("")
        self._append_output(f"$ {cmd}\n")

        def run():
            result = self._ipc.send_terminal_input(cmd)
            if result is None:
                self._append_output("[error] Could not reach backend.\n")
                return
            status = result.get("status", "")
            stdout = result.get("stdout", "")
            stderr = result.get("stderr", "")
            exit_code = result.get("exit_code")
            if stdout:
                self._append_output(stdout if stdout.endswith("\n") else stdout + "\n")
            if stderr:
                self._append_output(f"[stderr] {stderr}" if stderr.endswith("\n") else f"[stderr] {stderr}\n")
            if status == "error" or (not stdout and not stderr):
                msg = result.get("message", "")
                if msg and msg != "ok":
                    self._append_output(f"[error] {msg}\n")
                elif not stdout and not stderr:
                    code_str = f" (exit {exit_code})" if exit_code is not None else ""
                    self._append_output(f"[done{code_str}]\n")

        threading.Thread(target=run, daemon=True).start()

    def _append_output(self, text: str) -> None:
        self._output.configure(state="normal")
        self._output.insert("end", text)
        self._output.configure(state="disabled")
        self._output.see("end")

    def _history_up(self, event=None) -> None:
        if not self._history:
            return
        if self._history_pos == -1:
            self._history_pos = len(self._history) - 1
        elif self._history_pos > 0:
            self._history_pos -= 1
        self._input_var.set(self._history[self._history_pos])

    def _history_down(self, event=None) -> None:
        if self._history_pos == -1:
            return
        if self._history_pos < len(self._history) - 1:
            self._history_pos += 1
            self._input_var.set(self._history[self._history_pos])
        else:
            self._history_pos = -1
            self._input_var.set("")
