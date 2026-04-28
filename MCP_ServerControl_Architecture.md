# ServerMind MCP — Architecture & Design Document

**Project Codename:** ServerMind MCP  
**Document Version:** 1.0.0  
**Status:** Authoritative Design Reference  
**Audience:** Engineering, Architecture Review  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Architectural Philosophy](#3-architectural-philosophy)
4. [High-Level Component Map](#4-high-level-component-map)
5. [Module Breakdown](#5-module-breakdown)
   - 5.1 [MCP Core Server](#51-mcp-core-server)
   - 5.2 [SSH Session Manager](#52-ssh-session-manager)
   - 5.3 [IPC Bridge Layer](#53-ipc-bridge-layer)
   - 5.4 [Configuration Engine](#54-configuration-engine)
   - 5.5 [Command Execution Pipeline](#55-command-execution-pipeline)
   - 5.6 [Audit & Logging Subsystem](#56-audit--logging-subsystem)
   - 5.7 [CustomTkinter GUI Application](#57-customtkinter-gui-application)
6. [Data Models](#6-data-models)
7. [IPC Contract: MCP ↔ GUI](#7-ipc-contract-mcp--gui)
8. [MCP Tool Catalogue](#8-mcp-tool-catalogue)
9. [Session Lifecycle & Persistence](#9-session-lifecycle--persistence)
10. [Authentication & Key Management](#10-authentication--key-management)
11. [Folder Structure](#11-folder-structure)
12. [Process Architecture](#12-process-architecture)
13. [State Machine Diagrams](#13-state-machine-diagrams)
14. [Security Architecture](#14-security-architecture)
15. [Error Handling Strategy](#15-error-handling-strategy)
16. [Configuration File Specifications](#16-configuration-file-specifications)
17. [Threading & Concurrency Model](#17-threading--concurrency-model)
18. [Dependency Manifest](#18-dependency-manifest)
19. [Deployment & Distribution](#19-deployment--distribution)
20. [Future Extensibility](#20-future-extensibility)

---

## 1. Executive Summary

ServerMind MCP is a dual-surface infrastructure control system consisting of two tightly coupled but independently operable components: an **MCP-compliant backend server** and a **desktop GUI application** built with CustomTkinter.

The MCP backend exposes a defined set of tools consumable by AI coding agents (Claude Code, GitHub Copilot via VS Code, and any other MCP-compatible client). These tools allow agents to list configured servers, expose a selected server into an active SSH session, execute commands on the remote host, read session output, and cleanly terminate connections.

The GUI application serves as the operator control plane. It allows a human operator to define and persist any number of server profiles — each specifying hostname, port, authentication key (.ppk file path), username, and operational metadata. When the operator chooses to expose a server, exactly one server may be active at a time. Both the human operator and an AI agent share control over the same live session, with all actions uniformly logged.

The two surfaces communicate over a local IPC bridge comprising a REST API and a WebSocket channel. This bridge is internal-only — it binds exclusively to the loopback interface and is not exposed to any external network interface.

---

## 2. System Overview

### 2.1 Problem Statement

AI coding agents operate in sandboxed environments and have no native mechanism to authenticate with, connect to, or issue commands on remote Linux/Unix servers. Engineers who use agents for infrastructure management tasks must repeatedly copy terminal output and paste it into the agent's context window, breaking workflow and introducing errors. Furthermore, remote server sessions are prone to disconnection due to inactivity timeouts, which is disruptive in long-running automated workflows.

### 2.2 Solution Summary

ServerMind MCP solves this by acting as an authenticated, persistent SSH proxy. The MCP server maintains live SSH sessions on behalf of the operator and AI agent, converts standard MCP tool calls into SSH commands, and returns structured output back to the caller. A companion GUI provides the human operator full visibility and manual control over all sessions and configurations.

### 2.3 Primary User Journeys

**Journey 1 — Operator Configures a Server:**
The operator opens the GUI, navigates to the Server Configuration panel, fills in server details and selects a .ppk key file from disk, saves the profile, and the profile persists across restarts.

**Journey 2 — Operator Exposes a Server:**
The operator selects one saved profile from the exposure selector, clicks "Expose Server," and the system initiates an SSH connection. The connection's status is displayed in real time in the GUI. Keep-alive signals are immediately armed.

**Journey 3 — AI Agent Controls the Exposed Server:**
An AI agent calls the MCP tool `server_execute_command` with a shell command string. The MCP server routes the command through the live SSH session, captures stdout/stderr, and returns the structured result to the agent. The GUI logs the transaction.

**Journey 4 — Operator Views Activity:**
The operator watches the scrollable log panel in the GUI, which shows timestamped records of every command executed, its source (agent or operator), its result status, and a truncated preview of the output.

**Journey 5 — Session Termination:**
Termination is only possible via three explicit actions: the operator clicking the "Disconnect" button in the GUI, an AI agent calling the `server_disconnect` MCP tool, or the operator closing the GUI application entirely. Inactivity alone never terminates a session.

---

## 3. Architectural Philosophy

### 3.1 Strict Separation of Concerns

Each major subsystem is responsible for exactly one domain. The SSH Session Manager knows nothing about the GUI. The GUI knows nothing about the SSH protocol. The IPC bridge is the only shared boundary, and its contract is formally defined.

### 3.2 Single Active Session Constraint

At any point in time, only one server session may be in the "exposed" state. This is a hard constraint enforced at both the MCP layer and the GUI layer independently. Multiple profiles may be saved, but the exposure selector enforces single selection.

### 3.3 No Implicit Termination

Session termination must be an explicit, deliberate act. The system shall never automatically disconnect due to inactivity, timeout, or transient errors. On transient errors, the system shall attempt reconnection according to the configured reconnection policy before escalating to a fault state.

### 3.4 Human Operator Supremacy

The human operator always has override capability. An AI agent cannot perform any action that the GUI does not also surface and log. Operator manual commands always take precedence if issued concurrently.

### 3.5 Minimal External Footprint

The IPC bridge binds only to `127.0.0.1`. No component ever listens on `0.0.0.0` or any non-loopback interface. The system does not require any external service, cloud dependency, or internet access to function.

### 3.6 Structured, Auditable Everything

Every command, every connection event, every configuration change, and every IPC message is recorded to the audit log with a precise UTC timestamp, actor identity (human or agent), and outcome. Nothing is fire-and-forget.

---

## 4. High-Level Component Map

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Coding Agents                        │
│          (Claude Code, GitHub Copilot, etc.)                │
└───────────────────────────┬─────────────────────────────────┘
                            │  MCP Protocol (stdio / SSE)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     MCP Core Server                          │
│   - Tool Registry & Dispatcher                              │
│   - Request Validator                                        │
│   - Response Serialiser                                      │
└────────────┬───────────────────────────────────┬────────────┘
             │                                   │
             │ SSH Commands                      │ IPC (REST + WS)
             ▼                                   ▼
┌────────────────────────┐        ┌──────────────────────────┐
│   SSH Session Manager  │        │      IPC Bridge Layer     │
│   - Connection Pool    │        │   - REST API (FastAPI)    │
│   - Keep-Alive Engine  │        │   - WebSocket Dispatcher  │
│   - PPK Auth Handler   │        │   - Event Bus             │
│   - Reconnect Policy   │        └──────────┬───────────────┘
└────────────┬───────────┘                   │
             │                               │ Socket
             │ Shared session state           ▼
             ▼                  ┌──────────────────────────────┐
┌────────────────────────┐      │   CustomTkinter GUI App      │
│  Command Exec Pipeline │      │   - Dashboard View           │
│  - Command Queue       │      │   - Server Config Panel      │
│  - Output Capture      │      │   - Log Viewer Panel         │
│  - Result Formatter    │      │   - Exposure Control Panel   │
└────────────┬───────────┘      │   - Manual Terminal Panel    │
             │                  └──────────────────────────────┘
             ▼
┌────────────────────────┐
│  Audit & Logging       │
│  - File Logger         │
│  - In-memory Ring Buf  │
│  - Log Event Emitter   │
└────────────────────────┘
             │
             ▼
┌────────────────────────┐
│  Configuration Engine  │
│  - Profile Store       │
│  - Schema Validator    │
│  - Migration Manager   │
└────────────────────────┘
```

---

## 5. Module Breakdown

### 5.1 MCP Core Server

#### 5.1.1 Responsibility

The MCP Core Server is the entry point for AI agent interactions. It implements the Model Context Protocol specification, advertises the tool catalogue, receives tool call requests, validates them, dispatches them to the appropriate subsystems, and returns structured MCP-compliant responses.

#### 5.1.2 Transport

The MCP server supports two transport modes:

- **stdio transport:** Standard for CLI-integrated agents such as Claude Code. The server reads JSON-RPC messages from stdin and writes responses to stdout. This is the primary deployment mode.
- **SSE (Server-Sent Events) transport:** For agents that connect over HTTP, such as VS Code extensions. The server exposes an HTTP endpoint where agents subscribe to an SSE stream and POST tool call requests.

Both transports funnel requests into a single internal dispatcher, ensuring that transport mode has no effect on tool behaviour.

#### 5.1.3 Tool Registry

The Tool Registry is a declarative structure that maps tool names to their handler functions, input schemas, and human-readable descriptions. At startup, the registry is populated from the tool catalogue (defined in Section 8). Any tool call referencing an unregistered name is rejected with a structured error response before any internal dispatch occurs.

#### 5.1.4 Request Validation

Every incoming tool call is validated against the JSON Schema definition for that tool before handler dispatch. Validation failures produce a structured error response identifying which field failed and why. The tool handler is never invoked for an invalid request.

#### 5.1.5 Response Serialisation

All tool responses follow the MCP content block format. Text results are wrapped in text content blocks. Structured data (e.g., server lists, session status) is JSON-serialised into a text block. Binary content is not supported in this version.

#### 5.1.6 Server Lifecycle

The MCP server starts as a separate process, independent of the GUI. It reads its IPC endpoint addresses from the configuration file on startup and connects to the IPC bridge. If the IPC bridge is not yet available (e.g., the GUI has not been launched), the MCP server queues its IPC registration and retries with exponential backoff. Tool calls that require an active session will return a structured "no active session" error while the IPC bridge is unavailable.

---

### 5.2 SSH Session Manager

#### 5.2.1 Responsibility

The SSH Session Manager owns the lifecycle of every SSH connection. It is the only component in the system that communicates with remote servers. It handles authentication, keep-alive signalling, reconnection, and orderly shutdown.

#### 5.2.2 PPK Key Conversion

PuTTY Private Key (.ppk) files are the primary authentication mechanism. The SSH Session Manager converts .ppk files to OpenSSH-compatible in-memory key objects at connection time using the `paramiko` library, which natively supports PPK format (both version 2 and version 3). The converted key object is held in process memory for the duration of the session and is never written to disk in OpenSSH format.

#### 5.2.3 Connection Establishment

Connection establishment follows this sequence:

1. Load and parse the .ppk file from the path stored in the server profile.
2. Open a TCP socket to the configured host and port.
3. Perform the SSH handshake and negotiate algorithms.
4. Authenticate with the converted private key.
5. Open a shell channel or an exec channel, depending on the intended use.
6. Register the session object with the session registry and emit a `session_connected` event.

If any step fails, the error is classified (authentication failure, network unreachable, host key mismatch, etc.) and a structured fault event is emitted. The reconnection policy is then consulted.

#### 5.2.4 Keep-Alive Engine

The Keep-Alive Engine runs on a dedicated background thread per active session. It operates on two levels:

- **Transport-level keep-alive:** The SSH client sends periodic `SSH_MSG_GLOBAL_REQUEST` keepalive packets to the server at a configurable interval (default: 30 seconds). This prevents network devices from dropping idle TCP connections.
- **Application-level heartbeat:** The engine also periodically sends a benign no-op command (`true` or `: ;`) through the session channel. This is necessary for servers with `ClientAliveCountMax` policies that count only application-level activity.

Both intervals are independently configurable per server profile. The Keep-Alive Engine logs a heartbeat event to the audit log on each cycle, allowing the operator to verify that sessions are being maintained.

#### 5.2.5 Session Registry

The Session Registry is a thread-safe in-memory dictionary that maps a server profile identifier to its active session object and associated metadata. At any time, at most one entry in this registry may be in the `EXPOSED` state. The registry enforces the single-session constraint by rejecting exposure requests when another session is already exposed.

#### 5.2.6 Reconnection Policy

If a session drops unexpectedly (network interruption, server restart, etc.) and the drop was not caused by an explicit termination request, the reconnection policy activates:

1. The session state transitions from `CONNECTED` to `RECONNECTING`.
2. A reconnection attempt is made after a configurable base delay (default: 5 seconds).
3. Subsequent attempts use exponential backoff with jitter, up to a configurable maximum interval (default: 120 seconds).
4. If a maximum attempt count is configured and exhausted, the session transitions to `FAULT`.
5. If no maximum is configured, reconnection attempts continue indefinitely until the session is manually terminated or a successful reconnection occurs.
6. Every attempt, success, and failure is logged and pushed to the GUI via the IPC bridge.

---

### 5.3 IPC Bridge Layer

#### 5.3.1 Responsibility

The IPC Bridge Layer is the internal communication backbone between the MCP backend process and the GUI process. It provides a REST API for request-response interactions and a WebSocket channel for event streaming.

#### 5.3.2 Technology Choice

The bridge is implemented using FastAPI running inside the MCP backend process. The GUI application connects to it as a client. The bridge binds exclusively to `127.0.0.1` on a configurable port (default: 17432). The port number must not conflict with well-known services and is configurable to support environments where that port is occupied.

#### 5.3.3 REST API Surface

The REST API exposes endpoints for actions that are request-response in nature: retrieving the current session state, issuing a connection request, issuing a disconnection request, and reading recent log entries. Full endpoint definitions are specified in Section 7.

#### 5.3.4 WebSocket Event Channel

The WebSocket channel is a unidirectional stream from the backend to the GUI. The GUI subscribes to this channel on startup and uses it to receive real-time events: log entries as they are generated, session state transitions, command results arriving asynchronously, and keep-alive heartbeat acknowledgements. The GUI never sends data back over the WebSocket; all GUI-initiated actions use the REST API.

#### 5.3.5 Authentication

The IPC bridge uses a shared secret token generated at MCP server startup and written to a local runtime state file readable only by the current user. The GUI reads this token from the state file on startup and includes it as a Bearer token in all REST requests and as a query parameter during WebSocket upgrade. Requests without a valid token are rejected with HTTP 401.

#### 5.3.6 Availability Model

The IPC bridge starts with the MCP server process. The GUI may start before or after the MCP server. If the GUI starts first, it polls the IPC bridge endpoint at a configurable interval (default: 2 seconds) until it becomes available, displaying a "Waiting for MCP backend..." status in the status bar. Once connected, the GUI subscribes to the WebSocket channel. On WebSocket disconnection, the GUI resumes polling and attempts to reconnect.

---

### 5.4 Configuration Engine

#### 5.4.1 Responsibility

The Configuration Engine manages the persistent storage and retrieval of server profiles and application settings. It is the authoritative source of truth for all user-defined configuration.

#### 5.4.2 Storage Format

Configuration is stored in a single JSON file located at a platform-appropriate user data directory (on Linux: `~/.config/servermind-mcp/config.json`; on Windows: `%APPDATA%\servermind-mcp\config.json`). The file is human-readable and can be manually edited when the application is not running, subject to schema validation on next load.

#### 5.4.3 Schema Validation

On every load, the configuration file is validated against a versioned JSON Schema. If validation fails, the Configuration Engine logs the specific violations and loads a safe fallback: default application settings and an empty server profile list. It never silently discards existing data; violations are always surfaced.

#### 5.4.4 Migration Manager

As the application evolves, the configuration schema will change. The Migration Manager detects the version field in the loaded config and applies a sequential chain of migration functions to bring it to the current schema version. Each migration is a pure function that transforms an older schema to a newer one. Migrations are non-destructive; the original file is backed up before migration is applied.

#### 5.4.5 Profile Operations

The Configuration Engine exposes the following operations to other subsystems:

- **List profiles:** Returns all saved server profiles in display order.
- **Create profile:** Validates and saves a new server profile, assigning it a UUID.
- **Update profile:** Validates and overwrites an existing profile by UUID.
- **Delete profile:** Removes a profile by UUID. Deletion is rejected if the profile is currently in an active or reconnecting session state.
- **Reorder profiles:** Persists a new display order for the profile list.

All write operations trigger a file flush immediately and emit a `config_changed` event to notify any listeners (primarily the GUI's profile list view).

---

### 5.5 Command Execution Pipeline

#### 5.5.1 Responsibility

The Command Execution Pipeline receives command strings from two sources (AI agent tool calls and operator manual input), submits them to the active SSH session, captures their full output, and delivers structured results to the originating caller.

#### 5.5.2 Command Queue

Commands are submitted to a thread-safe FIFO queue. A single consumer thread drains the queue and submits commands to the SSH session sequentially. This serialisation prevents race conditions on the SSH channel and ensures predictable ordering of command output in the log.

If a command is submitted while no session is active, it is immediately rejected with a `NO_ACTIVE_SESSION` error rather than queued. Commands are never buffered against a future session establishment.

#### 5.5.3 Execution Modes

Two execution modes are supported:

- **Exec mode:** A new exec channel is opened for each command. The command runs in a fresh environment, stdout and stderr are captured separately, and the channel's exit status code is retrieved. This mode is stateless between commands and is preferred for most MCP tool calls.
- **Shell mode:** A persistent shell channel is maintained. Commands are written to the shell's stdin, and output is read until a sentinel marker is detected. This mode preserves shell state (environment variables, working directory, etc.) between commands and is used for the GUI's manual terminal panel.

The execution mode is selected at command submission time. MCP tool calls default to exec mode. The GUI manual terminal uses shell mode.

#### 5.5.4 Output Capture

In exec mode, stdout and stderr are read in full after the command completes. A configurable maximum output size (default: 4 MB) prevents runaway output from consuming excessive memory. Output exceeding this limit is truncated with a truncation notice appended.

In shell mode, output is streamed to the GUI's terminal panel in real time via the WebSocket event channel. Output is buffered in 512-byte chunks to balance latency and throughput.

#### 5.5.5 Timeout Policy

Each command has an associated timeout (configurable per MCP tool call, with a system default of 300 seconds). If the command does not complete within the timeout, the exec channel is closed, the command is marked as `TIMED_OUT`, and the next command in the queue is processed. The timeout does not affect the session itself, only the individual command channel.

#### 5.5.6 Result Object

Every command execution produces a Result object containing: the original command string, execution mode, start timestamp (UTC), end timestamp (UTC), duration in milliseconds, exit code (or null if timed out or errored), stdout text, stderr text, truncation flag, and the actor identity that initiated the command.

---

### 5.6 Audit & Logging Subsystem

#### 5.6.1 Responsibility

The Audit & Logging Subsystem records every significant event in the system to a persistent file and an in-memory ring buffer. The ring buffer powers the GUI's log viewer. The file provides durable audit history.

#### 5.6.2 Event Categories

Events are classified into the following categories:

- **CONNECTION:** Session establishment, disconnection, reconnection attempts, keep-alive signals, fault transitions.
- **COMMAND:** Command submission, execution start, execution completion, timeout, queue rejection.
- **CONFIG:** Profile created, updated, deleted, reordered; configuration file loaded, saved, migrated.
- **IPC:** IPC bridge started, WebSocket client connected, WebSocket client disconnected, API authentication failure.
- **SYSTEM:** Application started, application shutting down, unexpected exceptions.
- **SECURITY:** Authentication failures, invalid IPC tokens, PPK parse errors.

#### 5.6.3 Log Entry Format

Each log entry contains: UTC timestamp (ISO 8601 with millisecond precision), event category, severity level (DEBUG, INFO, WARNING, ERROR, CRITICAL), actor identity ("operator" or "agent"), server profile UUID (if applicable), session UUID (if applicable), a structured message, and an optional JSON payload with additional context.

#### 5.6.4 File Logger

Log entries are written to a rotating log file. The file is rotated when it reaches a configurable maximum size (default: 10 MB). Up to a configurable number of backup files are retained (default: 5). Log files are stored in the same user data directory as the configuration file.

#### 5.6.5 In-Memory Ring Buffer

The ring buffer holds the most recent N log entries (default: 5000) in memory. The GUI's log viewer reads from this buffer on initial display and subscribes to new entries via the WebSocket event channel. The ring buffer is thread-safe and supports concurrent reads from the GUI while the logging thread writes new entries.

#### 5.6.6 Log Event Emitter

After writing each entry to the file and ring buffer, the subsystem emits a `log_entry` event to the IPC bridge's event bus, which dispatches it to all connected WebSocket clients. This ensures the GUI's log viewer updates in real time without polling.

---

### 5.7 CustomTkinter GUI Application

#### 5.7.1 Responsibility

The GUI application is the operator's control plane. It provides a professional, functional desktop interface for configuring servers, managing the exposed session, reading logs, and issuing manual commands. It communicates exclusively with the MCP backend via the IPC bridge and never directly touches SSH sessions or the configuration file.

#### 5.7.2 Design Principles

The GUI follows a non-fancy, professional design ethos. The colour palette is limited to a neutral dark theme with a single accent colour used sparingly for interactive elements and status indicators. Typography is clean and consistent, using a monospace font for log output and terminal panels and a sans-serif font for all other text. There are no animations, gradients, or decorative elements. Every pixel serves a functional purpose.

CustomTkinter is used as the widget toolkit because it provides native-looking widgets with theme support while remaining pure Python. All layout uses the grid geometry manager for predictable, resizable layouts. Packing is avoided to ensure the application scales correctly when the user resizes the window.

#### 5.7.3 Application Window Structure

The application uses a single main window with a fixed left-side navigation rail and a right-side content area. The navigation rail contains icon-and-label buttons for each major panel. The content area renders the selected panel. A persistent status bar at the bottom of the window displays the IPC bridge connection status, the current session state, and the active server name.

#### 5.7.4 Panels

**Dashboard Panel:**
The default panel shown on startup. Displays a summary card showing the currently exposed server (or "No server exposed"), connection duration, number of commands executed in this session, and the last command issued. Provides quick-action buttons: "Expose Server" (which switches to the Exposure Control Panel), "Connect Manual Terminal," and "View Full Log."

**Server Configuration Panel:**
A two-column layout. The left column shows a scrollable list of saved server profiles, each displayed as a compact card with the server's display name, hostname, and a coloured status dot (active, inactive, fault). Profile cards can be selected, reordered by drag-and-drop, and deleted via a context menu.

The right column shows the edit form for the selected profile. Fields include: Display Name, Hostname / IP Address, SSH Port, Username, PPK Key File Path (with a file picker button that opens a native file dialog filtered to .ppk files), Connection Timeout, Keep-Alive Transport Interval, Keep-Alive Application Interval, Max Reconnect Attempts, and Notes. A Save button persists changes. A "Test Connection" button initiates a trial connection and reports success or failure without entering the exposed state.

**Exposure Control Panel:**
A prominent, dedicated panel for managing which server is exposed. Contains a dropdown selector populated with all saved profiles. Only one profile can be selected. Below the selector is a large "Expose Selected Server" button. When a server is exposed, this panel transforms: the dropdown becomes read-only, the expose button is replaced by a "Disconnect" button (styled in a distinct warning colour), and a live status area shows the connection duration, keep-alive last-ping time, and session UUID. An agent-connection indicator shows whether an AI agent is currently interacting with the session.

**Log Viewer Panel:**
A full-panel scrollable text area displaying the in-memory ring buffer contents. Entries are colour-coded by severity (INFO: default, WARNING: amber, ERROR: red, CRITICAL: bright red). A filter bar at the top allows filtering by event category and severity. A search box performs real-time text search across displayed entries. An "Auto-scroll" toggle (on by default) keeps the view pinned to the latest entry. An "Export Log" button saves the current filtered view to a text file. Log entries are never editable.

**Manual Terminal Panel:**
A split panel. The upper portion is a read-only output area displaying the shell session output in a monospace font. The lower portion is a single-line command input field with a "Send" button. The input field supports command history navigation with the Up and Down arrow keys, storing the last 200 commands in memory for the session. When no server session is active, the input field is disabled and a "No active session" message is shown in the output area. The terminal uses shell mode execution.

**Settings Panel:**
Global application settings not tied to any specific server profile. Includes: IPC bridge port override, UI theme selection (dark/light), log buffer size, log file retention settings, default command timeout, and a "Reset to Defaults" button. Settings are saved immediately on change.

#### 5.7.5 IPC Client Module

The GUI contains a dedicated IPC client module that manages the HTTP session for REST calls and the WebSocket connection. This module runs the WebSocket listener on a background thread and dispatches received events to the appropriate GUI components via a thread-safe event queue. All GUI widget updates happen on the main thread; the IPC client never directly touches widgets.

#### 5.7.6 State Synchronisation

On startup and on each WebSocket reconnection, the GUI fetches the full current state from the IPC REST API (session status, active profile, recent log entries). This ensures the GUI is always consistent with the backend state even if the GUI was restarted while the MCP backend was running with an active session.

#### 5.7.7 Graceful Shutdown

When the GUI is closed (the window's X button or a keyboard shortcut), a shutdown confirmation dialog is shown if a server session is currently active, warning the operator that closing the GUI will terminate the active session. If the operator confirms, the GUI sends a disconnect request to the IPC API before destroying the window. The MCP backend's own shutdown logic handles the SSH teardown.

---

## 6. Data Models

### 6.1 ServerProfile

Represents a single saved server configuration.

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | UUID string | Non-null, unique | Stable identifier, assigned on creation |
| display_name | string | 1–64 chars | Human-readable label |
| hostname | string | Valid hostname or IPv4/IPv6 | Remote server address |
| port | integer | 1–65535, default 22 | SSH port |
| username | string | 1–64 chars | SSH login username |
| ppk_file_path | string | Valid filesystem path | Absolute path to .ppk key file |
| keepalive_transport_interval_sec | integer | 10–3600, default 30 | Interval for SSH transport-level keepalive |
| keepalive_app_interval_sec | integer | 15–3600, default 60 | Interval for application-level heartbeat command |
| connection_timeout_sec | integer | 5–120, default 30 | TCP+SSH handshake timeout |
| max_reconnect_attempts | integer or null | ≥0 or null | null means unlimited retries |
| reconnect_base_delay_sec | integer | 1–60, default 5 | Base delay for reconnection backoff |
| notes | string | 0–512 chars | Free-text notes, not used by any logic |
| created_at | ISO 8601 string | Non-null | Creation timestamp |
| updated_at | ISO 8601 string | Non-null | Last modification timestamp |

### 6.2 SessionState

Represents the live state of an SSH session.

| Field | Type | Description |
|---|---|---|
| session_uuid | UUID string | Unique ID for this session instance |
| profile_id | UUID string | ID of the profile that created this session |
| state | enum | DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING, FAULT |
| connected_at | ISO 8601 string or null | When the current connection was established |
| last_keepalive_at | ISO 8601 string or null | Timestamp of last successful keepalive |
| reconnect_attempt_count | integer | Number of reconnection attempts in current fault cycle |
| commands_executed | integer | Total commands executed in this session instance |
| last_command_at | ISO 8601 string or null | Timestamp of last command |

### 6.3 CommandRequest

Submitted by an MCP tool call or the GUI manual terminal.

| Field | Type | Description |
|---|---|---|
| command_id | UUID string | Unique ID for this command invocation |
| command_text | string | The shell command to execute |
| execution_mode | enum | EXEC or SHELL |
| timeout_sec | integer | Per-command timeout |
| actor | enum | AGENT or OPERATOR |
| submitted_at | ISO 8601 string | Submission timestamp |

### 6.4 CommandResult

Produced by the Command Execution Pipeline.

| Field | Type | Description |
|---|---|---|
| command_id | UUID string | Matches the originating CommandRequest |
| exit_code | integer or null | Process exit code; null if timed out or errored |
| stdout | string | Captured standard output |
| stderr | string | Captured standard error |
| truncated | boolean | True if output was truncated at the size limit |
| duration_ms | integer | Wall-clock execution time |
| status | enum | COMPLETED, TIMED_OUT, ERROR, SESSION_UNAVAILABLE |
| completed_at | ISO 8601 string | Completion timestamp |

### 6.5 LogEntry

A single audit log record.

| Field | Type | Description |
|---|---|---|
| entry_id | UUID string | Unique log entry identifier |
| timestamp | ISO 8601 string | UTC timestamp with millisecond precision |
| category | enum | CONNECTION, COMMAND, CONFIG, IPC, SYSTEM, SECURITY |
| level | enum | DEBUG, INFO, WARNING, ERROR, CRITICAL |
| actor | enum or null | OPERATOR, AGENT, SYSTEM |
| profile_id | UUID string or null | Associated server profile, if applicable |
| session_uuid | UUID string or null | Associated session, if applicable |
| message | string | Human-readable event description |
| payload | JSON object or null | Structured additional context |

---

## 7. IPC Contract: MCP ↔ GUI

All IPC API endpoints are served at `http://127.0.0.1:{ipc_port}/api/v1/`. Authentication uses a Bearer token in the `Authorization` header.

### 7.1 REST Endpoints

#### `GET /health`
Returns HTTP 200 with backend process uptime and version. No authentication required. Used by the GUI for polling during startup.

#### `GET /session/status`
Returns the current SessionState object. Returns a DISCONNECTED state object if no session has ever been established.

#### `GET /profiles`
Returns an ordered array of all ServerProfile objects (minus the PPK file content — only the path).

#### `POST /session/expose`
Request body: `{ "profile_id": "<uuid>" }`. Instructs the backend to begin establishing an SSH session for the specified profile. Returns immediately with an acknowledgement. The actual connection progression is reported via WebSocket events. Returns HTTP 409 if another session is already in an active or reconnecting state.

#### `POST /session/disconnect`
No request body. Instructs the backend to cleanly terminate the active session. Returns HTTP 404 if no active session exists.

#### `GET /logs`
Query parameters: `limit` (default 200, max 5000), `category` (optional filter), `level` (optional filter), `since` (optional ISO 8601 timestamp). Returns a paginated array of LogEntry objects from the ring buffer.

#### `POST /terminal/send`
Request body: `{ "command_text": "<command>" }`. Submits a command from the GUI's manual terminal to the shell-mode channel. Returns the command_id immediately. The output is streamed back via WebSocket events.

### 7.2 WebSocket Endpoint

#### `WS /ws/events`
Query parameter: `token=<ipc_token>`. Upgrades to a WebSocket connection. The backend sends JSON-encoded event messages over this channel.

**Event envelope format:**
Every event has a `type` field and a `payload` field. The `type` field is a namespaced string (e.g., `log.entry`, `session.state_changed`, `command.completed`, `terminal.output_chunk`).

**Event types:**

- `log.entry` — A new LogEntry object.
- `session.state_changed` — A new SessionState object reflecting the current state.
- `command.completed` — A CommandResult object for a completed EXEC-mode command.
- `terminal.output_chunk` — A chunk of terminal output: `{ "command_id": "<uuid>", "chunk": "<text>", "stream": "stdout|stderr" }`.
- `keepalive.heartbeat` — A heartbeat acknowledgement: `{ "session_uuid": "<uuid>", "timestamp": "<ISO 8601>" }`.
- `config.changed` — Notification that the profile list has changed; GUI should re-fetch `/profiles`.

---

## 8. MCP Tool Catalogue

The following tools are exposed by the MCP server and discoverable by any MCP-compatible AI agent.

### 8.1 `server_list_profiles`

**Description:** Returns a list of all configured server profiles available for exposure. Does not include sensitive credential paths in the response.

**Input schema:** No input parameters.

**Output:** A JSON array of profile summaries: id, display_name, hostname, port, username, notes, and the current session state if any.

**Side effects:** None. Read-only.

---

### 8.2 `server_get_session_status`

**Description:** Returns the current session state including connection status, uptime, keep-alive health, and command statistics.

**Input schema:** No input parameters.

**Output:** A SessionState JSON object.

**Side effects:** None. Read-only.

---

### 8.3 `server_expose`

**Description:** Initiates an SSH connection to the specified server profile and places it in the exposed state. Only one server may be exposed at a time. If another server is already exposed, this tool returns an error.

**Input schema:**
- `profile_id` (string, required): The UUID of the server profile to expose.

**Output:** An acknowledgement object containing the session_uuid and the initial state (CONNECTING). The agent should subsequently call `server_get_session_status` to confirm the connection reached the CONNECTED state before issuing commands.

**Side effects:** Initiates SSH connection. Triggers `session.state_changed` events over the IPC WebSocket. GUI Exposure Control Panel updates to reflect the new state.

---

### 8.4 `server_execute_command`

**Description:** Executes a shell command on the currently exposed server and returns the full output. Uses exec mode; each command runs in a fresh environment.

**Input schema:**
- `command` (string, required): The shell command to execute. May include pipes, redirects, and other shell syntax.
- `timeout_sec` (integer, optional, default 300): Maximum seconds to wait for the command to complete.

**Output:** A CommandResult JSON object containing exit_code, stdout, stderr, truncated flag, duration_ms, and status.

**Side effects:** Command is logged to the audit log with actor set to AGENT. Log entry is streamed to GUI log viewer.

**Error conditions:** Returns a structured error if no session is active (status: SESSION_UNAVAILABLE), if the session is in RECONNECTING or FAULT state, or if the command times out (status: TIMED_OUT).

---

### 8.5 `server_connect_terminal`

**Description:** Initiates or confirms a persistent shell-mode terminal connection on the exposed server. After calling this tool, subsequent commands sent via `server_send_terminal_input` retain shell state (working directory, environment variables, shell functions, etc.).

**Input schema:** No input parameters.

**Output:** A confirmation object with the shell session identifier and an indication of whether a shell channel was freshly opened or was already active.

**Side effects:** Opens a persistent shell channel if one is not already open. GUI Manual Terminal Panel reflects the active shell session.

---

### 8.6 `server_send_terminal_input`

**Description:** Sends a line of input to the active persistent shell session and waits for output to settle. Suitable for interactive commands where state must be preserved between calls.

**Input schema:**
- `input` (string, required): The input string to send. A newline is automatically appended if not present.
- `wait_ms` (integer, optional, default 1000): Milliseconds to wait for output to settle after the input is sent.

**Output:** A CommandResult-equivalent object with the captured output from the shell since the input was sent.

**Side effects:** Input and output are logged. Terminal output is streamed to the GUI Manual Terminal Panel.

---

### 8.7 `server_disconnect`

**Description:** Cleanly terminates the currently active SSH session. This is one of three valid ways to end a session; the other two are the GUI Disconnect button and closing the GUI application.

**Input schema:** No input parameters.

**Output:** A confirmation object with the session_uuid of the session that was terminated and the final command statistics.

**Side effects:** SSH channel and transport are closed. Session state transitions to DISCONNECTED. Keep-Alive Engine for this session is stopped. GUI Exposure Control Panel resets to the "no session" state. Log entry recorded with actor set to AGENT.

---

### 8.8 `server_read_log`

**Description:** Retrieves recent audit log entries. Useful for agents that need to review what has occurred in the current session.

**Input schema:**
- `limit` (integer, optional, default 50, max 500): Maximum number of entries to return.
- `category` (string, optional): Filter by event category (CONNECTION, COMMAND, CONFIG, IPC, SYSTEM, SECURITY).
- `since_timestamp` (string, optional): ISO 8601 timestamp; returns only entries after this time.

**Output:** A JSON array of LogEntry objects in chronological order.

**Side effects:** None. Read-only.

---

## 9. Session Lifecycle & Persistence

### 9.1 Session States

A session progresses through the following states:

- **DISCONNECTED:** No active SSH connection. The initial state and the terminal state after a clean disconnect.
- **CONNECTING:** SSH handshake and authentication are in progress.
- **CONNECTED:** The SSH session is fully established, authenticated, and keep-alive signals are running.
- **RECONNECTING:** The session dropped unexpectedly and an automatic reconnection attempt is in progress.
- **FAULT:** The reconnection policy has been exhausted (if a limit is configured). Manual intervention is required.

### 9.2 Valid State Transitions

```
DISCONNECTED → CONNECTING        (expose request received)
CONNECTING   → CONNECTED         (authentication successful)
CONNECTING   → DISCONNECTED      (connection attempt failed, no retry applicable)
CONNECTED    → RECONNECTING      (unexpected drop detected)
CONNECTED    → DISCONNECTED      (explicit disconnect requested)
RECONNECTING → CONNECTED         (reconnection attempt succeeded)
RECONNECTING → FAULT             (max retry attempts exhausted)
FAULT        → DISCONNECTED      (operator manually clears the fault)
FAULT        → CONNECTING        (operator manually retries)
```

Any transition not in this table is illegal and causes an internal error log entry.

### 9.3 Keep-Alive Guarantee

No session in the CONNECTED state will transition to RECONNECTING due to inactivity. The Keep-Alive Engine's transport-level and application-level signals together guarantee that the session remains active regardless of how long the operator or agent is idle. The only way for a CONNECTED session to leave that state is via an explicit disconnect request or an external network fault.

### 9.4 Shutdown Behaviour

When the GUI application's main window is closed:

1. If session state is DISCONNECTED: the GUI exits immediately.
2. If session state is CONNECTED, RECONNECTING, or FAULT: a modal confirmation dialog is shown.
3. If the operator confirms shutdown: the GUI sends a `POST /session/disconnect` request to the IPC API, waits up to 10 seconds for a DISCONNECTED state confirmation via the WebSocket, then destroys the window regardless.
4. The MCP backend process remains running after the GUI closes and continues to serve AI agent requests with the now-disconnected session state. The MCP backend does not automatically exit when the GUI disconnects.
5. The MCP backend exits only when its host process (the terminal running `mcp serve`) receives a SIGTERM or SIGINT.

---

## 10. Authentication & Key Management

### 10.1 PPK File Handling

PuTTY Private Key files are referenced by their filesystem path in the server profile. The actual file content is read only at connection time and immediately parsed into an in-memory key object. The key object is held in process memory for the duration of the session. It is never logged, never transmitted over the IPC bridge, and never written to any file other than its original .ppk location.

PPK version 2 and version 3 are both supported. Password-protected PPK files are supported; the passphrase is requested via a modal dialog in the GUI at connection time and held in memory for the session duration. The passphrase is never persisted.

### 10.2 IPC Token Security

The IPC shared secret token is a cryptographically random 32-byte value, hex-encoded. It is generated fresh each time the MCP backend process starts. It is written to a runtime state file (`~/.config/servermind-mcp/runtime.json`) with permissions set to `600` (owner read/write only). The GUI reads this file to obtain the token. The token is never logged in any log output.

### 10.3 Host Key Verification

SSH host key verification is enabled by default. On first connection to a server, the host key is stored in a known_hosts file managed by the application (`~/.config/servermind-mcp/known_hosts`). On subsequent connections, the presented key is verified against the stored key. Host key mismatches result in a CONNECTING → DISCONNECTED transition with a SECURITY log entry and a prominent warning in the GUI. The operator must explicitly approve a host key change before connecting to a server whose key has changed.

### 10.4 Privilege Model

The application runs entirely under the operator's user account. It requires no elevated privileges. SSH connections are made as the username specified in the server profile; root-level access on the remote server is the responsibility of the operator through standard SSH mechanisms (sudo, key-based root access, etc.).

---

## 11. Folder Structure

```
servermind-mcp/
│
├── mcp_server/                        # MCP backend process
│   ├── __main__.py                    # Entry point; starts MCP server and IPC bridge
│   ├── server.py                      # MCP protocol handler and tool registry
│   ├── tools/                         # One module per MCP tool
│   │   ├── __init__.py
│   │   ├── list_profiles.py
│   │   ├── get_session_status.py
│   │   ├── expose.py
│   │   ├── execute_command.py
│   │   ├── connect_terminal.py
│   │   ├── send_terminal_input.py
│   │   ├── disconnect.py
│   │   └── read_log.py
│   ├── transport/                     # MCP transport adapters
│   │   ├── __init__.py
│   │   ├── stdio_transport.py
│   │   └── sse_transport.py
│   └── validators/                    # Input schema validation
│       ├── __init__.py
│       └── tool_schemas.py
│
├── ssh/                               # SSH Session Manager
│   ├── __init__.py
│   ├── session_manager.py             # Top-level session lifecycle controller
│   ├── session_registry.py            # Thread-safe active session registry
│   ├── connection.py                  # SSH connection establishment logic
│   ├── ppk_handler.py                 # PPK file loading and conversion
│   ├── keepalive.py                   # Keep-Alive Engine
│   ├── reconnect.py                   # Reconnection policy implementation
│   ├── exec_channel.py                # Exec-mode command execution
│   └── shell_channel.py               # Shell-mode persistent channel
│
├── ipc/                               # IPC Bridge Layer
│   ├── __init__.py
│   ├── bridge.py                      # FastAPI app and startup
│   ├── routes/                        # REST route handlers
│   │   ├── __init__.py
│   │   ├── health.py
│   │   ├── session.py
│   │   ├── profiles.py
│   │   ├── logs.py
│   │   └── terminal.py
│   ├── websocket.py                   # WebSocket manager and event dispatcher
│   ├── event_bus.py                   # Internal event bus (pub/sub)
│   ├── auth.py                        # Token generation and validation
│   └── models.py                      # Pydantic models for API request/response
│
├── config/                            # Configuration Engine
│   ├── __init__.py
│   ├── engine.py                      # Main config load/save/validate logic
│   ├── schema.py                      # JSON Schema definition
│   ├── migrations/                    # Schema migration functions
│   │   ├── __init__.py
│   │   └── v1_to_v2.py               # Example migration module
│   └── paths.py                       # Platform-appropriate path resolution
│
├── pipeline/                          # Command Execution Pipeline
│   ├── __init__.py
│   ├── queue_manager.py               # Thread-safe command queue and consumer
│   ├── executor.py                    # Command execution orchestrator
│   └── result.py                      # CommandResult construction
│
├── audit/                             # Audit & Logging Subsystem
│   ├── __init__.py
│   ├── logger.py                      # Main audit logger
│   ├── ring_buffer.py                 # In-memory ring buffer
│   ├── file_handler.py                # Rotating file handler configuration
│   └── models.py                      # LogEntry dataclass
│
├── gui/                               # CustomTkinter GUI Application
│   ├── __main__.py                    # GUI entry point
│   ├── app.py                         # Root application class and window
│   ├── ipc_client.py                  # IPC REST and WebSocket client
│   ├── state.py                       # GUI-side state store (observable)
│   ├── panels/                        # One module per navigation panel
│   │   ├── __init__.py
│   │   ├── dashboard.py
│   │   ├── server_config.py
│   │   ├── exposure_control.py
│   │   ├── log_viewer.py
│   │   ├── manual_terminal.py
│   │   └── settings.py
│   ├── widgets/                       # Reusable custom widget components
│   │   ├── __init__.py
│   │   ├── profile_card.py            # Server profile list card widget
│   │   ├── status_dot.py              # Coloured connection status indicator
│   │   ├── log_row.py                 # Single log entry display widget
│   │   ├── nav_button.py              # Navigation rail button widget
│   │   └── confirm_dialog.py         # Modal confirmation dialog
│   ├── themes/                        # Theme definitions
│   │   ├── dark.py
│   │   └── light.py
│   └── utils/                         # GUI utility functions
│       ├── __init__.py
│       ├── thread_bridge.py           # Thread-safe GUI update queue
│       └── formatting.py             # Timestamp and text formatting helpers
│
├── shared/                            # Code shared between mcp_server and gui
│   ├── __init__.py
│   ├── constants.py                   # Application-wide constants
│   ├── exceptions.py                  # Custom exception hierarchy
│   └── models.py                      # Shared dataclasses (ServerProfile, etc.)
│
├── tests/                             # Test suite
│   ├── unit/
│   │   ├── test_ppk_handler.py
│   │   ├── test_session_registry.py
│   │   ├── test_config_engine.py
│   │   ├── test_ring_buffer.py
│   │   └── test_tool_validators.py
│   ├── integration/
│   │   ├── test_ipc_bridge.py
│   │   └── test_command_pipeline.py
│   └── fixtures/
│       └── sample_profile.json
│
├── scripts/                           # Developer utility scripts
│   ├── generate_test_ppk.py
│   └── reset_config.py
│
├── pyproject.toml                     # Project metadata and dependencies
├── README.md                          # Project overview and quick start
└── ARCHITECTURE.md                    # This document
```

---

## 12. Process Architecture

### 12.1 Process Topology

The system runs as two separate OS processes:

**Process 1 — MCP Backend:** Started by the AI agent's MCP client or manually from the command line. Hosts the MCP server, the IPC bridge (FastAPI), the SSH Session Manager, the Command Execution Pipeline, and the Audit Logger. This process is the system's authoritative backend; it can run without the GUI.

**Process 2 — GUI Application:** Started by the operator from the command line or a desktop shortcut. Hosts only the CustomTkinter GUI and the IPC client. This process is purely a control surface; it holds no session state and makes no SSH connections.

Both processes communicate exclusively through the IPC bridge. The GUI never imports or calls any code from the MCP backend's modules.

### 12.2 Startup Sequence — MCP Backend

1. Load and validate configuration file; create defaults if absent.
2. Generate IPC token and write to runtime state file.
3. Start the FastAPI IPC bridge on the configured port.
4. Start the audit file logger.
5. Start the MCP protocol listener (stdio or SSE, depending on invocation).
6. Log `SYSTEM` INFO entry: "MCP backend started."

### 12.3 Startup Sequence — GUI Application

1. Resolve the runtime state file path and read the IPC token.
2. Attempt HTTP GET to `/api/v1/health` with the token; if unavailable, display "Waiting for MCP backend..." in the status bar and retry every 2 seconds.
3. On successful health response, fetch current session state and profile list.
4. Render the main window with the Dashboard panel active.
5. Open the WebSocket connection to `/ws/events`.
6. Begin processing WebSocket events and updating GUI state.

### 12.4 Recommended Invocation

For normal use, the operator runs both processes. A helper shell script or a batch file is provided that starts the MCP backend as a background process and then immediately starts the GUI in the foreground. Closing the GUI foreground process does not kill the background MCP process.

For AI agent use without a running GUI, the MCP backend alone is sufficient. The agent's MCP client starts the backend via stdio transport and interacts with it through tool calls.

---

## 13. State Machine Diagrams

### 13.1 Session State Machine

```
                        ┌─────────────────┐
                        │   DISCONNECTED  │◄──────────────────────────┐
                        └────────┬────────┘                           │
                                 │                                     │
                    expose()     │                    disconnect()     │
                    requested    ▼                    requested        │
                        ┌─────────────────┐                           │
                        │   CONNECTING    │─────────────────────────► │
                        └────────┬────────┘  auth fail / net error    │
                                 │                                     │
                    auth         │                                     │
                    success      ▼                                     │
                        ┌─────────────────┐   disconnect()            │
                        │    CONNECTED    │──────────────────────────►│
                        └────────┬────────┘  requested                │
                                 │                                     │
                  unexpected     │                                     │
                  drop           ▼                                     │
                        ┌─────────────────┐                           │
                        │  RECONNECTING   │── reconnect success ──►   │
                        └────────┬────────┘         │                 │
                                 │                  │ (to CONNECTED)  │
                    max          │                  ▼                 │
                    retries      ▼          ┌───────────────┐        │
                    exhausted ┌─────────────┐    CONNECTED  │        │
                        ┌────►│    FAULT    │               │        │
                        │     └────────┬────┘               │        │
                        │              │                     │        │
                        │   operator   │  operator           │        │
                        │   retries    │  clears fault       │        │
                        │              │                     │        │
                        └──────────────┘                     └───────►│
                                                      (to CONNECTED)  │
                                                                       │
                                                              (back to DISCONNECTED)
```

### 13.2 GUI IPC Connection State

```
  ┌──────────────┐       health poll        ┌──────────────┐
  │   WAITING    │─────────────────────────►│   CONNECTED  │
  │   FOR MCP    │                          │              │
  └──────────────┘◄─────────────────────────└──────┬───────┘
                    WS disconnect / health            │
                    poll fails                        │
                                               WS receives events,
                                               REST calls succeed
```

---

## 14. Security Architecture

### 14.1 Threat Model Scope

The threat model addresses threats from other processes running under different user accounts on the same machine, not threats from network attackers (the IPC bridge is loopback-only). Remote server security is the responsibility of the SSH layer.

### 14.2 IPC Token

The IPC token is the primary defence against other local processes (running under different users) connecting to the IPC bridge and issuing commands. The token file's `600` permissions ensure only the file's owner (the operator) can read it. A process running as a different user cannot obtain the token and therefore cannot authenticate with the IPC bridge.

### 14.3 In-Memory Key Material

Private key material (parsed PPK key objects, passphrases) is stored only in process memory and is never written to any file or included in any log output. On session termination, the key object references are explicitly set to null to allow garbage collection as promptly as possible.

### 14.4 No Outbound Connections Beyond SSH

The MCP backend makes no outbound network connections other than the SSH connection to the configured server. There are no telemetry endpoints, no update check endpoints, and no cloud dependencies.

### 14.5 Log Sanitisation

Log entries must never include raw private key content, passphrases, or the IPC token. The logging infrastructure applies a sanitisation filter that detects and redacts strings matching known private key header patterns, hex-encoded 32-byte strings, and any field explicitly tagged as sensitive by the calling subsystem.

### 14.6 Host Key Trust

The application maintains its own known_hosts file and enforces strict host key verification. This provides protection against SSH man-in-the-middle attacks on the local network. Operators who need to accept a changed host key must do so explicitly through the GUI or a CLI flag.

---

## 15. Error Handling Strategy

### 15.1 Error Classification

Errors are classified into four tiers:

- **Tier 1 — Transient:** Network hiccups, temporary SSH channel errors, IPC connection drops. These trigger automatic retry logic and produce WARNING log entries.
- **Tier 2 — Recoverable:** Invalid command syntax on the remote server, command timeout, PPK parse failure on a non-current profile. These produce ERROR log entries and structured error responses but do not affect the session state.
- **Tier 3 — Session-Affecting:** Authentication failure, host key mismatch, SSH transport-level error. These cause state transitions (to RECONNECTING or DISCONNECTED) and produce ERROR or CRITICAL log entries.
- **Tier 4 — Fatal:** Configuration file corruption that cannot be auto-migrated, IPC bridge port already in use, critical runtime exception in the MCP core. These cause the affected process to log a CRITICAL entry and exit gracefully.

### 15.2 MCP Tool Error Responses

All MCP tool handlers are wrapped in a top-level error boundary. Any unhandled exception that escapes a tool handler is caught by the boundary, logged as a Tier 4 error, and converted into a structured MCP error response rather than crashing the MCP server process. This ensures the agent always receives a parseable response.

### 15.3 GUI Error Display

Errors affecting the session state are displayed in the Exposure Control Panel's status area. IPC connectivity errors are displayed in the status bar. Configuration errors are displayed inline in the Server Configuration Panel's edit form. No modal error dialogs are shown for non-fatal errors; they are relegated to the status bar and the Log Viewer Panel.

### 15.4 Recovery Actions Available to Operators

The GUI provides the following explicit recovery actions:

- **Retry Expose:** Available in FAULT state. Resets the reconnect counter and attempts a fresh connection.
- **Clear Fault:** Available in FAULT state. Transitions to DISCONNECTED without attempting reconnection.
- **Force Disconnect:** Available in RECONNECTING state. Stops reconnection attempts and transitions to DISCONNECTED.

---

## 16. Configuration File Specifications

### 16.1 Top-Level Structure

The configuration file is a JSON object with the following top-level fields:

- `schema_version`: Integer. Current version is 1. Incremented with each schema-breaking change.
- `app_settings`: Object. Global application settings.
- `server_profiles`: Array. Ordered list of ServerProfile objects.

### 16.2 `app_settings` Fields

| Field | Type | Default | Description |
|---|---|---|---|
| ipc_port | integer | 17432 | Port for the IPC bridge |
| ui_theme | string ("dark"/"light") | "dark" | GUI colour theme |
| log_buffer_size | integer | 5000 | In-memory log ring buffer capacity |
| log_max_file_size_mb | integer | 10 | Max log file size before rotation |
| log_backup_count | integer | 5 | Number of rotated log files to retain |
| default_command_timeout_sec | integer | 300 | Default per-command timeout |
| ipc_poll_interval_ms | integer | 2000 | GUI IPC bridge polling interval |

### 16.3 File Location by Platform

| Platform | Path |
|---|---|
| Linux / macOS | `~/.config/servermind-mcp/config.json` |
| Windows | `%APPDATA%\servermind-mcp\config.json` |

### 16.4 Runtime State File

A separate runtime state file is written at MCP backend startup:

| Platform | Path |
|---|---|
| Linux / macOS | `~/.config/servermind-mcp/runtime.json` |
| Windows | `%APPDATA%\servermind-mcp\runtime.json` |

Contents: `{ "ipc_token": "<hex>", "ipc_port": <integer>, "pid": <integer>, "started_at": "<ISO 8601>" }`.

---

## 17. Threading & Concurrency Model

### 17.1 MCP Backend Thread Map

| Thread Name | Owner | Responsibility |
|---|---|---|
| `main` | Process entry | MCP stdio listener loop or FastAPI main loop |
| `ipc-bridge` | IPC Bridge | FastAPI ASGI event loop (asyncio) |
| `ssh-keepalive-{session_uuid}` | Keep-Alive Engine | Per-session keep-alive signal sender |
| `cmd-queue-consumer` | Command Queue | Drains command queue, submits to SSH channels |
| `reconnect-{session_uuid}` | Reconnection Policy | Retry loop during RECONNECTING state |
| `audit-writer` | Audit Logger | Writes log entries from a queue to file |

### 17.2 GUI Thread Map

| Thread Name | Owner | Responsibility |
|---|---|---|
| `main` | Tkinter | Tkinter event loop; all widget updates must occur here |
| `ipc-ws-listener` | IPC Client | Listens on WebSocket; pushes events to GUI event queue |
| `ipc-poll` | IPC Client | Health polls during startup; terminates after connection |

### 17.3 Thread Safety Rules

All widget manipulation must occur on the `main` thread. The `ipc-ws-listener` thread never touches widgets directly. Instead, it places event objects onto a thread-safe queue. The main thread processes this queue on a periodic `after()` callback (every 50ms). This is the standard Tkinter threading pattern.

In the MCP backend, the Session Registry and the Command Queue are protected by threading locks. The Audit Logger uses a dedicated writer thread with a queue to avoid blocking the caller.

### 17.4 Asyncio and Threading Boundary

The IPC bridge runs on asyncio (via FastAPI/uvicorn). The SSH Session Manager and Command Pipeline are synchronous. The boundary between asyncio code and synchronous code is managed through `asyncio.run_in_executor` calls, which run synchronous SSH and command operations in a thread pool without blocking the asyncio event loop.

---

## 18. Dependency Manifest

All dependencies are Python packages installed via pip. The project targets Python 3.11 or later.

### 18.1 MCP Backend Dependencies

| Package | Purpose |
|---|---|
| `mcp` | Official Anthropic MCP SDK for Python (stdio and SSE transport) |
| `paramiko` | SSH client library with native PPK v2/v3 support |
| `fastapi` | ASGI web framework for the IPC REST API and WebSocket |
| `uvicorn` | ASGI server for FastAPI |
| `websockets` | WebSocket protocol implementation used by FastAPI |
| `pydantic` | Data validation and serialisation for API models and config |
| `jsonschema` | JSON Schema validation for configuration files |
| `cryptography` | Cryptographic primitives (IPC token generation, key handling support) |

### 18.2 GUI Dependencies

| Package | Purpose |
|---|---|
| `customtkinter` | Enhanced Tkinter widget toolkit with theming support |
| `tkinter` | Python standard library GUI toolkit (bundled with Python) |
| `httpx` | Async-capable HTTP client for IPC REST calls |
| `websocket-client` | WebSocket client for the GUI's IPC WebSocket connection |

### 18.3 Shared / Development Dependencies

| Package | Purpose |
|---|---|
| `pytest` | Test runner |
| `pytest-asyncio` | Asyncio support for pytest |
| `pytest-mock` | Mock support for pytest |
| `black` | Code formatter |
| `ruff` | Linter |
| `mypy` | Static type checker |

---

## 19. Deployment & Distribution

### 19.1 Installation

The project is packaged as a standard Python package with a `pyproject.toml`. Installation via pip installs all runtime dependencies and registers two console entry points: `servermind-mcp` (starts the MCP backend) and `servermind-gui` (starts the GUI application).

### 19.2 MCP Client Configuration

To integrate with Claude Code, the operator adds the following to their Claude Code MCP configuration file:

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

For VS Code with GitHub Copilot (SSE transport), the operator starts the MCP backend with the `--transport sse` flag and points the extension at `http://127.0.0.1:<mcp_sse_port>`.

### 19.3 Platform Support

The system is designed to run on Linux, macOS, and Windows. Tkinter is available on all three platforms. Paramiko and FastAPI are cross-platform. Platform-specific considerations:

- **Windows:** PPK file path separators use backslash; the configuration engine normalises all paths to use forward slashes internally and re-normalises on write.
- **macOS:** Tkinter may require XQuartz or a system Python with Tk compiled in; the README provides guidance.
- **Linux:** All dependencies are available via pip with no additional system library requirements for most distributions.

### 19.4 No Installer Required

The application requires no system-level installer. All data is stored in the user's home directory. Uninstallation consists of `pip uninstall servermind-mcp` and deleting the `~/.config/servermind-mcp/` directory.

---

## 20. Future Extensibility

### 20.1 Multi-Session Support

The architecture is designed with the single-session constraint as a policy decision, not a technical limitation. The Session Registry, Command Queue, and IPC bridge all use session UUIDs as identifiers, making it straightforward to lift the single-session constraint in a future version by removing the uniqueness check and updating the GUI's Exposure Control Panel to display multiple active sessions.

### 20.2 Additional Authentication Methods

The authentication boundary is cleanly isolated in `ssh/ppk_handler.py` and `ssh/connection.py`. Additional authentication methods — password-based authentication, OpenSSH private keys, SSH certificates, SSH agents — can be added by extending the `AuthStrategy` abstraction without modifying any other component.

### 20.3 Additional MCP Tool Endpoints

New MCP tools are added by: creating a new module in `mcp_server/tools/`, registering it in the Tool Registry in `mcp_server/server.py`, and adding the corresponding JSON Schema to `mcp_server/validators/tool_schemas.py`. No other files need modification.

### 20.4 Plugin Architecture for Log Sinks

The Audit Logger's emitter architecture can be extended to support additional log sinks (e.g., writing to a database, pushing to a remote logging service, or integrating with Splunk) by adding new sink implementations that subscribe to the internal event bus.

### 20.5 SFTP File Transfer Tool

An SFTP file transfer MCP tool (`server_upload_file`, `server_download_file`) is a natural extension of the existing SSH session infrastructure. Paramiko provides SFTP support natively over the same transport, requiring no additional authentication.

### 20.6 Port Forwarding / Tunnelling

SSH port forwarding (local and remote) can be exposed as MCP tools. The session connection already has a live paramiko Transport object, which supports `open_channel('direct-tcpip', ...)` for local forwarding. This can be added as a pair of MCP tools (`server_open_tunnel`, `server_close_tunnel`) without structural changes to the architecture.

---

*End of Architecture Document — ServerMind MCP v1.0.0*

---

**Document Owner:** Engineering Lead  
**Review Cycle:** On every major architectural decision or before each significant release  
**Last Updated:** 2026-04-28
