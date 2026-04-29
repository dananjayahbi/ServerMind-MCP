import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { WFNode, WFEdge, WFVariableDef } from "@/types/workflow";

// GET /api/workflows/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wf = await prisma.workflow.findUnique({ where: { id } });
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
  });
}

// PUT /api/workflows/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { name, description, nodes, edges, variables, tags } = body as {
    name?: string;
    description?: string;
    nodes?: WFNode[];
    edges?: WFEdge[];
    variables?: WFVariableDef[];
    tags?: string[];
  };

  try {
    const wf = await prisma.workflow.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description }),
        ...(nodes !== undefined && { nodes: JSON.stringify(nodes) }),
        ...(edges !== undefined && { edges: JSON.stringify(edges) }),
        ...(variables !== undefined && { variables: JSON.stringify(variables) }),
        ...(tags !== undefined && { tags: JSON.stringify(tags) }),
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
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

// DELETE /api/workflows/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.workflow.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
