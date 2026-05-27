import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { emails } = await req.json();
    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: "emails array required" }, { status: 400 });
    }

    // Dynamic import to avoid client-side issues
    const { assignAllVariants, assignmentsToCSV } = await import("@/lib/ab-testing");

    const assignments = assignAllVariants(emails);
    const csv = assignmentsToCSV(assignments);

    // Summary stats
    const variantCounts: Record<string, Record<string, number>> = {
      step1: { A: 0, B: 0, C: 0, D: 0, E: 0 },
      step2: { A: 0, B: 0, C: 0, D: 0, E: 0 },
      step3: { A: 0, B: 0, C: 0, D: 0, E: 0 },
      step4: { A: 0, B: 0, C: 0, D: 0, E: 0 },
    };
    for (const a of assignments) {
      variantCounts.step1[a.step1Variant]++;
      variantCounts.step2[a.step2Variant]++;
      variantCounts.step3[a.step3Variant]++;
      variantCounts.step4[a.step4Variant]++;
    }

    return NextResponse.json({
      total: assignments.length,
      assignments: assignments.map(a => ({
        email: a.email,
        step1Variant: a.step1Variant,
        step2Variant: a.step2Variant,
        step3Variant: a.step3Variant,
        step4Variant: a.step4Variant,
        step1Config: a.step1Config,
        step2Config: a.step2Config,
        step3Config: a.step3Config,
        step4Config: a.step4Config,
      })),
      csv,
      variantCounts,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
