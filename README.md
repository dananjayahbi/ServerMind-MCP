# ServerMind MCP

**ServerMind MCP** is an MCP-compliant backend server that exposes remote SSH infrastructure to AI coding agents.

## Features

- Expose remote SSH servers to AI coding agents (Claude Code, GitHub Copilot, etc.)
- Persistent SSH sessions with keep-alive and auto-reconnect
- Full audit logging of every command
- Strict loopback-only IPC - no external network exposure

---

## Entry Points

There is **one entry point**:

| Entry Point | Purpose |
|---|---|
| `servermind-mcp` | MCP backend server (registers with Claude / AI agents) |

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

This registers the command on your system:
- `servermind-mcp` - run the MCP backend

> **Windows note:** If pip warns that the scripts directory is not on PATH, add the Scripts folder (e.g. `%APPDATA%\Python\Python3xx\Scripts`) to your `PATH`.

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
