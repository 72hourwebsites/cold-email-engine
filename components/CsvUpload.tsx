"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import Papa from "papaparse";
import { CsvRow, LMConfig } from "@/lib/types";
import { isLeadRocksCsv } from "@/lib/leadrocks";
import EmailVerifier from "./EmailVerifier";

interface Props {
  onLoaded: (headers: string[], rows: CsvRow[], total: number) => void;
  currentRows: number;
  totalRows: number;
  config: LMConfig;
  onNext: () => void;
}

export default function CsvUpload({ onLoaded, currentRows, totalRows, config, onNext }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [loadedRows, setLoadedRows] = useState<CsvRow[]>([]);
  const [loadedHeaders, setLoadedHeaders] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parseProgress, setParseProgress] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<CsvRow[]>([]);
  const [serverFiles, setServerFiles] = useState<string[]>([]);
  const [showServerPicker, setShowServerPicker] = useState(false);
  const [serverLoading, setServerLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load list of CSVs from server Downloads folder
  useEffect(() => {
    fetch("/api/load-csv")
      .then(r => r.json())
      .then(d => setServerFiles((d.files || []).map((f: {name: string}) => f.name)))
      .catch(() => {});
  }, []);

  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    setParsing(true);
    setParseProgress(0);

    const allRows: CsvRow[] = [];
    let csvHeaders: string[] = [];
    let rowCount = 0;

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      chunk(results, parser) {
        if (csvHeaders.length === 0 && results.meta.fields) {
          csvHeaders = results.meta.fields.filter(Boolean) as string[];
          setHeaders(csvHeaders);
        }

        const chunk = results.data as CsvRow[];
        allRows.push(...chunk);
        rowCount += chunk.length;

        // Show first 5 rows as preview immediately
        if (allRows.length <= 5) {
          setPreview([...allRows]);
        }

        // Progress estimate (file.size not always accurate, use row count)
        setParseProgress(Math.min(95, Math.round((rowCount / Math.max(rowCount + 500, 1000)) * 100)));

        // Pause parser momentarily to let UI breathe for large files
        if (rowCount % 10000 === 0) {
          parser.pause();
          setTimeout(() => parser.resume(), 0);
        }
      },
      complete() {
        setParseProgress(100);
        setParsing(false);
        setPreview(allRows.slice(0, 5));
        setLoadedRows(allRows);
        setLoadedHeaders(csvHeaders);
        onLoaded(csvHeaders, allRows, allRows.length);
      },
      error(err) {
        console.error("CSV parse error:", err);
        setParsing(false);
      },
    });
  }, [onLoaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const loadFromServer = useCallback(async (filename: string) => {
    setServerLoading(true);
    setShowServerPicker(false);
    setFileName(filename);
    setParsing(true);
    setParseProgress(0);
    try {
      const res = await fetch("/api/load-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();

      // Parse the text content through PapaParse
      const allRows: CsvRow[] = [];
      let csvHeaders: string[] = [];

      Papa.parse<CsvRow>(text, {
        header: true,
        skipEmptyLines: true,
        chunk(results: Papa.ParseResult<CsvRow>, parser: Papa.Parser) {
          if (csvHeaders.length === 0 && results.meta.fields) {
            csvHeaders = results.meta.fields.filter(Boolean) as string[];
            setHeaders(csvHeaders);
          }
          const chunk = results.data as CsvRow[];
          allRows.push(...chunk);
          setParseProgress(Math.min(95, Math.round((allRows.length / 1100) * 100)));
          if (allRows.length % 10000 === 0) { parser.pause(); setTimeout(() => parser.resume(), 0); }
        },
        complete() {
          setParseProgress(100);
          setParsing(false);
          setPreview(allRows.slice(0, 5));
          setLoadedRows(allRows);
          setLoadedHeaders(csvHeaders);
          onLoaded(csvHeaders, allRows, allRows.length);
        },
        error() { setParsing(false); },
      });
    } catch (err) {
      console.error("Server load failed:", err);
      setParsing(false);
    } finally {
      setServerLoading(false);
    }
  }, [onLoaded]);

  return (
    <div>
      <div className="syne" style={{ fontSize: "24px", fontWeight: 800, color: "#fff", marginBottom: "12px", letterSpacing: "-0.5px" }}>
        02 — UPLOAD CSV
      </div>
      <p style={{ color: "#555", fontSize: "12px", marginBottom: "16px" }}>
        Drop any CSV, or load directly from your Downloads folder.
      </p>

      {/* Server file loader */}
      <div style={{ marginBottom: "16px" }}>
        <button
          onClick={() => setShowServerPicker(p => !p)}
          disabled={serverLoading}
          style={{ background: "#0a0a1a", color: "#44aaff", border: "1px solid #1a1a3a", padding: "8px 18px", fontSize: "12px", letterSpacing: "0.5px", marginRight: "10px" }}
        >
          {serverLoading ? "⟳ LOADING..." : "📂 LOAD FROM DOWNLOADS"}
        </button>
        {currentRows > 0 && <span style={{ fontSize: "11px", color: "#44ff88" }}>✓ {currentRows.toLocaleString()} rows loaded</span>}
      </div>

      {showServerPicker && (
        <div style={{ background: "#080808", border: "1px solid #1a1a3a", padding: "12px", marginBottom: "16px", maxHeight: "220px", overflowY: "auto" }}>
          <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "8px" }}>SELECT CSV FROM DOWNLOADS</div>
          {serverFiles.filter(f => f.toLowerCase().endsWith(".csv")).map(f => (
            <div
              key={f}
              onClick={() => loadFromServer(f)}
              style={{ padding: "8px 10px", fontSize: "12px", color: "#888", cursor: "pointer", borderBottom: "1px solid #111", display: "flex", justifyContent: "space-between" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#111")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span>{f}</span>
              <span style={{ color: "#44aaff", fontSize: "10px" }}>LOAD →</span>
            </div>
          ))}
          {serverFiles.length === 0 && <div style={{ color: "#444", fontSize: "11px" }}>No CSV files found in Downloads</div>}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#44ff88" : currentRows > 0 ? "#2a4a2a" : "#2a2a2a"}`,
          background: dragOver ? "#0a1a0a" : currentRows > 0 ? "#0a0f0a" : "#111",
          borderRadius: "4px",
          padding: "48px 32px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.15s",
          marginBottom: "24px",
        }}
      >
        <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={onFileChange} />
        {parsing ? (
          <div>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>⟳</div>
            <div style={{ color: "#44ff88", fontSize: "13px", marginBottom: "8px" }}>Parsing {fileName}...</div>
            <div style={{ width: "200px", height: "3px", background: "#1a1a1a", margin: "0 auto", borderRadius: "2px" }}>
              <div style={{ width: `${parseProgress}%`, height: "100%", background: "#44ff88", transition: "width 0.2s", borderRadius: "2px" }} />
            </div>
            <div style={{ color: "#555", fontSize: "11px", marginTop: "8px" }}>{parseProgress}%</div>
          </div>
        ) : currentRows > 0 ? (
          <div>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>✓</div>
            <div style={{ color: "#44ff88", fontSize: "15px", fontWeight: 500 }}>{fileName}</div>
            <div style={{ color: "#555", fontSize: "12px", marginTop: "4px" }}>
              {currentRows.toLocaleString()} rows · {headers.length} columns — click to replace
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>⬆</div>
            <div style={{ color: "#e8e8e0", fontSize: "15px", marginBottom: "4px" }}>Drop your CSV here or click to browse</div>
            <div style={{ color: "#444", fontSize: "12px" }}>Handles 100k+ rows · streaming parser · no size limit</div>
          </div>
        )}
      </div>

      {/* Stats */}
      {currentRows > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1px", background: "#1a1a1a", marginBottom: "24px" }}>
          {[
            { label: "ROWS", value: currentRows.toLocaleString(), color: "#e8ff00" },
            { label: "COLUMNS", value: headers.length, color: "#44ff88" },
            { label: "EST. EMAILS", value: currentRows.toLocaleString(), color: "#44aaff" },
            { label: "STATUS", value: "READY", color: "#44ff88" },
          ].map((s, i) => (
            <div key={i} style={{ background: "#0f0f0f", padding: "14px 20px" }}>
              <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "4px" }}>{s.label}</div>
              <div className="syne" style={{ fontSize: "20px", fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Column preview */}
      {headers.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "10px" }}>DETECTED COLUMNS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {headers.map(h => (
              <span key={h} style={{ background: "#1a1a1a", color: "#888", border: "1px solid #2a2a2a", padding: "3px 10px", fontSize: "11px" }}>
                {h}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Data preview table */}
      {preview.length > 0 && (
        <div style={{ marginBottom: "28px", overflowX: "auto" }}>
          <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "10px" }}>PREVIEW (first 5 rows)</div>
          <table style={{ borderCollapse: "collapse", fontSize: "11px", minWidth: "100%" }}>
            <thead>
              <tr style={{ background: "#111" }}>
                {headers.map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#555", fontWeight: 400, letterSpacing: "0.5px", whiteSpace: "nowrap", borderBottom: "1px solid #222" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#0a0a0a" : "#0d0d0d" }}>
                  {headers.map(h => (
                    <td key={h} style={{ padding: "7px 12px", color: "#888", borderBottom: "1px solid #111", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row[h] || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reoon email verification — shows automatically for LeadRocks CSVs */}
      {currentRows > 0 && isLeadRocksCsv(headers) && loadedRows.length > 0 && (
        <EmailVerifier
          rows={loadedRows}
          apiKey={config.reoonApiKey}
          mode={config.reoonMode}
          onComplete={(results) => {
            console.log(`Email verification complete: ${results.size} results`);
          }}
        />
      )}

      {currentRows > 0 && (
        <button
          onClick={onNext}
          style={{ background: "#e8ff00", color: "#000", border: "none", padding: "12px 32px", fontSize: "13px", fontWeight: 500, letterSpacing: "0.5px" }}
        >
          NEXT: MAP FIELDS →
        </button>
      )}
    </div>
  );
}
