import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { config } = await req.json();
    const res = await fetch(`${config.baseUrl}/models`, {
      headers: { Authorization: "Bearer lm-studio" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return NextResponse.json({ online: false });
    const data = await res.json();
    const models = data.data?.map((m: { id: string }) => m.id) || [];
    return NextResponse.json({ online: true, models });
  } catch {
    return NextResponse.json({ online: false });
  }
}
