import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const statePath = path.join(process.cwd(), "dashboard-state.json");
    if (!fs.existsSync(statePath)) {
      return NextResponse.json({ error: "No dashboard data yet. Import a campaign first." }, { status: 404 });
    }

    const raw = fs.readFileSync(statePath, "utf-8");
    const state = JSON.parse(raw);

    // The dashboard state stores per-variant metrics in the scoreboard
    const { generateLessonsLearned } = await import("@/lib/ab-testing");

    // Transform scoreboard entries into VariantStat format
    const scoreboard = state.scoreboard || [];
    const allVariants = scoreboard
      .filter((entry: { sampleSize?: number }) => (entry.sampleSize || 0) > 0)
      .map((entry: { step?: string; variant?: string; sampleSize?: number; replyRate?: number; openRate?: number; bounceRate?: number; compositeScore?: number; opens?: number; bounces?: number; replies?: number }) => ({
        variant: entry.variant || "A",
        step: entry.step || "step1",
        sampleSize: entry.sampleSize || 0,
        replies: entry.replies || Math.round((entry.replyRate || 0) * (entry.sampleSize || 0)),
        replyRate: entry.replyRate || 0,
        opens: entry.opens || Math.round((entry.openRate || 0) * (entry.sampleSize || 0)),
        openRate: entry.openRate || 0,
        bounces: entry.bounces || Math.round((entry.bounceRate || 0) * (entry.sampleSize || 0)),
        bounceRate: entry.bounceRate || 0,
        compositeScore: entry.compositeScore || 0,
      }));

    if (allVariants.length < 2) {
      return NextResponse.json({
        overview: "Insufficient data for meaningful analysis.",
        perStepResults: [],
        topSubjectStyles: [],
        topOpeningStyles: [],
        topCtaTypes: [],
        topToneStyles: [],
        recommendations: ["Need at least 2 variants with data to run analysis."],
        generatedAt: new Date().toISOString(),
        rawVariants: allVariants,
      });
    }

    const lessons = generateLessonsLearned(allVariants);

    return NextResponse.json(lessons);
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
