"use client";

import { useState, useCallback } from "react";
import {
  STEP_ELEMENT_CONFIGS,
  ELEMENT_OPTIONS,
  ELEMENT_LABELS,
  TestElement,
  TestElementConfig,
  LessonsLearned,
} from "@/lib/ab-testing";

const STEPS = ["step1", "step2", "step3", "step4"];
const STEP_NAMES: Record<string, string> = {
  step1: "Day 0 — Hook",
  step2: "Day 3 — Social Proof",
  step3: "Day 7 — Objection",
  step4: "Day 14 — Breakup",
};

type Tab = "config" | "assign" | "lessons";

const ELEMENT_COLORS: Record<string, string> = {
  subject_style: "#44ff88",
  opening_style: "#44aaff",
  cta_type: "#ff9500",
  length_class: "#e8ff00",
  tone_style: "#ff3b3b",
};

const VARIANT_COLORS: Record<string, string> = {
  A: "#44ff88",
  B: "#44aaff",
  C: "#ff9500",
  D: "#e8ff00",
  E: "#ff3b3b",
};

export default function ABTestPanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("config");
  const [csvInput, setCsvInput] = useState("");
  const [assignments, setAssignments] = useState<{
    total: number;
    csv: string;
    variantCounts: Record<string, Record<string, number>>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lessons, setLessons] = useState<LessonsLearned | null>(null);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lessonsError, setLessonsError] = useState("");
  const [expandedStep, setExpandedStep] = useState<string | null>("step1");

  const generateAssignments = useCallback(async () => {
    setError("");
    setAssignments(null);
    const emails = csvInput
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0 && l.includes("@"));
    if (emails.length === 0) {
      setError("No valid email addresses found. Paste one email per line.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/assign-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAssignments(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [csvInput]);

  const downloadCSV = useCallback(() => {
    if (!assignments) return;
    const blob = new Blob([assignments.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `variant-assignments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [assignments]);

  const fetchLessons = useCallback(async () => {
    setLessonsLoading(true);
    setLessonsError("");
    setLessons(null);
    try {
      const res = await fetch("/api/lessons");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text.slice(0, 100));
      }
      const data = await res.json();
      setLessons(data);
    } catch (err: unknown) {
      setLessonsError(err instanceof Error ? err.message : String(err));
    } finally {
      setLessonsLoading(false);
    }
  }, []);

  const renderElementChip = (element: TestElement, value: string) => (
    <span
      key={`${element}-${value}`}
      style={{
        display: "inline-block",
        padding: "2px 8px",
        fontSize: "10px",
        borderRadius: "2px",
        background: `${ELEMENT_COLORS[element]}15`,
        color: ELEMENT_COLORS[element],
        border: `1px solid ${ELEMENT_COLORS[element]}30`,
        margin: "2px",
      }}
      title={ELEMENT_LABELS[element]}
    >
      {ELEMENT_LABELS[element].split(" ")[0]}: {value.replace(/_/g, " ")}
    </span>
  );

  return (
    <div>
      <div className="syne" style={{ fontSize: "24px", fontWeight: 800, color: "#fff", marginBottom: "6px", letterSpacing: "-0.5px" }}>
        07 — A/B TEST
      </div>
      <p style={{ color: "#555", fontSize: "12px", marginBottom: "20px" }}>
        Variant element configs, random assignment for CSV export, and statistical winner analysis.
      </p>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "0", marginBottom: "18px" }}>
        {(["config", "assign", "lessons"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 18px",
              fontSize: "11px",
              letterSpacing: "1px",
              background: tab === t ? "#e8ff00" : "#111",
              color: tab === t ? "#000" : "#555",
              border: `1px solid ${tab === t ? "#e8ff00" : "#222"}`,
              fontWeight: tab === t ? 500 : 400,
            }}
          >
            {t === "config" ? "01 ELEMENT CONFIG" : t === "assign" ? "02 ASSIGNMENT CSV" : "03 LESSONS LEARNED"}
          </button>
        ))}
      </div>

      {/* ── TAB 1: Element Config ────────────────────────────────────────── */}
      {tab === "config" && (
        <div>
          <p style={{ color: "#666", fontSize: "11px", marginBottom: "14px", lineHeight: 1.6 }}>
            Each variant (A-E) tests a specific combination of elements. The configs below show what
            each variant is testing per step — subject style, opening style, CTA type, length, and tone.
            The actual prompt text lives in the templates (Step 4).
          </p>

          {STEPS.map(step => (
            <div key={step} style={{ marginBottom: "14px" }}>
              <button
                onClick={() => setExpandedStep(expandedStep === step ? null : step)}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 16px",
                  background: "#111",
                  border: `1px solid ${expandedStep === step ? "#3a3a3a" : "#222"}`,
                  color: "#e8e8e0",
                  fontSize: "13px",
                  fontWeight: 500,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span>{STEP_NAMES[step]} — {STEP_ELEMENT_CONFIGS[step].length} variants</span>
                <span style={{ color: "#555", fontSize: "16px" }}>{expandedStep === step ? "▾" : "▸"}</span>
              </button>

              {expandedStep === step && (
                <div style={{ background: "#0d0d0d", border: "1px solid #222", borderTop: "none", padding: "14px 16px" }}>
                  {/* Element legend */}
                  <div style={{ display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
                    {(Object.keys(ELEMENT_LABELS) as TestElement[]).map(el => (
                      <span key={el} style={{ fontSize: "10px", color: ELEMENT_COLORS[el], letterSpacing: "0.5px" }}>
                        ▬ {ELEMENT_LABELS[el]}
                      </span>
                    ))}
                  </div>

                  {/* Variant grid */}
                  {STEP_ELEMENT_CONFIGS[step].map((cfg: TestElementConfig) => (
                    <div
                      key={cfg.variant}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "8px 10px",
                        marginBottom: "6px",
                        background: "#111",
                        border: `1px solid ${VARIANT_COLORS[cfg.variant]}25`,
                        borderLeft: `3px solid ${VARIANT_COLORS[cfg.variant]}`,
                      }}
                    >
                      <div style={{
                        width: "28px",
                        height: "28px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: `${VARIANT_COLORS[cfg.variant]}20`,
                        color: VARIANT_COLORS[cfg.variant],
                        fontSize: "14px",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        {cfg.variant}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px", marginBottom: "3px" }}>
                          {renderElementChip("subject_style", cfg.subjectStyle)}
                          {renderElementChip("opening_style", cfg.openingStyle)}
                          {renderElementChip("cta_type", cfg.ctaType)}
                          {renderElementChip("length_class", cfg.lengthClass)}
                          {renderElementChip("tone_style", cfg.toneStyle)}
                        </div>
                        <div style={{ fontSize: "10px", color: "#666" }}>{cfg.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── TAB 2: Assign Variants ─────────────────────────────────────────── */}
      {tab === "assign" && (
        <div>
          <div style={{ background: "#0a0a1a", border: "1px solid #1a1a3a", padding: "10px 16px", marginBottom: "18px", fontSize: "11px", color: "#4488aa", lineHeight: 1.6 }}>
            <strong style={{ color: "#44aaff" }}>ℹ Variant Assignment:</strong>
            Paste your contact emails (one per line). Each email gets a deterministic variant (A-E)
            per step — same email = same variant every time, no database needed. Download the CSV
            to import into ReachInbox as custom columns: <code style={{ background: "#111", padding: "1px 5px" }}>Step1_Variant</code> through <code style={{ background: "#111", padding: "1px 5px" }}>Step4_Variant</code>.
          </div>

          <textarea
            value={csvInput}
            onChange={e => setCsvInput(e.target.value)}
            placeholder={"Paste emails here, one per line:\n\nowner@restaurant.com\nchef@place.com\nmanager@business.com"}
            rows={8}
            style={{
              width: "100%",
              padding: "12px 14px",
              fontSize: "11px",
              lineHeight: "1.6",
              resize: "vertical",
              background: "#111",
              color: "#e8e8e0",
              border: "1px solid #2a2a2a",
              fontFamily: "DM Mono, monospace",
            }}
          />

          <button
            onClick={generateAssignments}
            disabled={loading || !csvInput.trim()}
            style={{
              marginTop: "10px",
              padding: "10px 24px",
              background: "#0a1a0a",
              color: "#44ff88",
              border: "1px solid #1a3a1a",
              fontSize: "12px",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "⟳ ASSIGNING..." : "⚡ GENERATE ASSIGNMENTS"}
          </button>

          {error && (
            <div style={{ marginTop: "12px", color: "#ff3b3b", fontSize: "12px", padding: "10px", background: "#1a0a0a", border: "1px solid #3a1a1a" }}>
              ✗ {error}
            </div>
          )}

          {assignments && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ background: "#0a1a0a", border: "1px solid #1a3a1a", padding: "12px 16px", marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ color: "#44ff88", fontSize: "20px", fontWeight: 700 }}>{assignments.total}</span>
                    <span style={{ color: "#666", fontSize: "12px", marginLeft: "6px" }}>contacts assigned</span>
                  </div>
                  <button
                    onClick={downloadCSV}
                    style={{
                      padding: "8px 16px",
                      background: "#0a0a1a",
                      color: "#44aaff",
                      border: "1px solid #1a1a3a",
                      fontSize: "11px",
                      letterSpacing: "1px",
                    }}
                  >
                    ↓ DOWNLOAD CSV (25 columns)
                  </button>
                </div>
              </div>

              {/* Distribution per step */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px" }}>
                {STEPS.map(step => {
                  const counts = assignments.variantCounts[step];
                  const total = Object.values(counts).reduce((s, c) => s + c, 0);
                  return (
                    <div key={step} style={{ background: "#0f0f0f", border: "1px solid #222", padding: "10px" }}>
                      <div style={{ fontSize: "10px", color: "#666", letterSpacing: "1px", marginBottom: "6px" }}>
                        {STEP_NAMES[step]}
                      </div>
                      {Object.entries(counts).map(([variant, count]) => {
                        const pct = total > 0 ? (count / total) * 100 : 0;
                        return (
                          <div key={variant} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                            <span style={{ color: VARIANT_COLORS[variant], fontSize: "11px", fontWeight: 700, width: "16px" }}>{variant}</span>
                            <div style={{ flex: 1, height: "8px", background: "#1a1a1a", borderRadius: "2px", overflow: "hidden" }}>
                              <div style={{
                                height: "100%",
                                width: `${pct}%`,
                                background: `${VARIANT_COLORS[variant]}50`,
                                borderRadius: "2px",
                                transition: "width 0.3s",
                              }} />
                            </div>
                            <span style={{ color: "#888", fontSize: "10px", width: "30px", textAlign: "right" }}>{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: Lessons Learned ──────────────────────────────────────────── */}
      {tab === "lessons" && (
        <div>
          <div style={{ background: "#0f0a1a", border: "1px solid #2a1a3a", padding: "12px 16px", marginBottom: "18px", fontSize: "11px", color: "#aa88cc", lineHeight: 1.6 }}>
            <strong style={{ color: "#cc88ff" }}>ℹ Lessons Learned:</strong>
            Analyzes dashboard campaign data to find statistically significant winners per step
            (90% confidence z-test, min 50 sends per variant). Also identifies which element styles
            (subject, opening, CTA, tone) drive the best reply rates across all variants.
          </div>

          <button
            onClick={fetchLessons}
            disabled={lessonsLoading}
            style={{
              padding: "10px 24px",
              background: "#1a0a2a",
              color: "#cc88ff",
              border: "1px solid #2a1a3a",
              fontSize: "12px",
              opacity: lessonsLoading ? 0.6 : 1,
            }}
          >
            {lessonsLoading ? "⟳ ANALYZING..." : "📊 GENERATE LESSONS LEARNED REPORT"}
          </button>

          {lessonsError && (
            <div style={{ marginTop: "12px", color: "#ff3b3b", fontSize: "12px", padding: "10px", background: "#1a0a0a", border: "1px solid #3a1a1a" }}>
              {lessonsError}
            </div>
          )}

          {lessons && (
            <div style={{ marginTop: "16px" }}>
              {/* Overview */}
              <div style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", padding: "14px 18px", marginBottom: "14px" }}>
                <div style={{ fontSize: "11px", color: "#cc88ff", letterSpacing: "1px", marginBottom: "6px" }}>OVERVIEW</div>
                <div style={{ color: "#e8e8e0", fontSize: "13px", lineHeight: 1.6 }}>{lessons.overview}</div>
                {lessons.generatedAt && (
                  <div style={{ color: "#555", fontSize: "10px", marginTop: "6px" }}>
                    Generated: {new Date(lessons.generatedAt).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Per-step results */}
              {lessons.perStepResults.length > 0 && (
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ fontSize: "11px", color: "#444", letterSpacing: "1px", marginBottom: "8px" }}>PER-STEP RESULTS</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    {lessons.perStepResults.map((r, i) => (
                      <div key={i} style={{
                        background: "#0f0f0f",
                        border: `1px solid ${r.winningVariant ? "#1a3a1a" : "#2a2a2a"}`,
                        padding: "12px 14px",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <span style={{ fontSize: "11px", color: "#888" }}>{STEP_NAMES[r.step] || r.step}</span>
                          {r.winningVariant ? (
                            <span style={{ color: "#44ff88", fontSize: "12px", fontWeight: 700 }}>★ {r.winningVariant} WINS</span>
                          ) : (
                            <span style={{ color: "#ff9500", fontSize: "11px" }}>No clear winner</span>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", color: "#999", lineHeight: 1.5 }}>
                          <div>Winner rate: {(r.winnerRate * 100).toFixed(1)}% · Runner-up: {(r.runnerUpRate * 100).toFixed(1)}%</div>
                          <div>Sends: {r.sampleSizeTotal} · Confidence: {r.confidencePct}%</div>
                          <div style={{ color: "#666", marginTop: "4px", fontSize: "10px" }}>
                            {r.recommendation.slice(0, 120)}...
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Element-level breakdowns */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                {[
                  { label: "Top Subject Styles", data: lessons.topSubjectStyles, color: "#44ff88" },
                  { label: "Top Opening Styles", data: lessons.topOpeningStyles, color: "#44aaff" },
                  { label: "Top CTA Types", data: lessons.topCtaTypes, color: "#ff9500" },
                  { label: "Top Tone Styles", data: lessons.topToneStyles, color: "#ff3b3b" },
                ].map(section => (
                  <div key={section.label} style={{ background: "#0f0f0f", border: "1px solid #222", padding: "10px 14px" }}>
                    <div style={{ fontSize: "10px", color: section.color, letterSpacing: "1px", marginBottom: "8px" }}>
                      {section.label}
                    </div>
                    {(section.data as { style: string; avgReplyRate: number; count: number }[]).map((d, i) => {
                      const maxRate = Math.max(...section.data.map((d: { avgReplyRate: number }) => d.avgReplyRate), 0.01);
                      const pct = (d.avgReplyRate / maxRate) * 100;
                      return (
                        <div key={d.style} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          <span style={{ fontSize: "10px", color: i === 0 ? section.color : "#888", width: "80px", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {d.style.replace(/_/g, " ")}
                          </span>
                          <div style={{ flex: 1, height: "6px", background: "#1a1a1a", borderRadius: "2px", overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              width: `${pct}%`,
                              background: `${section.color}40`,
                              borderRadius: "2px",
                            }} />
                          </div>
                          <span style={{ color: "#888", fontSize: "10px", width: "42px", textAlign: "right" }}>
                            {(d.avgReplyRate * 100).toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Recommendations */}
              <div style={{ marginTop: "14px", background: "#0f0a1a", border: "1px solid #2a1a3a", padding: "12px 16px" }}>
                <div style={{ fontSize: "10px", color: "#cc88ff", letterSpacing: "1px", marginBottom: "8px" }}>RECOMMENDATIONS</div>
                {lessons.recommendations.map((rec, i) => (
                  <div key={i} style={{
                    padding: "6px 10px",
                    marginBottom: "4px",
                    fontSize: "11px",
                    color: "#d0d0c8",
                    background: "#111",
                    borderLeft: "2px solid #cc88ff",
                    lineHeight: 1.5,
                  }}>
                    {rec}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
        <button onClick={onBack} style={{ background: "#111", color: "#555", border: "1px solid #222", padding: "12px 24px", fontSize: "12px" }}>
          ← BACK TO DASHBOARD
        </button>
      </div>
    </div>
  );
}
