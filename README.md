# ServerMind MCP

**ServerMind MCP** is a dual-surface infrastructure control system: an MCP-compliant backend server and a desktop GUI built with CustomTkinter.

## Features

- Expose remote SSH servers to AI coding agents (Claude Code, GitHub Copilot, etc.)
- Persistent SSH sessions with keep-alive and auto-reconnect
- Full audit logging of every command
- Professional desktop GUI for operator control
- Strict loopback-only IPC - no external network exposure

---

## Entry Points

There are **two separate entry points**:

| Entry Point | Purpose |
|---|---|
| `servermind-mcp` | MCP backend server (registers with Claude / AI agents) |
| `servermind-gui` | Desktop control GUI (CustomTkinter) |

---

## Installation

### 1. Install Python 3.11+

Download from https://python.org and ensure it is on your `PATH`.

### 2. Install the package

```bash
cd path\to\ServerMind-MCP
pip install -r requirements.txt
pip install -e .
```

This registers two commands on your system:
- `servermind-mcp` - run the MCP backend
- `servermind-gui` - run the desktop GUI

> **Windows note:** If pip warns that the scripts directory is not on PATH, you can either:
> - Add the Scripts folder (e.g. `%APPDATA%\Python\Python3xx\Scripts`) to your `PATH`, **or**
> - Use the included `.bat` / `.vbs` launch files instead (they call `python -m ...` directly and always work)

---

## Starting the Application

### Entry Point 1 - MCP Backend Server

The MCP server is what AI agents (Claude Code, Claude Desktop) connect to.
It runs as a background process and communicates via **stdio** (default) or **SSE**.

**Using the installed command:**
```bash
servermind-mcp
```

**Using the batch file (Windows):**
```bat
start_mcp.bat
```

**Using Python directly:**
```bash
python -m mcp_server
```

**SSE mode (for VS Code Copilot / HTTP clients):**
```bash
servermind-mcp --transport sse --sse-port 17433
```

---

### Entry Point 2 - Desktop GUI

The GUI provides a visual interface for managing server profiles, sessions, and logs.
It connects to the MCP backend via the loopback IPC bridge (port 17432).

**Option A - Silent launch (no console window) - Recommended for Windows:**
```
Double-click: StartGUI.vbs
```
Or create a shortcut to `StartGUI.vbs`. This uses `pythonw` to suppress the console.

**Option B - Using the installed command:**
```bash
servermind-gui
```

**Option C - Batch file (shows console, good for debugging):**
```bat
start_gui.bat
```

**Option D - Python directly:**
```bash
python -m gui
```

---

## Running Both Together (Typical Workflow)

1. Start the MCP backend (it writes `runtime.json` with the IPC token):
   ```bat
   start_mcp.bat
   ```
   Or configure it in Claude Desktop (see below) so it starts automatically.

2. Launch the GUI:
   ```
   Double-click StartGUI.vbs
   ```
   The GUI polls for the backend every 2 seconds and connects automatically.

---

## Claude Desktop Integration

Add to your Claude Desktop MCP configuration file
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "servermind": {
      "command": "servermind-mcp",
      "args": []
    }
  }
}
```

See `claude_config_example.json` in this repo for a ready-to-copy template.

## Claude Code (VS Code) Integration

```json
{
  "mcpServers": {
    "servermind": {
      "command": "servermind-mcp",
      "args": []
    }
  }
}
```

Or use SSE transport and point the extension at `http://127.0.0.1:17433`.

---

## Configuration

Config file location:
- **Windows:** `%APPDATA%\servermind-mcp\config.json`
- **Linux/macOS:** `~/.config/servermind-mcp/config.json`

Reset config to defaults:
```bash
python scripts/reset_config.py
```

---

## Development

```bash
pip install -e ".[dev]"
pytest
```

---

## Requirements

- Python 3.11+
- `.ppk` key file (PuTTY Private Key format) for each SSH server
