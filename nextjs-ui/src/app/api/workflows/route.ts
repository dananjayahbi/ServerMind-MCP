import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { WFNode, WFEdge, WFVariableDef } from "@/types/workflow";

// GET /api/workflows — list all workflows
export async function GET() {
  const rows = await prisma.workflow.findMany({
    orderBy: { updated_at: "desc" },
  });

  const summaries = rows.map((r) => {
    let nodeCount = 0;
    try { nodeCount = (JSON.parse(r.nodes) as WFNode[]).length; } catch {}
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      tags: r.tags ? JSON.parse(r.tags) : [],
      nodeCount,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
    };
  });

  return NextResponse.json(summaries);
}

// POST /api/workflows — create a new workflow
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, description, nodes, edges, variables, tags } = body as {
    name: string;
    description?: string;
    nodes: WFNode[];
    edges: WFEdge[];
    variables: WFVariableDef[];
    tags?: string[];
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const wf = await prisma.workflow.create({
    data: {
      name: name.trim(),
      description: description || null,
      nodes: JSON.stringify(nodes ?? []),
      edges: JSON.stringify(edges ?? []),
      variables: JSON.stringify(variables ?? []),
      tags: tags ? JSON.stringify(tags) : null,
    },
  });

  return NextResponse.json({
    id: wf.id,
    name: wf.name,
    description: wf.description,
    nodes: JSON.parse(wf.nodes),
    edges: JSON.parse(wf.edges),
    variables: JSON.parse(wf.variables),
    tags: wf.tags ? JSON.parse(wf.tags) : [],
    created_at: wf.created_at.toISOString(),
    updated_at: wf.updated_at.toISOString(),
  }, { status: 201 });
}
