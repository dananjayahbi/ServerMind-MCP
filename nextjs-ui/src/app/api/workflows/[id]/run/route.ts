import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ipcFetch } from "@/lib/ipc-client";
import type { WFNode, WFEdge, WFNodeLog, CommandNodeData, ScriptNodeData, FileWriteNodeData, DelayNodeData } from "@/types/workflow";

function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// POST /api/workflows/[id]/run
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { variables: inputVars = {}, profile_id } = body as {
    variables: Record<string, string>;
    profile_id?: string;
  };

  const wf = await prisma.workflow.findUnique({ where: { id } });
  if (!wf) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

  const nodes: WFNode[] = JSON.parse(wf.nodes);
  const edges: WFEdge[] = JSON.parse(wf.edges);

  // Create execution record
  const execution = await prisma.workflowExecution.create({
    data: {
      workflow_id: id,
      profile_id: profile_id || null,
      status: "running",
      variables: JSON.stringify(inputVars),
      logs: "[]",
    },
  });

  // Run in background
  runWorkflow(execution.id, nodes, edges, inputVars).catch(console.error);

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
  vars: Record<string, string>
) {
  const logs: WFNodeLog[] = [];

  async function appendLog(log: WFNodeLog) {
    logs.push(log);
    await prisma.workflowExecution.update({
      where: { id: execId },
      data: { logs: JSON.stringify(logs) },
    });
  }

  // Topological sort: find execution order
  const ordered = topoSort(nodes, edges);

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

        if (node.type === "command") {
          const data = node.data as CommandNodeData;
          const cmd = interpolate(data.command, vars);
          const res = await ipcFetch("/exec", {
            method: "POST",
            body: JSON.stringify({ command: cmd, timeout: data.timeout || 300 }),
          });
          const result = await res.json();
          output = result.output || result.stdout || "";
          if (!res.ok && !data.continue_on_error) {
            throw new Error(result.detail || result.error || `Command failed (${res.status})`);
          }
        } else if (node.type === "script") {
          const data = node.data as ScriptNodeData;
          const script = interpolate(data.script, vars);
          const tmpPath = `/tmp/wf_script_${execId}_${node.id}.sh`;
          // Write script then execute
          const writeCmd = `cat > ${tmpPath} << 'WFEOF'\n${script}\nWFEOF\nchmod +x ${tmpPath} && bash ${tmpPath}; rm -f ${tmpPath}`;
          const res = await ipcFetch("/exec", {
            method: "POST",
            body: JSON.stringify({ command: writeCmd, timeout: data.timeout || 600 }),
          });
          const result = await res.json();
          output = result.output || result.stdout || "";
          if (!res.ok && !data.continue_on_error) {
            throw new Error(result.detail || result.error || `Script failed (${res.status})`);
          }
        } else if (node.type === "file_write") {
          const data = node.data as FileWriteNodeData;
          const content = interpolate(data.content, vars);
          const path = interpolate(data.remote_path, vars);
          const sudoPrefix = data.sudo ? "sudo " : "";
          // Use tee for sudo-capable file writes
          const cmd = `${sudoPrefix}tee ${path} > /dev/null << 'WFFILEEOF'\n${content}\nWFFILEEOF`;
          const res = await ipcFetch("/exec", {
            method: "POST",
            body: JSON.stringify({ command: cmd, timeout: 30 }),
          });
          const result = await res.json();
          output = result.output || result.stdout || `Written to ${path}`;
          if (!res.ok) throw new Error(result.detail || result.error || `File write failed (${res.status})`);
        } else if (node.type === "delay") {
          const data = node.data as DelayNodeData;
          await new Promise((r) => setTimeout(r, data.seconds * 1000));
          output = `Waited ${data.seconds}s`;
        } else if (node.type === "variable") {
          const data = node.data as { key: string; value: string; label: string };
          vars[data.key] = interpolate(data.value, vars);
          output = `Set ${data.key} = ${vars[data.key]}`;
        }

        const idx = logs.findIndex((l) => l.node_id === node.id);
        if (idx >= 0) {
          logs[idx] = { ...logs[idx], status: "success", completed_at: new Date().toISOString(), output };
          await prisma.workflowExecution.update({ where: { id: execId }, data: { logs: JSON.stringify(logs) } });
        }
      } catch (err) {
        const idx = logs.findIndex((l) => l.node_id === node.id);
        const errMsg = String(err);
        if (idx >= 0) {
          logs[idx] = { ...logs[idx], status: "failed", completed_at: new Date().toISOString(), error: errMsg };
          await prisma.workflowExecution.update({ where: { id: execId }, data: { logs: JSON.stringify(logs) } });
        }
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
