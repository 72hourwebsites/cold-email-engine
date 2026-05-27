"use client";

import { useState, useCallback } from "react";
import { CsvRow } from "@/lib/types";
import { getBestEmail } from "@/lib/leadrocks";
import { summarizeResults } from "@/lib/verification";

interface VerifyResult {
  email: string;
  rowIndex: number;
  status: "valid" | "invalid" | "disposable" | "unknown" | "accept_all" | "error";
  is_valid: boolean;
  is_catch_all?: boolean;
  is_role_account?: boolean;
}

interface Props {
  rows: CsvRow[];
  apiKey: string;
  mode: "quick" | "power";
  onComplete: (results: Map<number, VerifyResult>) => void;
}

function getEmailsToVerify(rows: CsvRow[]): Array<{ email: string; rowIndex: number; alreadyOk: boolean }> {
  return rows.map((row, i) => {
    const directOk = row["Direct Email #1 Status"] === "ok";
    const workOk = row["Work Email #1 Status"] === "ok";
    const email = getBestEmail(row);
    return { email, rowIndex: i, alreadyOk: directOk || workOk };
  }).filter(r => r.email);
}

export default function EmailVerifier({ rows, apiKey, mode, onComplete }: Props) {
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0, valid: 0, invalid: 0, skipped: 0, catchAll: 0 });
  const [results, setResults] = useState<Map<number, VerifyResult>>(new Map());
  const [strictMode, setStrictMode] = useState(false);

  const emailsToCheck = getEmailsToVerify(rows);
  const alreadyVerified = emailsToCheck.filter(e => e.alreadyOk).length;
  const needsVerification = emailsToCheck.filter(e => !e.alreadyOk).length;
  const noEmail = rows.length - emailsToCheck.length;

  const run = useCallback(async () => {
    if (!apiKey) { alert("Add your Reoon API key in Step 1 first"); return; }
    setStatus("running");

    const toVerify = emailsToCheck.filter(e => !e.alreadyOk);
    const newResults = new Map<number, VerifyResult>();

    emailsToCheck.filter(e => e.alreadyOk).forEach(e => {
      newResults.set(e.rowIndex, { email: e.email, rowIndex: e.rowIndex, status: "valid", is_valid: true });
    });

    let done = 0, valid = alreadyVerified, invalid = 0, catchAll = 0;
    setProgress({ done: 0, total: toVerify.length, valid: alreadyVerified, invalid: 0, catchAll: 0, skipped: noEmail });

    const CONCURRENCY = 5;
    const queue = [...toVerify];

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift()!;
        try {
          const res = await fetch("/api/verify-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: item.email, apiKey, mode }),
          });
          const data = await res.json();
          const result: VerifyResult = {
            email: item.email,
            rowIndex: item.rowIndex,
            status: data.status || "error",
            is_valid: data.is_valid ?? false,
            is_catch_all: data.is_catch_all ?? false,
            is_role_account: data.is_role_account ?? false,
          };
          newResults.set(item.rowIndex, result);
          if (result.is_catch_all) catchAll++;
          else if (result.is_valid) valid++;
          else invalid++;
        } catch {
          newResults.set(item.rowIndex, { email: item.email, rowIndex: item.rowIndex, status: "error", is_valid: false });
          invalid++;
        }
        done++;
        setProgress({ done, total: toVerify.length, valid, invalid, catchAll, skipped: noEmail });
        setResults(new Map(newResults));
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toVerify.length) }, worker));
    setStatus("done");
    onComplete(new Map(newResults));
  }, [apiKey, mode, emailsToCheck, alreadyVerified, noEmail, onComplete]);

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  // Post-run summary stats
  const doneResults = Array.from(results.values());
  const summary = doneResults.length ? summarizeResults(doneResults.map(r => ({
    email: r.email,
    status: r.is_catch_all ? "accept_all" : r.is_valid ? "safe" : "invalid",
    is_valid: r.is_valid,
    is_catch_all: r.is_catch_all,
    is_role_account: r.is_role_account,
  }))) : null;

  // Estimated bounce rate
  const usableCount = (summary ? summary.safe + summary.role : progress.valid);
  const totalChecked = progress.valid + progress.invalid + progress.catchAll;
  const estimatedBounce = summary && summary.total > 0
    ? Math.round(((summary.acceptAll * 0.25) / summary.total) * 100)
    : null;

  return (
    <div style={{ background: "#0a0a1a", border: "1px solid #1a1a3a", padding: "16px 20px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div>
          <div style={{ color: "#44aaff", fontSize: "12px", fontWeight: 500 }}>
            {mode === "power" ? "🔬 " : "📧 "}REOON EMAIL VERIFICATION
            {mode === "power" && <span style={{ color: "#44ff88", fontSize: "9px", marginLeft: "6px" }}>POWER MODE</span>}
          </div>
          <div style={{ color: "#2a2a5a", fontSize: "11px", marginTop: "2px" }}>
            {alreadyVerified} already verified · {needsVerification} need check · {noEmail} no email
            {progress.catchAll > 0 && <span style={{ color: "#ffaa44", marginLeft: "8px" }}>· ⚠ {progress.catchAll} catch-all</span>}
          </div>
        </div>
        {status === "idle" && needsVerification > 0 && (
          <button
            onClick={run}
            disabled={!apiKey}
            style={{
              background: apiKey ? "#0a0a1a" : "#080808",
              color: apiKey ? "#44aaff" : "#2a2a4a",
              border: `1px solid ${apiKey ? "#1a1a5a" : "#111"}`,
              padding: "8px 18px", fontSize: "11px", letterSpacing: "0.5px",
              cursor: apiKey ? "pointer" : "not-allowed",
            }}
          >
            {apiKey ? `⚡ VERIFY ${needsVerification} EMAILS` : "ADD API KEY IN STEP 1"}
          </button>
        )}
        {status === "done" && (
          <span style={{ color: "#44ff88", fontSize: "11px" }}>✓ COMPLETE</span>
        )}
      </div>

      {/* Progress */}
      {status === "running" && (
        <div style={{ marginTop: "8px" }}>
          <div style={{ background: "#111", height: "3px", borderRadius: "2px", marginBottom: "6px" }}>
            <div style={{ background: "#44aaff", height: "100%", width: `${pct}%`, transition: "width 0.3s", borderRadius: "2px" }} />
          </div>
          <div style={{ fontSize: "11px", color: "#3a3a7a" }}>
            {progress.done}/{progress.total} checked · ✓ {progress.valid} valid · ⚠ {progress.catchAll} catch-all · ✗ {progress.invalid} invalid
          </div>
        </div>
      )}

      {/* Results summary */}
      {status === "done" && summary && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginTop: "8px" }}>
            {[
              { label: "SAFE", value: summary.safe, color: "#44ff88" },
              { label: "ROLE", value: summary.role, color: "#88ccff" },
              { label: "CATCH-ALL", value: summary.acceptAll, color: "#ffaa44" },
              { label: "REJECTED", value: summary.rejected, color: "#ff3b3b" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#080808", padding: "8px 12px" }}>
                <div style={{ fontSize: "9px", color: "#444", letterSpacing: "1px" }}>{s.label}</div>
                <div style={{ fontSize: "18px", fontWeight: 800, color: s.color, fontFamily: "Syne, sans-serif" }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Catch-all warning */}
          {summary.acceptAll > 0 && (
            <div style={{
              marginTop: "10px",
              padding: "10px 14px",
              background: "#1a1400",
              border: "1px solid #3a2a00",
              borderRadius: "3px",
              fontSize: "11px",
              color: "#ccaa44",
            }}>
              <strong>⚠ {summary.acceptAll} catch-all addresses detected</strong>
              <div style={{ color: "#776633", marginTop: "4px" }}>
                Catch-all domains accept mail for any address — these have ~25% bounce risk.
                Estimated overall bounce rate: <strong style={{ color: "#ffaa44" }}>~{estimatedBounce}%</strong>
                {mode === "quick" && (
                  <span style={{ display: "block", marginTop: "4px", color: "#ff6644" }}>
                    Switch to Power Mode (Step 1 config) for accurate per-inbox verification.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Usable count + strictness toggle */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px" }}>
            <div style={{ fontSize: "11px", color: "#444" }}>
              Usable: <span style={{ color: "#44aaff", fontWeight: 600 }}>{usableCount}</span> of {summary.total}
              {summary.acceptAll > 0 && (
                <span style={{ color: "#ffaa44", marginLeft: "8px" }}>
                  · {summary.acceptAll} risky (catch-all)
                </span>
              )}
            </div>
            <label style={{ fontSize: "11px", color: "#555", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="checkbox"
                checked={strictMode}
                onChange={e => setStrictMode(e.target.checked)}
                style={{ accentColor: "#44aaff" }}
              />
              Strict mode (reject role accounts)
            </label>
          </div>
        </>
      )}
    </div>
  );
}
