import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

const ALLOWED_DIR = process.env.CSV_DIR || join(process.env.USERPROFILE || "C:/Users/aml25", "Downloads");

export async function GET() {
  // List CSV files available to load
  try {
    const files = await readdir(ALLOWED_DIR);
    const csvFiles = files
      .filter(f => f.toLowerCase().endsWith(".csv"))
      .map(f => ({ name: f, dir: ALLOWED_DIR }));
    return NextResponse.json({ files: csvFiles, dir: ALLOWED_DIR });
  } catch {
    return NextResponse.json({ files: [], dir: ALLOWED_DIR });
  }
}

export async function POST(req: NextRequest) {
  // Load a specific CSV file by name
  try {
    const { filename } = await req.json();
    if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({ error: "invalid filename" }, { status: 400 });
    }
    const filePath = join(ALLOWED_DIR, filename);
    const content = await readFile(filePath, "utf-8");
    return new NextResponse(content, {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
