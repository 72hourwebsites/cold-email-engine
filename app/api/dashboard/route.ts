import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_FILE = path.join(process.cwd(), "dashboard-state.json");

export async function GET() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return NextResponse.json({ scoreboard: null, metrics: null });
    }
    const data = fs.readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(data);
    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json({ scoreboard: null, metrics: null, error: String(err) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Validate basic shape
    if (body.scoreboard) {
      // Write to state file
      fs.writeFileSync(STATE_FILE, JSON.stringify(body, null, 2), "utf-8");
      return NextResponse.json({ saved: true });
    }
    return NextResponse.json({ error: "Invalid payload — expected { scoreboard }" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
