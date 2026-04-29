import { NextResponse } from "next/server";
import { WORKFLOW_TEMPLATES } from "@/lib/workflow-templates";

// GET /api/workflows/templates — list built-in templates
export async function GET() {
  const summaries = WORKFLOW_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    tags: t.tags,
    nodeCount: t.nodes.length,
    nodes: t.nodes,
    edges: t.edges,
    variables: t.variables,
  }));
  return NextResponse.json(summaries);
}
