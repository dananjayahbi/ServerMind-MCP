import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

// POST /api/local-exec
// Runs a command on the local machine (where the Next.js server is running).
// Used by the "Local Build" workflow node.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { command, working_directory, timeout_sec = 300 } = body as {
    command: string;
    working_directory?: string;
    timeout_sec?: number;
  };

  if (!command || typeof command !== "string" || !command.trim()) {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  // Resolve working directory safely
  let cwd: string | undefined;
  if (working_directory?.trim()) {
    // Prevent path traversal by resolving and then accepting as-is (user-configured)
    cwd = path.resolve(working_directory.trim());
  }

  const isWindows = process.platform === "win32";
  const [shell, shellFlag] = isWindows ? ["cmd.exe", "/c"] : ["/bin/sh", "-c"];

  return new Promise<NextResponse>((resolve) => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let timedOut = false;

    const child = spawn(shell, [shellFlag, command], {
      cwd,
      shell: false,
      env: { ...process.env },
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeout_sec * 1000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString());
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = stdoutChunks.join("");
      const stderr = stderrChunks.join("");
      if (timedOut) {
        resolve(
          NextResponse.json(
            { error: `Command timed out after ${timeout_sec}s`, stdout, stderr },
            { status: 504 }
          )
        );
        return;
      }
      if (code !== 0) {
        resolve(
          NextResponse.json(
            { error: `Process exited with code ${code}`, stdout, stderr, exit_code: code },
            { status: 422 }
          )
        );
        return;
      }
      resolve(NextResponse.json({ stdout, stderr, exit_code: 0 }));
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve(
        NextResponse.json(
          { error: err.message, stdout: "", stderr: "" },
          { status: 500 }
        )
      );
    });
  });
}
