import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { existsSync, statSync } from "fs";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { ipcFetch, getIpcBase } from "@/lib/ipc-client";
import type { WFNode, WFEdge, WFNodeLog, CommandNodeData, ScriptNodeData, FileWriteNodeData, FileUploadNodeData, DelayNodeData } from "@/types/workflow";

async function sendToTerminal(text: string): Promise<void> {
  try {
    const res = await ipcFetch("/session/terminal/inject", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    await res.text(); // drain
  } catch { /* non-critical */ }
}

function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// POST /api/workflows/[id]/run
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { variables: inputVars = {}, session_uuid, profile_id } = body as {
    variables: Record<string, string>;
    session_uuid?: string | null;
    profile_id?: string | null;
  };

  const wf = await prisma.workflow.findUnique({ where: { id } });
  if (!wf) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

  const nodes: WFNode[] = JSON.parse(wf.nodes);
  const edges: WFEdge[] = JSON.parse(wf.edges);

  // Create execution record (store session_uuid in profile_id field for display purposes)
  const execution = await prisma.workflowExecution.create({
    data: {
      workflow_id: id,
      profile_id: session_uuid || profile_id || null,
      status: "running",
      variables: JSON.stringify(inputVars),
      logs: "[]",
    },
  });

  // Run in background
  runWorkflow(execution.id, nodes, edges, inputVars, session_uuid || null).catch(console.error);

  return NextResponse.json({ execution_id: execution.id, status: "running" }, { status: 202 });
}

// GET /api/workflows/[id]/run — list executions for this workflow
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const executions = await prisma.workflowExecution.findMany({
    where: { workflow_id: id },
    orderBy: { started_at: "desc" },
    take: 20,
  });

  return NextResponse.json(executions.map((e) => ({
    id: e.id,
    workflow_id: e.workflow_id,
    profile_id: e.profile_id,
    status: e.status,
    variables: JSON.parse(e.variables),
    logs: JSON.parse(e.logs),
    error: e.error,
    started_at: e.started_at.toISOString(),
    completed_at: e.completed_at?.toISOString() || null,
  })));
}

// ─── Background runner ────────────────────────────────────────────────────────
async function runWorkflow(
  execId: string,
  nodes: WFNode[],
  edges: WFEdge[],
  vars: Record<string, string>,
  sessionUuid?: string | null,
) {
  const logs: WFNodeLog[] = [];

  // Determine IPC routing paths based on whether a pool session is selected
  const execPath = sessionUuid ? `/workflow-connections/${sessionUuid}/exec` : "/exec";
  const uploadPath = sessionUuid ? `/workflow-connections/${sessionUuid}/upload-local` : "/upload-local";

  // Resolve prompt string from session info
  let prompt = "server:~$";
  if (sessionUuid) {
    try {
      const statusRes = await ipcFetch(`/workflow-connections/${sessionUuid}/status`);
      if (statusRes.ok) {
        const connInfo = await statusRes.json() as { username?: string; hostname?: string };
        if (connInfo.username && connInfo.hostname) {
          prompt = `${connInfo.username}@${connInfo.hostname}:~$`;
        }
      }
    } catch { /* ignore */ }
  }

  async function appendLog(log: WFNodeLog) {
    logs.push(log);
    await prisma.workflowExecution.update({
      where: { id: execId },
      data: { logs: JSON.stringify(logs) },
    });
  }

  // Topological sort: find execution order
  const ordered = topoSort(nodes, edges);

  // Track effective working directory across stateless exec calls.
  // Each /exec runs a fresh shell, so we must simulate CWD manually.
  // When a command node runs 'cd <path>', we update this variable.
  // Relative paths are resolved against it; uploads use it as the default location.
  let trackedCwd = "$HOME";

  await sendToTerminal(`\r\n\x1b[36m\u2501\u2501\u2501 Workflow: ${execId} \u2501\u2501\u2501\x1b[0m\r\n`);
  await sendToTerminal(`\x1b[2m${prompt}\x1b[0m\r\n\r\n`);

  try {
    for (const node of ordered) {
      if (node.type === "trigger" || node.type === "note") continue;

      const nodeLog: WFNodeLog = {
        node_id: node.id,
        node_label: (node.data as { label: string }).label,
        status: "running",
        started_at: new Date().toISOString(),
      };
      await appendLog(nodeLog);

      try {
        let output = "";
        let commandText = "";

        if (node.type === "command") {
          const data = node.data as CommandNodeData;
          commandText = interpolate(data.command, vars);
          await sendToTerminal(`\x1b[32m${prompt}\x1b[0m \x1b[1m${commandText}\x1b[0m\r\n`);
          // Prepend cd so each stateless SSH exec runs in the tracked working directory.
          const execCmd = trackedCwd === "$HOME" ? commandText : `cd "${trackedCwd}" && ${commandText}`;
          const res = await ipcFetch(execPath, {
            method: "POST",
            body: JSON.stringify({ command: execCmd, timeout_sec: data.timeout || 300 }),
          });
          const result = await res.json();
          const _stdout = result.stdout || "";
          const _stderr = result.stderr || "";
          output = [_stdout, _stderr].filter((s) => s.trim()).join("\n");
          if (output) await sendToTerminal(`${output}\r\n`);
          if (!res.ok && !data.continue_on_error) {
            throw new Error(result.detail || result.error || `Command failed (${res.status})`);
          }
          // ── Track CWD: parse 'cd <path>' commands ─────────────────────────
          // Only single-statement cd commands are tracked (not pipelines or semicolons).
          const cdMatch = commandText.trim().match(/^cd\s+(.+)$/);
          if (cdMatch) {
            const cdArg = cdMatch[1].trim();
            if (cdArg === "~" || cdArg === "") {
              trackedCwd = "$HOME";
            } else if (cdArg === "-") {
              // cd - (prev dir) — can't track reliably, reset to $HOME
              trackedCwd = "$HOME";
            } else if (cdArg === "..") {
              // Go up one level in trackedCwd
              const parts = trackedCwd.split("/").filter(Boolean);
              parts.pop();
              trackedCwd = parts.length === 0 ? "$HOME" : parts.join("/");
            } else if (cdArg.startsWith("/")) {
              // Absolute path
              trackedCwd = cdArg;
            } else if (cdArg.startsWith("~/")) {
              // ~/subdir → $HOME/subdir
              trackedCwd = `$HOME/${cdArg.slice(2)}`;
            } else if (cdArg.startsWith("$HOME")) {
              trackedCwd = cdArg;
            } else {
              // Relative path — append to current tracked CWD
              trackedCwd = `${trackedCwd}/${cdArg}`;
            }
          }
        } else if (node.type === "script") {
          const data = node.data as ScriptNodeData;
          const script = interpolate(data.script, vars);
          commandText = `bash <<'EOF'\n${script}\nEOF`;
          await sendToTerminal(`\x1b[32m${prompt}\x1b[0m \x1b[1mbash <<'EOF'\x1b[0m\r\n\x1b[2m${script}\x1b[0m\r\n\x1b[2mEOF\x1b[0m\r\n`);
          const tmpPath = `/tmp/wf_script_${execId}_${node.id}.sh`;
          const cdPrefix = trackedCwd === "$HOME" ? "" : `cd "${trackedCwd}" && `;
          const writeCmd = `cat > ${tmpPath} << 'WFEOF'\n${script}\nWFEOF\n${cdPrefix}chmod +x ${tmpPath} && bash ${tmpPath}; rm -f ${tmpPath}`;
          const res = await ipcFetch(execPath, {
            method: "POST",
            body: JSON.stringify({ command: writeCmd, timeout_sec: data.timeout || 600 }),
          });
          const result = await res.json();
          const _stdout = result.stdout || "";
          const _stderr = result.stderr || "";
          output = [_stdout, _stderr].filter((s) => s.trim()).join("\n");
          if (output) await sendToTerminal(`${output}\r\n`);
          if (!res.ok && !data.continue_on_error) {
            throw new Error(result.detail || result.error || `Script failed (${res.status})`);
          }
        } else if (node.type === "file_write") {
          const data = node.data as FileWriteNodeData;
          const content = interpolate(data.content, vars);
          const path = interpolate(data.remote_path, vars);
          const sudoPrefix = data.sudo ? "sudo " : "";
          commandText = `${sudoPrefix}tee ${path}`;
          await sendToTerminal(`\x1b[32m${prompt}\x1b[0m \x1b[1m${commandText}\x1b[0m\r\n`);
          const cdFilePrefix = trackedCwd === "$HOME" ? "" : `cd "${trackedCwd}" && `;
          const cmd = `${cdFilePrefix}${sudoPrefix}tee ${path} > /dev/null << 'WFFILEEOF'\n${content}\nWFFILEEOF`;
          const res = await ipcFetch(execPath, {
            method: "POST",
            body: JSON.stringify({ command: cmd, timeout_sec: 30 }),
          });
          const result = await res.json();
          const _stdout = result.stdout || "";
          const _stderr = result.stderr || "";
          output = [_stdout, _stderr].filter((s) => s.trim()).join("\n") || `Written to ${path}`;
          if (output) await sendToTerminal(`${output}\r\n`);
          if (!res.ok) throw new Error(result.detail || result.error || `File write failed (${res.status})`);
        } else if (node.type === "file_upload") {
          const data = node.data as FileUploadNodeData;
          const fileName = data.local_file_name || "file";
          // remote_path is optional — default to trackedCwd/filename
          // (trackedCwd reflects any preceding 'cd' commands in the workflow)
          const rawRemotePath = data.remote_path ? interpolate(data.remote_path, vars).trim() : "";
          // Expand leading ~/ or bare ~ → $HOME so bash handles it inside double-quoted strings.
          function expandTilde(p: string) {
            if (p === "~") return "$HOME";
            if (p.startsWith("~/")) return `$HOME/${p.slice(2)}`;
            return p;
          }
          // If no remote path configured, place the file in the tracked working directory.
          const remotePath = expandTilde(rawRemotePath || `${trackedCwd}/${fileName}`);
          commandText = `upload: ${fileName} → ${remotePath}`;

          // ── Validate inputs ──────────────────────────────────────────────────
          if (!data.local_file_id) {
            throw new Error("No file configured for this Upload File node. Open the node and select a file.");
          }

          // Read the stored file (prevents path traversal via path.basename)
          const uploadsDir = path.join(process.cwd(), ".workflow-uploads");
          const safeId = path.basename(data.local_file_id);
          const localFilePath = path.join(uploadsDir, safeId);
          if (!existsSync(localFilePath)) {
            throw new Error(`Uploaded file not found: ${fileName}. Re-open the node and re-select the file.`);
          }

          const { size: fileSize } = statSync(localFilePath);
          const fileSizeKB = (fileSize / 1024).toFixed(1);

          await sendToTerminal(`\x1b[32m${prompt}\x1b[0m \x1b[1mupload ${fileName} (${fileSizeKB} KB) \u2192 ${remotePath}\x1b[0m\r\n`);

          // ── SFTP pipelined upload (same technique as WinSCP) ─────────────────
          // Instead of the old base64-over-exec approach (thousands of SSH calls),
          // we call the IPC /upload-local endpoint which passes the local file path
          // directly to the SFTP pipelining layer — no HTTP overhead, no double
          // buffering, typically 10–50× faster for large archives.
          const uploadId = randomUUID();
          const conn = getIpcBase();
          if (!conn) throw new Error("MCP backend is not running");

          await sendToTerminal(`\x1b[2mStarting SFTP transfer (${fileSizeKB} KB)...\x1b[0m\r\n`);

          // Run the upload and the progress poller concurrently.
          let uploadDone = false;
          // eslint-disable-next-line prefer-const
          let uploadPayload: Record<string, unknown> = {};

          const doUpload = async () => {
            const res = await fetch(`${conn.url}${uploadPath}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-IPC-Token": conn.token },
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore – bypass Next.js fetch cache
              cache: "no-store",
              body: JSON.stringify({ local_path: localFilePath, remote_path: remotePath, upload_id: uploadId }),
            });
            uploadPayload = (await res.json()) as Record<string, unknown>;
            uploadDone = true;
          };

          const pollProgress = async () => {
            while (!uploadDone) {
              await new Promise<void>((r) => setTimeout(r, 1500));
              if (uploadDone) break;
              try {
                const pRes = await fetch(`${conn.url}/upload/${uploadId}/progress`, {
                  headers: { "X-IPC-Token": conn.token },
                  cache: "no-store",
                } as RequestInit);
                if (pRes.ok) {
                  const p = (await pRes.json()) as {
                    bytes_sent: number;
                    total_bytes: number;
                    throughput_kbps?: number;
                    done: boolean;
                  };
                  if (p.total_bytes > 0 && !p.done) {
                    const pct = Math.round((p.bytes_sent / p.total_bytes) * 100);
                    const sentMB = (p.bytes_sent / 1024 / 1024).toFixed(1);
                    const totalMB = (p.total_bytes / 1024 / 1024).toFixed(1);
                    const kbps = p.throughput_kbps ? ` @ ${Math.round(p.throughput_kbps)} KB/s` : "";
                    const filled = Math.floor(pct / 5);
                    const bar = "\u2588".repeat(filled) + "\u2591".repeat(20 - filled);
                    const progressText = `[${bar}] ${pct}%  ${sentMB} / ${totalMB} MB${kbps}`;
                    const idx = logs.findIndex((l) => l.node_id === node.id);
                    if (idx >= 0) {
                      logs[idx] = { ...logs[idx], output: progressText };
                      await prisma.workflowExecution.update({
                        where: { id: execId },
                        data: { logs: JSON.stringify(logs) },
                      });
                    }
                  }
                }
              } catch { /* poll errors are non-critical */ }
            }
          };

          await Promise.all([doUpload(), pollProgress()]);

          if (!uploadPayload.success) {
            throw new Error(
              (uploadPayload as { error?: string }).error || "SFTP upload failed"
            );
          }

          const elapsed = uploadPayload.elapsed_seconds as number | undefined;
          const kbps = uploadPayload.throughput_kbps as number | undefined;
          const speedInfo = elapsed && kbps ? ` in ${elapsed.toFixed(1)}s @ ${Math.round(kbps)} KB/s` : "";
          output = `Uploaded ${fileName} (${fileSizeKB} KB) \u2192 ${remotePath}${speedInfo}`;
          await sendToTerminal(`\x1b[32m\u2713 ${output}\x1b[0m\r\n`);

          // ── Auto-extract if configured ────────────────────────────────────────
          if (data.extract) {
            const rawExtractTo = data.extract_to
              ? interpolate(data.extract_to, vars)
              : remotePath.includes("/") ? remotePath.substring(0, remotePath.lastIndexOf("/")) : "$HOME";
            // Expand tilde in extract_to as well
            const extractTo = rawExtractTo.startsWith("~/") ? `$HOME/${rawExtractTo.slice(2)}` : rawExtractTo === "~" ? "$HOME" : rawExtractTo;
            const extractCmd = `tar -xzf "${remotePath}" -C "${extractTo}"`;
            commandText = extractCmd;
            await sendToTerminal(`\x1b[32m${prompt}\x1b[0m \x1b[1m${extractCmd}\x1b[0m\r\n`);
            const extRes = await ipcFetch(execPath, {
              method: "POST",
              body: JSON.stringify({ command: extractCmd, timeout_sec: 300 }),
            });
            const extResult = await extRes.json();
            const extOut = [extResult.stdout || "", extResult.stderr || ""].filter((s) => s.trim()).join("\n");
            if (extOut) await sendToTerminal(`${extOut}\r\n`);
            if (!extRes.ok || (extResult.exit_code !== undefined && extResult.exit_code !== 0)) {
              throw new Error(`Extraction failed: ${extResult.stderr || extResult.detail || `exit code ${extResult.exit_code}`}`);
            }
            output = `Uploaded and extracted to ${extractTo}`;
          }
        } else if (node.type === "delay") {
          const data = node.data as DelayNodeData;
          commandText = `sleep ${data.seconds}`;
          await sendToTerminal(`\x1b[32m${prompt}\x1b[0m \x1b[1m${commandText}\x1b[0m\r\n`);
          await new Promise((r) => setTimeout(r, data.seconds * 1000));
          output = `Waited ${data.seconds}s`;
        } else if (node.type === "variable") {
          const data = node.data as { key: string; value: string; label: string };
          vars[data.key] = interpolate(data.value, vars);
          commandText = `export ${data.key}="${vars[data.key]}"`;
          output = `Set ${data.key} = ${vars[data.key]}`;
          await sendToTerminal(`\x1b[32m${prompt}\x1b[0m \x1b[1m${commandText}\x1b[0m\r\n`);
        }

        const idx = logs.findIndex((l) => l.node_id === node.id);
        if (idx >= 0) {
          logs[idx] = { ...logs[idx], status: "success", completed_at: new Date().toISOString(), output, command_text: commandText };
          await prisma.workflowExecution.update({ where: { id: execId }, data: { logs: JSON.stringify(logs) } });
        }
      } catch (err) {
        const idx = logs.findIndex((l) => l.node_id === node.id);
        const errMsg = String(err);
        if (idx >= 0) {
          logs[idx] = { ...logs[idx], status: "failed", completed_at: new Date().toISOString(), error: errMsg };
          await prisma.workflowExecution.update({ where: { id: execId }, data: { logs: JSON.stringify(logs) } });
        }
        await sendToTerminal(`\x1b[31m\u2717 ${errMsg}\x1b[0m\r\n`);
        await prisma.workflowExecution.update({
          where: { id: execId },
          data: { status: "failed", error: errMsg, completed_at: new Date(), logs: JSON.stringify(logs) },
        });
        return;
      }
    }

    await prisma.workflowExecution.update({
      where: { id: execId },
      data: { status: "success", completed_at: new Date(), logs: JSON.stringify(logs) },
    });
    await sendToTerminal(`\r\n\x1b[32m\u2501\u2501\u2501 Workflow complete \u2501\u2501\u2501\x1b[0m\r\n`);
  } catch (err) {
    await prisma.workflowExecution.update({
      where: { id: execId },
      data: { status: "failed", error: String(err), completed_at: new Date(), logs: JSON.stringify(logs) },
    });
  }
}

function topoSort(nodes: WFNode[], edges: WFEdge[]): WFNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDeg = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map(nodes.map((n) => [n.id, [] as string[]]));

  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }

  const queue = nodes.filter((n) => (inDeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const result: WFNode[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) result.push(node);
    for (const next of adj.get(id) ?? []) {
      const deg = (inDeg.get(next) ?? 0) - 1;
      inDeg.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  return result;
}
