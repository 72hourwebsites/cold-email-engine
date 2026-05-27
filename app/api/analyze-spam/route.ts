import { NextRequest, NextResponse } from "next/server";
import { analyzeSpamScore } from "@/lib/spam-analyzer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject, emails } = body;

    // Single email mode
    if (subject !== undefined) {
      const result = analyzeSpamScore(subject, emails?.body || "");
      return NextResponse.json(result);
    }

    // Batch mode
    if (Array.isArray(emails)) {
      const results = emails.map((e: { subject?: string; body?: string }) =>
        analyzeSpamScore(e.subject || "", e.body || "")
      );
      const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
      const highRisk = results.filter(r => r.verdict === "high_risk").length;
      const risky = results.filter(r => r.verdict === "risky").length;
      return NextResponse.json({
        results,
        summary: {
          total: results.length,
          avgScore: Math.round(avgScore * 10) / 10,
          highRisk,
          risky,
          safe: results.length - highRisk - risky,
        },
      });
    }

    return NextResponse.json({ error: "Send {subject, body} or {emails: []}" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
