import { NextRequest, NextResponse } from "next/server";
import { existsSync, statSync } from "fs";
import path from "path";

// GET /api/workflows/validate-local-path?path=<encoded-path>
// Checks whether a file exists at the given local path.
// Used by the "Local Path Upload" node for pre-execution validation.
export async function GET(req: NextRequest) {
  const rawPath = req.nextUrl.searchParams.get("path");
  if (!rawPath || !rawPath.trim()) {
    return NextResponse.json(
      { exists: false, error: "path parameter is required" },
      { status: 400 }
    );
  }

  // Resolve the path (handles relative paths relative to cwd)
  const resolvedPath = path.resolve(rawPath.trim());

  try {
    const exists = existsSync(resolvedPath);
    if (!exists) {
      return NextResponse.json({ exists: false, path: resolvedPath });
    }
    const stat = statSync(resolvedPath);
    return NextResponse.json({
      exists: true,
      is_file: stat.isFile(),
      size_bytes: stat.size,
      path: resolvedPath,
    });
  } catch (err) {
    return NextResponse.json(
      { exists: false, error: String(err) },
      { status: 500 }
    );
  }
}
