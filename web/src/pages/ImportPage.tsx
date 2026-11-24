import { useState } from "react";

interface PostingRecord {
  sourceJobId: string;
  title: string;
  employer?: string;
  location?: string;
  country?: string | null;
  url?: string;
  descriptionText?: string;
  descriptionIsFull: boolean;
  postedAt?: string | null;
  employerIndustry?: string | null;
  raw?: unknown;
}

interface ProgressState {
  source: string;
  sent: number;
  total: number;
  chunk: number;
  totalChunks: number;
}

// ── field mappers ────────────────────────────────────────────────────────────

function mapCaPosting(
  r: Record<string, unknown>,
  industryMap: Record<string, string>
): PostingRecord {
  const employer = String(r.company ?? "");
  return {
    sourceJobId: String(r.url ?? ""),
    title: String(r.title ?? ""),
    employer,
    location: String(r.location ?? ""),
    url: String(r.url ?? ""),
    descriptionText: String(r.description ?? ""),
    descriptionIsFull: true,
    employerIndustry: industryMap[employer.toLowerCase()] ?? null,
    raw: r,
  };
}

function mapWorkdayPosting(
  r: Record<string, unknown>,
  industryMap: Record<string, string>
): PostingRecord {
  const employer = String(r.employer ?? "");
  return {
    sourceJobId: String(r.url ?? ""),
    title: String(r.title ?? ""),
    employer,
    location: String(r.location ?? ""),
    country: r.country ? String(r.country) : null,
    url: String(r.url ?? ""),
    descriptionText: stripHtml(String(r.description_html ?? "")),
    descriptionIsFull: true,
    postedAt: isoDate(r.start_date),
    employerIndustry: industryMap[employer.toLowerCase()] ?? null,
    raw: r,
  };
}

// ── utilities ────────────────────────────────────────────────────────────────

function isoDate(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function stripHtml(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inQuotes) {
      inQuotes = true;
    } else if (ch === '"' && inQuotes) {
      if (line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = false;
    } else if (ch === "," && !inQuotes) {
      result.push(field); field = "";
    } else {
      field += ch;
    }
  }
  result.push(field);
  return result;
}

function parseCsv(text: string): Record<string, string> {
  const lines = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  const empIdx = headers.indexOf("employer_lowercase");
  const indIdx = headers.indexOf("my_industry_coding");
  if (empIdx < 0 || indIdx < 0) return {};
  const map: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCsvLine(lines[i]);
    const emp = cols[empIdx]?.trim().toLowerCase();
    const ind = cols[indIdx]?.trim();
    if (emp && ind) map[emp] = ind;
  }
  return map;
}

function toChunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseJsonlRecords<T>(text: string): T[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((l) => {
      try { return [JSON.parse(l) as T]; }
      catch { return []; }
    });
}

// ── component ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [passcode, setPasscode] = useState(
    () => localStorage.getItem("job-agent-passcode") ?? ""
  );
  const [passcodeSaved, setPasscodeSaved] = useState(
    () => !!localStorage.getItem("job-agent-passcode")
  );
  const [researchFiles, setResearchFiles] = useState<FileList | null>(null);
  const [workdayFiles, setWorkdayFiles] = useState<FileList | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  function handleSavePasscode() {
    localStorage.setItem("job-agent-passcode", passcode);
    setPasscodeSaved(true);
  }

  async function sendChunk(
    sourceKey: string,
    records: PostingRecord[],
    pc: string
  ): Promise<string | null> {
    const res = await fetch("/api/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-passcode": pc,
      },
      body: JSON.stringify({ sourceKey, records }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
      return body.error ?? res.statusText;
    }
    return null;
  }

  async function importFile(
    file: File,
    sourceKey: "research_import" | "workday_import",
    industryMap: Record<string, string>,
    pc: string,
    runningErrors: string[]
  ): Promise<number> {
    const text = await file.text();
    const raws = parseJsonlRecords<Record<string, unknown>>(text);
    const records: PostingRecord[] =
      sourceKey === "research_import"
        ? raws.map((r) => mapCaPosting(r, industryMap))
        : raws.map((r) => mapWorkdayPosting(r, industryMap));

    const chunks = toChunks(records, 200);
    let sent = 0;

    for (let i = 0; i < chunks.length; i++) {
      setProgress({
        source: file.name,
        sent,
        total: records.length,
        chunk: i + 1,
        totalChunks: chunks.length,
      });
      const err = await sendChunk(sourceKey, chunks[i], pc);
      if (err) {
        runningErrors.push(`${file.name} chunk ${i + 1}: ${err}`);
      } else {
        sent += chunks[i].length;
      }
    }
    setProgress({
      source: file.name,
      sent,
      total: records.length,
      chunk: chunks.length,
      totalChunks: chunks.length,
    });
    return sent;
  }

  async function handleImport() {
    const pc = localStorage.getItem("job-agent-passcode") ?? "";
    if (!pc) { setErrors(["No passcode saved."]); return; }

    setRunning(true);
    setDone(null);
    setErrors([]);
    setProgress(null);

    const industryMap = csvFile ? parseCsv(await csvFile.text()) : {};
    const runningErrors: string[] = [];
    let totalSent = 0;

    for (const file of Array.from(researchFiles ?? [])) {
      totalSent += await importFile(file, "research_import", industryMap, pc, runningErrors);
    }
    for (const file of Array.from(workdayFiles ?? [])) {
      totalSent += await importFile(file, "workday_import", industryMap, pc, runningErrors);
    }

    setRunning(false);
    setErrors(runningErrors);
    if (runningErrors.length === 0) setDone(`Done — ${totalSent} records upserted.`);
    else setDone(`Finished with ${runningErrors.length} error(s). ${totalSent} records upserted.`);
  }

  const canRun =
    passcodeSaved &&
    !running &&
    ((researchFiles?.length ?? 0) > 0 || (workdayFiles?.length ?? 0) > 0);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>Import Postings</h1>

      {/* Passcode */}
      <section style={styles.section}>
        <h2 style={styles.h2}>Admin passcode</h2>
        <div style={styles.row}>
          <input
            type="password"
            value={passcode}
            onChange={(e) => { setPasscode(e.target.value); setPasscodeSaved(false); }}
            placeholder="Enter passcode"
            style={styles.input}
          />
          <button onClick={handleSavePasscode} disabled={!passcode} style={styles.btn}>
            Save
          </button>
          {passcodeSaved && <span style={styles.ok}>✓ saved</span>}
        </div>
      </section>

      {/* Files */}
      <section style={styles.section}>
        <h2 style={styles.h2}>Files</h2>
        <label style={styles.label}>
          <strong>Research JSONL</strong> — <code>ca_postings_v2.jsonl</code>
          <input
            type="file"
            accept=".jsonl"
            multiple
            onChange={(e) => setResearchFiles(e.target.files)}
            style={styles.fileInput}
          />
        </label>
        <label style={styles.label}>
          <strong>Workday JSONL</strong> — <code>data/sector_fulltext/*.jsonl</code>
          <input
            type="file"
            accept=".jsonl"
            multiple
            onChange={(e) => setWorkdayFiles(e.target.files)}
            style={styles.fileInput}
          />
        </label>
        <label style={styles.label}>
          <strong>Industry CSV</strong> — <code>employer_industry_coding.csv</code> (optional)
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
            style={styles.fileInput}
          />
        </label>
      </section>

      {/* Action */}
      <section style={styles.section}>
        <button onClick={handleImport} disabled={!canRun} style={{ ...styles.btn, ...styles.btnPrimary }}>
          {running ? "Importing…" : "Start import"}
        </button>
      </section>

      {/* Progress */}
      {progress && (
        <section style={styles.progressBox}>
          <strong>{progress.source}</strong>
          <br />
          {progress.sent} / {progress.total} records — chunk {progress.chunk} of {progress.totalChunks}
        </section>
      )}

      {/* Result */}
      {done && <p style={errors.length ? styles.warn : styles.ok}>{done}</p>}
      {errors.length > 0 && (
        <pre style={styles.errorBox}>{errors.join("\n")}</pre>
      )}
    </div>
  );
}

const styles = {
  page: { fontFamily: "system-ui, sans-serif", maxWidth: 600, margin: "2rem auto", padding: "0 1rem" },
  h1: { marginBottom: "1.5rem" },
  h2: { marginBottom: "0.5rem", fontSize: "1rem" },
  section: { marginBottom: "1.5rem" },
  row: { display: "flex", alignItems: "center", gap: "0.5rem" },
  input: { flex: 1, padding: "0.4rem 0.6rem", fontSize: "1rem", border: "1px solid #ccc", borderRadius: 4 },
  btn: { padding: "0.4rem 0.9rem", cursor: "pointer", borderRadius: 4, border: "1px solid #aaa" },
  btnPrimary: { background: "#1a56db", color: "#fff", border: "none", padding: "0.5rem 1.4rem" },
  fileInput: { display: "block", marginTop: "0.3rem" },
  label: { display: "block", marginBottom: "0.9rem" },
  progressBox: { background: "#f0f4ff", padding: "0.8rem 1rem", borderRadius: 4, marginBottom: "1rem" },
  ok: { color: "green" },
  warn: { color: "#c05000" },
  errorBox: { background: "#fff0f0", padding: "0.8rem", borderRadius: 4, color: "red", whiteSpace: "pre-wrap" as const, fontSize: "0.85rem" },
} as const;
