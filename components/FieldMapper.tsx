"use client";

import { FieldMapping, SEMANTIC_FIELDS, CsvRow } from "@/lib/types";

interface Props {
  headers: string[];
  mappings: FieldMapping[];
  onChange: (m: FieldMapping[]) => void;
  sampleRow?: CsvRow;
  onNext: () => void;
  onBack: () => void;
}

const UNMAPPED = "";

export default function FieldMapper({ headers, mappings, onChange, sampleRow, onNext, onBack }: Props) {
  const setMapping = (csvColumn: string, semanticKey: string) => {
    // Clear any existing mapping of this semanticKey first
    const updated = mappings.map(m => ({
      ...m,
      semanticKey: m.csvColumn === csvColumn ? semanticKey : (m.semanticKey === semanticKey && semanticKey !== UNMAPPED ? UNMAPPED : m.semanticKey),
    }));
    onChange(updated);
  };

  const mappedCount = mappings.filter(m => m.semanticKey).length;
  const emailMapped = mappings.some(m => m.semanticKey === "email");

  return (
    <div>
      <div className="syne" style={{ fontSize: "24px", fontWeight: 800, color: "#fff", marginBottom: "12px", letterSpacing: "-0.5px" }}>
        03 — MAP FIELDS
      </div>
      <p style={{ color: "#555", fontSize: "12px", marginBottom: "8px" }}>
        Match your CSV columns to personalization tokens. Auto-mapped where detected.
      </p>
      <div style={{ color: "#444", fontSize: "11px", marginBottom: "28px" }}>
        {mappedCount} of {headers.length} columns mapped
        {!emailMapped && <span style={{ color: "#ff9500", marginLeft: "16px" }}>⚠ Email column not mapped — needed for export</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "#1a1a1a", marginBottom: "24px" }}>
        {/* Header */}
        <div style={{ background: "#111", padding: "8px 16px", fontSize: "10px", color: "#444", letterSpacing: "1px" }}>CSV COLUMN</div>
        <div style={{ background: "#111", padding: "8px 16px", fontSize: "10px", color: "#444", letterSpacing: "1px" }}>MAPS TO TOKEN</div>

        {mappings.map((m) => {
          const sample = sampleRow?.[m.csvColumn];
          const mapped = !!m.semanticKey;
          return (
            <div key={m.csvColumn} style={{ display: "contents" }}>
              <div style={{
                background: "#0f0f0f",
                padding: "12px 16px",
                borderBottom: "1px solid #111",
              }}>
                <div style={{ color: mapped ? "#e8e8e0" : "#555", fontSize: "12px", fontWeight: 500 }}>
                  {m.csvColumn}
                </div>
                {sample && (
                  <div style={{ color: "#444", fontSize: "11px", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "280px" }}>
                    {String(sample).slice(0, 60)}
                  </div>
                )}
              </div>
              <div style={{ background: "#0f0f0f", padding: "10px 16px", borderBottom: "1px solid #111" }}>
                <select
                  value={m.semanticKey}
                  onChange={e => setMapping(m.csvColumn, e.target.value)}
                  style={{
                    width: "100%", padding: "7px 10px", fontSize: "12px",
                    background: m.semanticKey ? "#0a1a0a" : "#111",
                    color: m.semanticKey ? "#44ff88" : "#555",
                    border: `1px solid ${m.semanticKey ? "#1a3a1a" : "#2a2a2a"}`,
                  }}
                >
                  <option value="">— Not used —</option>
                  {SEMANTIC_FIELDS.map(f => (
                    <option key={f.key} value={f.key}>
                      {"{{"}{f.key}{"}}"} — {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {/* Token reference */}
      <div style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", padding: "16px 20px", marginBottom: "28px" }}>
        <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "10px" }}>AVAILABLE TOKENS (use in prompt template)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {SEMANTIC_FIELDS.map(f => {
            const isMapped = mappings.some(m => m.semanticKey === f.key);
            return (
              <span
                key={f.key}
                title={`${f.description} (e.g. ${f.example})`}
                style={{
                  background: isMapped ? "#0a1a0a" : "#111",
                  color: isMapped ? "#44ff88" : "#333",
                  border: `1px solid ${isMapped ? "#1a3a1a" : "#222"}`,
                  padding: "3px 10px", fontSize: "11px",
                }}
              >
                {`{{${f.key}}}`}
              </span>
            );
          })}
          {["{{season}}", "{{month}}", "{{year}}", "{{date}}"].map(t => (
            <span key={t} style={{ background: "#0a0a1a", color: "#44aaff", border: "1px solid #1a1a3a", padding: "3px 10px", fontSize: "11px" }}>
              {t}
            </span>
          ))}
        </div>
        <div style={{ fontSize: "10px", color: "#333", marginTop: "8px" }}>
          Green = mapped from CSV · Blue = auto-computed (season, date) · Gray = unmapped
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px" }}>
        <button onClick={onBack} style={{ background: "#111", color: "#555", border: "1px solid #222", padding: "12px 24px", fontSize: "12px" }}>
          ← BACK
        </button>
        <button
          onClick={onNext}
          disabled={mappedCount === 0}
          style={{ background: "#e8ff00", color: "#000", border: "none", padding: "12px 32px", fontSize: "13px", fontWeight: 500, letterSpacing: "0.5px", opacity: mappedCount === 0 ? 0.4 : 1 }}
        >
          NEXT: WRITE PROMPT →
        </button>
      </div>
    </div>
  );
}
