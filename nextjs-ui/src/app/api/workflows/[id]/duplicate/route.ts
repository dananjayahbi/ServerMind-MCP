import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/workflows/[id]/duplicate
// Creates a copy of the workflow with "(Copy)" appended to its name.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const source = await prisma.workflow.findUnique({ where: { id } });
  if (!source) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const copy = await prisma.workflow.create({
    data: {
      name: `${source.name} (Copy)`,
      description: source.description,
      nodes: source.nodes,
      edges: source.edges,
      variables: source.variables,
      tags: source.tags,
    },
  });

  return NextResponse.json(
    {
      id: copy.id,
      name: copy.name,
      description: copy.description,
      tags: copy.tags ? JSON.parse(copy.tags) : [],
      nodeCount: JSON.parse(copy.nodes).length,
      created_at: copy.created_at.toISOString(),
      updated_at: copy.updated_at.toISOString(),
    },
    { status: 201 }
  );
}
