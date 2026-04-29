import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/workflows/executions/[execId]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ execId: string }> }) {
  const { execId } = await params;
  const ex = await prisma.workflowExecution.findUnique({ where: { id: execId } });
  if (!ex) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: ex.id,
    workflow_id: ex.workflow_id,
    profile_id: ex.profile_id,
    status: ex.status,
    variables: JSON.parse(ex.variables),
    logs: JSON.parse(ex.logs),
    error: ex.error,
    started_at: ex.started_at.toISOString(),
    completed_at: ex.completed_at?.toISOString() || null,
  });
}

// DELETE /api/workflows/executions/[execId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ execId: string }> }) {
  const { execId } = await params;
  try {
    await prisma.workflowExecution.delete({ where: { id: execId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
