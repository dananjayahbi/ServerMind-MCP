import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const UPLOADS_DIR = path.join(process.cwd(), ".workflow-uploads");

async function ensureDir() {
  if (!existsSync(UPLOADS_DIR)) {
    await mkdir(UPLOADS_DIR, { recursive: true });
  }
}

// POST /api/workflows/upload-file — store a file for use in a workflow node
export async function POST(req: NextRequest) {
  try {
    await ensureDir();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Sanitize filename and build unique storage key
    const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileId = `${randomUUID()}_${safeName}`;
    const filePath = path.join(UPLOADS_DIR, fileId);

    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    return NextResponse.json({
      file_id: fileId,
      file_name: file.name,
      size: file.size,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/workflows/upload-file?file_id=xxx — remove a stored file
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("file_id");
    if (!fileId) {
      return NextResponse.json({ error: "file_id required" }, { status: 400 });
    }
    // Prevent path traversal: only basename is allowed
    const safeName = path.basename(fileId);
    const filePath = path.join(UPLOADS_DIR, safeName);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
