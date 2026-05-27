"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  LMConfig, DEFAULT_LM_CONFIG,
  CsvRow, FieldMapping, GeneratedEmail, GenerationState,
  SequenceTemplates,
} from "@/lib/types";
import { getServiceTemplates, buildPrompt } from "@/lib/prompt";
import { autoMapColumns } from "@/lib/automap";
import { isOutscraperCsv, detectBusinessCategory } from "@/lib/outscraper";
import { isLeadRocksCsv, getBestEmail } from "@/lib/leadrocks";
import ConfigPanel from "@/components/ConfigPanel";
import CsvUpload from "@/components/CsvUpload";
import FieldMapper from "@/components/FieldMapper";
import PromptBuilder from "@/components/PromptBuilder";
import GenerationPanel from "@/components/GenerationPanel";
import DashboardPanel from "@/components/DashboardPanel";
import ABTestPanel from "@/components/ABTestPanel";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const STEP_LABELS = ["LM CONFIG", "UPLOAD CSV", "MAP FIELDS", "WRITE PROMPT", "GENERATE", "DASHBOARD", "AB TEST"];
const CONFIG_KEY  = "cold_email_lm_config_v1";
const SESSION_KEY = "cold_email_session_v1";
const BATCH_FLUSH = 5;
const ROW_TIMEOUT = 120_000; // 2 min per row
const MAX_CONSECUTIVE_FAILS = 4; // pause + reconnect after this many in a row
const RECONNECT_POLL_MS = 15_000; // check every 15s if LM Studio is back

// ─── CONFIG PERSISTENCE ───────────────────────────────────────────────────────
function loadSavedConfig(): LMConfig {
  if (typeof window === "undefined") return DEFAULT_LM_CONFIG;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_LM_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_LM_CONFIG;
}

// ─── SESSION PERSISTENCE ──────────────────────────────────────────────────────
function sessionKey(rowCount: number, firstVal: string): string {
  return `${SESSION_KEY}_${rowCount}_${firstVal.slice(0, 40).replace(/\W/g, "_")}`;
}
function loadSession(rowCount: number, firstVal: string): GeneratedEmail[] {
  try { return JSON.parse(localStorage.getItem(sessionKey(rowCount, firstVal)) || "[]"); } catch { return []; }
}
function saveSessionKeyed(emails: GeneratedEmail[], rowCount: number, firstVal: string) {
  try { localStorage.setItem(sessionKey(rowCount, firstVal), JSON.stringify(emails)); } catch {}
}
function clearOldSessions() {
  try { Object.keys(localStorage).filter(k => k.startsWith(SESSION_KEY)).forEach(k => localStorage.removeItem(k)); } catch {}
}

// ─── QUALITY CHECK ────────────────────────────────────────────────────────────
const BAD_SUBJECT = /^(boost|elevate|unlock|transform|maximize|supercharge|enhance|optimize|take your|level up)/i;
const BAD_BODY = /hey there!|i'm reaching out|i wanted to reach out|hope this finds you|i noticed you|spring is here|spring is in the air/i;

function isGoodEmail(e: GeneratedEmail): boolean {
  if (e.error) return false;
  if (!e.subject || e.subject.length < 5) return false;
  if (!e.body || e.body.length < 30) return false;
  const wc = e.body.trim().split(/\s+/).length;
  if (wc < 15 || wc > 250) return false;
  if (BAD_SUBJECT.test(e.subject.trim())) return false;
  if (BAD_BODY.test(e.body)) return false;
  return true;
}

export default function Home() {
  const [step, setStep] = useState<Step>(1);
  const [config, setConfig] = useState<LMConfig>(DEFAULT_LM_CONFIG);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);

  // ── FIX 1: CSV rows in a REF, not state ──────────────────────────────────
  // This is the key fix for browser crashes on large CSVs.
  // React never re-renders when this ref changes — browser memory stays stable.
  const csvRowsRef = useRef<CsvRow[]>([]);
  const [csvRowCount, setCsvRowCount] = useState(0); // only count in state for UI

  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [seqTemplates, setSeqTemplates] = useState<SequenceTemplates>(() => getServiceTemplates("leadrocks_voice_ai", "full_email"));
  const [isOutscraper, setIsOutscraper] = useState(false);
  const [genState, setGenState] = useState<GenerationState>({
    status: "idle", total: 0, done: 0, failed: 0, currentBatch: [], emails: [],
  });

  const abortRef = useRef<AbortController | null>(null);
  const firstRowValRef = useRef("");

  useEffect(() => { setConfig(loadSavedConfig()); }, []);

  const handleConfigChange = useCallback((c: LMConfig) => {
    setConfig(c);
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); } catch {}
  }, []);

  const handleCsvLoaded = useCallback((headers: string[], rows: CsvRow[], total: number) => {
    // Store rows in ref — no React re-render cost for 1000+ rows
    csvRowsRef.current = rows;
    setCsvHeaders(headers);
    setCsvRowCount(total);

    const firstVal = rows[0] ? Object.values(rows[0])[0] || "" : "";
    firstRowValRef.current = firstVal;
    setMappings(autoMapColumns(headers));

    // Restore session keyed to this exact CSV
    const saved = loadSession(total, firstVal);
    setGenState({
      status: saved.length > 0 ? "paused" : "idle",
      total,
      done: saved.filter(e => !e.error).length,
      failed: saved.filter(e => !!e.error).length,
      currentBatch: [],
      emails: saved,
    });

    // Auto-detect format and switch service template
    if (isLeadRocksCsv(headers)) {
      setIsOutscraper(true);
      setSeqTemplates(t => t.service === "leadrocks_voice_ai" ? t : getServiceTemplates("leadrocks_voice_ai", t.mode));
    } else if (isOutscraperCsv(headers)) {
      setIsOutscraper(true);
      const cats = rows.slice(0, 10).map(r => detectBusinessCategory(r));
      const service = cats.filter(c => c === "professional_services").length > cats.filter(c => c === "restaurant").length
        ? "outscraper_professional" : "outscraper_voice_ai";
      setSeqTemplates(t => t.service === service ? t : getServiceTemplates(service, t.mode));
    } else {
      setIsOutscraper(false);
    }
  }, []);

  // ── FIX 2: LM Studio auto-reconnect ──────────────────────────────────────
  const testLMConnection = useCallback(async (cfg: LMConfig): Promise<boolean> => {
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: "Say CONNECTED",
          prompt: "CONNECTED",
          config: { ...cfg, maxTokens: 10, temperature: 0 },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const d = await res.json();
      return !d.error;
    } catch { return false; }
  }, []);

  const callGenerate = useCallback(async (
    template: string, row: CsvRow, signal: AbortSignal
  ): Promise<{ subject: string; body: string; raw: string }> => {
    const prompt = buildPrompt(template, row, mappings);
    const rowAbort = new AbortController();
    const timer = setTimeout(() => rowAbort.abort(), ROW_TIMEOUT);

    let combined: AbortSignal;
    try { combined = AbortSignal.any([signal, rowAbort.signal]); }
    catch { combined = rowAbort.signal; }

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: combined,
        body: JSON.stringify({ prompt, systemPrompt: seqTemplates.systemPrompt, config }),
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }, [mappings, seqTemplates.systemPrompt, config]);

  const runRows = useCallback(async (
    rowIndices: number[],
    existingEmails: GeneratedEmail[],
    signal: AbortSignal
  ) => {
    const { mode, step1, step2, step3, step4 } = seqTemplates;
    const emailMap = new Map<number, GeneratedEmail>(existingEmails.map(e => [e.rowIndex, e]));
    let done = existingEmails.filter(e => !e.error).length;
    let failed = existingEmails.filter(e => !!e.error).length;
    let pending = 0;
    let consecutiveFails = 0; // ── FIX 2: track consecutive failures

    const firstVal = firstRowValRef.current;
    const rowCount = csvRowsRef.current.length;

    function flush(currentBatch: number[]) {
      const sorted = Array.from(emailMap.values()).sort((a, b) => a.rowIndex - b.rowIndex);
      saveSessionKeyed(sorted, rowCount, firstVal);
      setGenState(s => ({ ...s, done, failed, emails: sorted, currentBatch }));
      pending = 0;
    }

    // ── FIX 2: Wait for LM Studio to reconnect ────────────────────────────
    const waitForReconnect = async (): Promise<boolean> => {
      setGenState(s => ({ ...s, status: "paused" as const }));
      let attempts = 0;
      while (!signal.aborted && attempts < 20) {
        await new Promise(r => setTimeout(r, RECONNECT_POLL_MS));
        if (signal.aborted) return false;
        const ok = await testLMConnection(config);
        if (ok) {
          consecutiveFails = 0;
          setGenState(s => ({ ...s, status: "running" as const }));
          return true;
        }
        attempts++;
      }
      return false;
    };

    async function processRow(idx: number, activeBatch: number[]): Promise<void> {
      if (signal.aborted) return;
      const row = csvRowsRef.current[idx]; // ── FIX 1: read from ref, not state
      if (!row) {
        emailMap.set(idx, { rowIndex: idx, subject: "", body: "", raw: "", error: "Row not found" });
        failed++;
        return;
      }

      try {
        const r1 = await callGenerate(step1, row, signal);
        if (signal.aborted) return;

        if (mode === "icebreaker") {
          emailMap.set(idx, { rowIndex: idx, subject: "", body: r1.raw.trim(), raw: r1.raw, icebreaker: r1.raw.trim() });
        } else if (mode === "sequence") {
          const r2 = await callGenerate(step2, row, signal);
          if (signal.aborted) return;
          const r3 = await callGenerate(step3, row, signal);
          if (signal.aborted) return;
          const r4 = await callGenerate(step4, row, signal);
          emailMap.set(idx, {
            rowIndex: idx, subject: r1.subject, body: r1.body, raw: r1.raw,
            subject2: r2.subject, body2: r2.body,
            subject3: r3.subject, body3: r3.body,
            subject4: r4.subject, body4: r4.body,
          });
        } else {
          emailMap.set(idx, { rowIndex: idx, subject: r1.subject, body: r1.body, raw: r1.raw });
        }
        done++;
        consecutiveFails = 0; // reset on success

      } catch (err: unknown) {
        if (signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        // Only treat as connection error for LOCAL LM Studio, not cloud APIs
        const isLocalLM = !config.baseUrl.includes("groq") && !config.baseUrl.includes("together") && !config.baseUrl.includes("openrouter") && !config.baseUrl.includes("anthropic") && !config.baseUrl.includes("api.openai");
        const isConnectionError = isLocalLM && (msg.includes("Failed to fetch") || msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT") || msg.includes("HTTP 500"));

        if (isConnectionError) {
          consecutiveFails++;
          // ── FIX 2: auto-reconnect after consecutive failures ──────────
          if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
            // Put this row back in the queue
            emailMap.delete(idx);
            const reconnected = await waitForReconnect();
            if (!reconnected) {
              emailMap.set(idx, { rowIndex: idx, subject: "", body: "", raw: "", error: "LM Studio offline — could not reconnect" });
              failed++;
            } else {
              // Re-process this row after reconnect
              await processRow(idx, activeBatch);
              return;
            }
          } else {
            emailMap.set(idx, { rowIndex: idx, subject: "", body: "", raw: "", error: msg });
            failed++;
          }
        } else {
          emailMap.set(idx, { rowIndex: idx, subject: "", body: "", raw: "", error: msg });
          failed++;
        }
      }

      pending++;
      if (pending >= BATCH_FLUSH) {
        flush(activeBatch.filter(i => i !== idx));
      }
    }

    const queue = [...rowIndices];
    const activeBatch: number[] = [];

    const workers = Array.from({ length: Math.min(config.concurrency, Math.max(1, queue.length)) }, () =>
      (async () => {
        while (queue.length > 0 && !signal.aborted) {
          const idx = queue.shift()!;
          activeBatch.push(idx);
          setGenState(s => ({ ...s, currentBatch: [...activeBatch] }));
          await processRow(idx, [...activeBatch]);
          const pos = activeBatch.indexOf(idx);
          if (pos !== -1) activeBatch.splice(pos, 1);
        }
      })()
    );

    await Promise.all(workers);
    flush([]);
  }, [csvRowsRef, seqTemplates, config, callGenerate, testLMConnection]);

  const startGeneration = useCallback(async () => {
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    clearOldSessions();
    const count = csvRowsRef.current.length;
    setGenState({ status: "running", total: count, done: 0, failed: 0, currentBatch: [], emails: [], startedAt: Date.now() });
    await runRows(Array.from({ length: count }, (_, i) => i), [], signal);
    setGenState(s => ({ ...s, status: signal.aborted ? "paused" : "done" }));
  }, [runRows]);

  const resumeGeneration = useCallback(async () => {
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const count = csvRowsRef.current.length;
    const doneSet = new Set(genState.emails.map(e => e.rowIndex));
    const remaining = Array.from({ length: count }, (_, i) => i).filter(i => !doneSet.has(i));
    setGenState(s => ({ ...s, status: "running", total: count, startedAt: Date.now() }));
    await runRows(remaining, genState.emails, signal);
    setGenState(s => ({ ...s, status: signal.aborted ? "paused" : "done" }));
  }, [csvRowsRef, genState.emails, runRows]);

  const retryFailed = useCallback(async () => {
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const failedIndices = genState.emails.filter(e => e.error).map(e => e.rowIndex);
    const good = genState.emails.filter(e => !e.error);
    setGenState(s => ({ ...s, status: "running", failed: 0, startedAt: Date.now() }));
    await runRows(failedIndices, good, signal);
    setGenState(s => ({ ...s, status: signal.aborted ? "paused" : "done" }));
  }, [genState.emails, runRows]);

  const regenBad = useCallback(async () => {
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const bad = genState.emails.filter(e => !isGoodEmail(e)).map(e => e.rowIndex);
    const good = genState.emails.filter(e => isGoodEmail(e));
    setGenState(s => ({ ...s, status: "running", startedAt: Date.now() }));
    await runRows(bad, good, signal);
    setGenState(s => ({ ...s, status: signal.aborted ? "paused" : "done" }));
  }, [genState.emails, runRows]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setGenState(s => ({ ...s, status: "paused" }));
  }, []);

  const updateEmail = useCallback((idx: number, subject: string, body: string) => {
    setGenState(s => {
      const emails = s.emails.map(e => e.rowIndex === idx ? { ...e, subject, body, edited: true } : e);
      saveSessionKeyed(emails, csvRowsRef.current.length, firstRowValRef.current);
      return { ...s, emails };
    });
  }, []);

  const resetGeneration = useCallback(() => {
    abortRef.current?.abort();
    clearOldSessions();
    setGenState({ status: "idle", total: 0, done: 0, failed: 0, currentBatch: [], emails: [] });
  }, []);

  // Rows remaining (not yet in emailMap)
  const generatedSet = new Set(genState.emails.map(e => e.rowIndex));
  const remainingCount = csvRowCount - generatedSet.size;

  const generateRemaining = useCallback(async () => {
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const remaining = Array.from({ length: csvRowsRef.current.length }, (_, i) => i).filter(i => !generatedSet.has(i));
    if (!remaining.length) return;
    setGenState(s => ({ ...s, status: "running", total: csvRowsRef.current.length, startedAt: Date.now() }));
    await runRows(remaining, genState.emails, signal);
    setGenState(s => ({ ...s, status: signal.aborted ? "paused" : "done" }));
  }, [csvRowsRef, generatedSet, genState.emails, runRows]);

  const qualityStats = {
    good: genState.emails.filter(isGoodEmail).length,
    bad: genState.emails.filter(e => !isGoodEmail(e) && !e.error).length,
  };

  const canProceed = [true, csvRowCount > 0, mappings.some(m => m.semanticKey), true, true, true, true];

  // Step 6: if no CSV loaded but they click dashboard, still allow it
  const step6Enabled = true; // Dashboard is always accessible

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a" }}>
      <div style={{ background: "#0f0f0f", borderBottom: "1px solid #222", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="syne" style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "-0.5px", color: "#fff" }}>✉ COLD EMAIL ENGINE</div>
          <div style={{ fontSize: "11px", color: "#555", marginTop: "3px", letterSpacing: "1px" }}>LOCAL LLM · REACHINBOX READY · LARGE CSV</div>
        </div>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {STEP_LABELS.map((label, i) => {
            const s = (i + 1) as Step;
            const active = step === s;
            const done = step > s;
            const enabled = s === 6 ? step6Enabled : (done || canProceed[i]);
            return (
              <button key={s} onClick={() => enabled && setStep(s)}
                style={{
                  background: active ? "#e8ff00" : done ? "#1a3a00" : "#111",
                  color: active ? "#000" : done ? "#44ff88" : "#444",
                  border: `1px solid ${active ? "#e8ff00" : done ? "#44ff88" : "#222"}`,
                  padding: "6px 12px", fontSize: "10px", letterSpacing: "1px", fontWeight: active ? 500 : 400,
                  cursor: enabled ? "pointer" : "not-allowed",
                }}>
                {done ? "✓ " : ""}{s}. {label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
        {step === 1 && <ConfigPanel config={config} onChange={handleConfigChange} onNext={() => setStep(2)} />}
        {step === 2 && <CsvUpload onLoaded={handleCsvLoaded} currentRows={csvRowCount} totalRows={csvRowCount} config={config} onNext={() => setStep(3)} />}
        {step === 3 && <FieldMapper headers={csvHeaders} mappings={mappings} onChange={setMappings} sampleRow={csvRowsRef.current[0]} onNext={() => setStep(4)} onBack={() => setStep(2)} />}
        {step === 4 && (
          <PromptBuilder
            seqTemplates={seqTemplates}
            onTemplatesChange={setSeqTemplates}
            sampleRow={csvRowsRef.current[0]}
            mappings={mappings}
            config={config}
            isOutscraper={isOutscraper}
            onNext={() => setStep(5)}
            onBack={() => setStep(3)}
          />
        )}
        {step === 5 && (
          <GenerationPanel
            csvRows={csvRowsRef.current}
            mappings={mappings}
            genState={genState}
            mode={seqTemplates.mode}
            qualityStats={qualityStats}
            remainingCount={remainingCount}
            onGenerateRemaining={generateRemaining}
            onStart={startGeneration}
            onResume={resumeGeneration}
            onStop={stopGeneration}
            onRetryFailed={retryFailed}
            onRegenBad={regenBad}
            onUpdateEmail={updateEmail}
            onReset={resetGeneration}
            onBack={() => setStep(4)}
          />
        )}
        {step === 6 && (
          <DashboardPanel
            onBack={() => setStep(5)}
            onNext={() => setStep(7)}
          />
        )}
        {step === 7 && (
          <ABTestPanel
            onBack={() => setStep(6)}
          />
        )}
      </div>
    </div>
  );
}
