import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export interface ReoonResult {
  email: string;
  status: "valid" | "invalid" | "disposable" | "unknown" | "spamtrap" | "accept_all" | "error";
  is_valid: boolean;
  is_disposable: boolean;
  is_role_account: boolean;
  account: string;
  domain: string;
  mx_records?: string[];
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { email, apiKey, mode = "quick" } = await req.json();

    if (!email || !apiKey) {
      return NextResponse.json({ error: "email and apiKey required" }, { status: 400 });
    }

    const url = `https://emailverifier.reoon.com/api/v1/verify?email=${encodeURIComponent(email)}&key=${encodeURIComponent(apiKey)}&mode=${mode}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Reoon ${res.status}: ${text.slice(0, 100)}` }, { status: 500 });
    }

    const data: ReoonResult = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Bulk verify — runs multiple emails concurrently
export async function PUT(req: NextRequest) {
  try {
    const { emails, apiKey, mode = "quick", concurrency = 5 } = await req.json();

    if (!emails?.length || !apiKey) {
      return NextResponse.json({ error: "emails array and apiKey required" }, { status: 400 });
    }

    const results: Record<string, ReoonResult | { error: string }> = {};
    const queue = [...emails];

    async function verifyOne(email: string) {
      try {
        const url = `https://emailverifier.reoon.com/api/v1/verify?email=${encodeURIComponent(email)}&key=${encodeURIComponent(apiKey)}&mode=${mode}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) { results[email] = { error: `HTTP ${res.status}` }; return; }
        results[email] = await res.json();
      } catch (e: unknown) {
        results[email] = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length > 0) {
        const email = queue.shift()!;
        await verifyOne(email);
      }
    });

    await Promise.all(workers);
    return NextResponse.json({ results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
