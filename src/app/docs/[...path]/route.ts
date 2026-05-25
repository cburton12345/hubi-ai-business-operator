import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: pathParts } = await params;
  const fileName = pathParts.join("/");

  if (!fileName.endsWith(".md") || fileName.includes("..")) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const docsRoot = path.join(process.cwd(), "docs");
  const filePath = path.resolve(docsRoot, fileName);

  if (!filePath.startsWith(docsRoot)) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  try {
    const content = await readFile(filePath, "utf8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
}
