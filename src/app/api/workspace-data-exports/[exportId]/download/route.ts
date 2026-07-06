import { NextResponse } from "next/server";
import { getWorkspaceDataExportDetail } from "@/lib/exports/workspace-data-exports";

export async function GET(_request: Request, { params }: { params: Promise<{ exportId: string }> }) {
  const { exportId } = await params;
  const exportPackage = await getWorkspaceDataExportDetail(exportId);

  if (!exportPackage) {
    return NextResponse.json({ error: "Export package not found." }, { status: 404 });
  }

  const generatedAt = new Date(exportPackage.requestedAt).toISOString().slice(0, 10);
  const fileName = `ferocity-workspace-backup-${generatedAt}-${exportPackage.id}.json`;

  return new Response(JSON.stringify(exportPackage.packageJson, null, 2), {
    headers: {
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store"
    }
  });
}
