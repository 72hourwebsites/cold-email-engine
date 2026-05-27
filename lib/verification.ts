/**
 * Email verification & filtering logic for Reoon Power Mode.
 *
 * Reoon Power Mode returns these statuses:
 *   Safe          — Inbox exists and is accepting mail  ✓
 *   Role          — Inbox is a role account (info@, etc.)  ⚠ usually OK
 *   Accept All    — Domain accepts all emails (catch-all)  ⚠ risky
 *   Invalid       — Inbox does not exist  ✗
 *   Spamtrap      — Email is a known spam trap  ✗
 *   Disposable    — Temporary/disposable address  ✗
 *   Unknown       — Could not determine  ⚠
 */

export interface VerificationResult {
  email: string;
  status: "safe" | "role" | "accept_all" | "invalid" | "spamtrap" | "disposable" | "unknown" | "api_error";
  is_valid: boolean;
  is_catch_all?: boolean;
  is_role_account?: boolean;
  is_disposable?: boolean;
  error?: string;
}

export type VerificationStrictness = "standard" | "strict";

export interface VerificationSummary {
  total: number;
  safe: number;
  role: number;
  acceptAll: number;
  invalid: number;
  spamtrap: number;
  disposable: number;
  unknown: number;
  apiErrors: number;
  usable: number;
  risky: number;
  rejected: number;
}

/**
 * Classify a single verification result.
 * Returns the email's verdict for QA display.
 */
export function classifyResult(result: VerificationResult, strictness: VerificationStrictness): {
  usable: boolean;
  risk: "safe" | "risky" | "rejected";
  label: string;
} {
  switch (result.status) {
    case "safe":
      return { usable: true, risk: "safe", label: "Safe" };
    case "role":
      return {
        usable: strictness === "standard",
        risk: strictness === "standard" ? "safe" : "risky",
        label: "Role",
      };
    case "accept_all":
      return {
        usable: false,
        risk: "risky",
        label: "Catch-All",
      };
    case "invalid":
      return { usable: false, risk: "rejected", label: "Invalid" };
    case "spamtrap":
      return { usable: false, risk: "rejected", label: "Spamtrap" };
    case "disposable":
      return { usable: false, risk: "rejected", label: "Disposable" };
    case "unknown":
      return { usable: false, risk: "risky", label: "Unknown" };
    case "api_error":
      return { usable: false, risk: "rejected", label: "API Error" };
    default:
      return { usable: false, risk: "rejected", label: "Unknown" };
  }
}

/**
 * Filter verified emails based on strictness.
 * Returns separate arrays for each disposition.
 */
export function filterEmails(
  results: VerificationResult[],
  strictness: VerificationStrictness,
  includeCatchAll: boolean,
): {
  valid: VerificationResult[];
  catchAll: VerificationResult[];
  rejected: VerificationResult[];
} {
  const valid: VerificationResult[] = [];
  const catchAll: VerificationResult[] = [];
  const rejected: VerificationResult[] = [];

  for (const result of results) {
    const verdict = classifyResult(result, strictness);

    if (verdict.usable) {
      valid.push(result);
    } else if (verdict.risk === "risky" && includeCatchAll) {
      catchAll.push(result);
    } else {
      rejected.push(result);
    }
  }

  return { valid, catchAll, rejected };
}

/**
 * Summarize a set of verification results into counts.
 */
export function summarizeResults(results: VerificationResult[]): VerificationSummary {
  const summary: VerificationSummary = {
    total: results.length,
    safe: 0,
    role: 0,
    acceptAll: 0,
    invalid: 0,
    spamtrap: 0,
    disposable: 0,
    unknown: 0,
    apiErrors: 0,
    usable: 0,
    risky: 0,
    rejected: 0,
  };

  for (const r of results) {
    switch (r.status) {
      case "safe":
        summary.safe++;
        summary.usable++;
        break;
      case "role":
        summary.role++;
        summary.usable++;
        break;
      case "accept_all":
        summary.acceptAll++;
        summary.risky++;
        break;
      case "invalid":
        summary.invalid++;
        summary.rejected++;
        break;
      case "spamtrap":
        summary.spamtrap++;
        summary.rejected++;
        break;
      case "disposable":
        summary.disposable++;
        summary.rejected++;
        break;
      case "unknown":
        summary.unknown++;
        summary.risky++;
        break;
      case "api_error":
        summary.apiErrors++;
        summary.rejected++;
        break;
    }
  }

  return summary;
}

/**
 * Estimate bounce risk based on verification results.
 * Returns a percentage estimate and a confidence label.
 */
export function estimateBounceRisk(summary: VerificationSummary): {
  estimatedBounceRate: number;
  confidence: "high" | "medium" | "low";
} {
  if (summary.total === 0) {
    return { estimatedBounceRate: 0, confidence: "low" };
  }

  // Safe + Role emails have <2% bounce rate with Power Mode
  // Catch-all emails have 15-40% bounce rate
  // Invalid/spamtrap/disposable have 80-100% bounce rate
  const safeEstimate = 0.02;
  const roleEstimate = 0.03;
  const catchAllEstimate = 0.25;
  const rejectedEstimate = 0.95;

  const totalEmails = summary.total;
  let bounceSum = 0;

  bounceSum += summary.safe * safeEstimate;
  bounceSum += summary.role * roleEstimate;
  bounceSum += summary.acceptAll * catchAllEstimate;
  bounceSum += (summary.invalid + summary.spamtrap + summary.disposable) * rejectedEstimate;
  bounceSum += summary.unknown * 0.15;

  const rate = bounceSum / totalEmails;

  return {
    estimatedBounceRate: Math.round(rate * 1000) / 10, // one decimal
    confidence: totalEmails > 200 ? "high" : totalEmails > 50 ? "medium" : "low",
  };
}

/**
 * Map a raw Reoon API response to our normalized VerificationResult.
 */
export function fromReoonResponse(raw: {
  email: string;
  status?: string;
  is_valid?: boolean;
  is_catch_all?: boolean;
  is_role_account?: boolean;
  is_disposable?: boolean;
  error?: string;
}): VerificationResult {
  const statusMap: Record<string, string> = {
    valid: "safe",
    safe: "safe",
    role: "role",
    accept_all: "accept_all",
    "accept all": "accept_all",
    catchall: "accept_all",
    "catch-all": "accept_all",
    catch_all: "accept_all",
    invalid: "invalid",
    unknown: "unknown",
  };

  let status: VerificationResult["status"] = statusMap[raw.status?.toLowerCase() || ""] as VerificationResult["status"];

  // Fallback logic if status isn't directly mapped
  if (!status) {
    if (raw.is_valid === true) status = "safe";
    else if (raw.is_catch_all) status = "accept_all";
    else if (raw.is_disposable) status = "disposable";
    else if (raw.error) status = "api_error";
    else status = raw.status === "spamtrap" ? "spamtrap" : "unknown";
  }

  if (raw.error) status = "api_error";

  return {
    email: raw.email,
    status,
    is_valid: raw.is_valid ?? false,
    is_catch_all: raw.is_catch_all ?? false,
    is_role_account: raw.is_role_account ?? false,
    is_disposable: raw.is_disposable ?? false,
    error: raw.error,
  };
}

/**
 * Batch verify and filter: takes emails → calls verify endpoint → returns filtered results.
 * Useful for the batch pipeline scripts.
 */
export async function batchVerify(
  emails: string[],
  apiKey: string,
  mode: "quick" | "power" = "power",
  strictness: VerificationStrictness = "standard",
  includeCatchAll: boolean = false,
): Promise<{
  results: VerificationResult[];
  summary: VerificationSummary;
  valid: VerificationResult[];
  rejected: VerificationResult[];
}> {
  const results: VerificationResult[] = [];

  for (const email of emails) {
    try {
      const res = await fetch(
        `https://emailverifier.reoon.com/api/v1/verify?email=${encodeURIComponent(email)}&key=***&mode=${mode}`,
        { signal: AbortSignal.timeout(20_000) },
      );
      if (!res.ok) {
        results.push({ email, status: "api_error", is_valid: false, error: `HTTP ${res.status}` });
        continue;
      }
      const data = await res.json();
      results.push(fromReoonResponse({ email, ...data }));
    } catch (e: unknown) {
      results.push({ email, status: "api_error", is_valid: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const summary = summarizeResults(results);
  const { valid, rejected } = filterEmails(results, strictness, includeCatchAll);

  return { results, summary, valid, rejected };
}
