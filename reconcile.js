// Payment reconciliation.
//
// Reads payments.jsonl and works out how much money we actually collected.
// Run:  node reconcile.js

const fs = require("fs");

function parseTs(v) {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  if (typeof v === "number") return v > 1e11 ? v : v * 1000;
  let s = String(v).trim();
  if (!s) return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n > 1e11 ? n : n * 1000;
  }
  // No timezone given: treat as UTC (README says ts is UTC)
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s = s.replace(" ", "T") + "Z";
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

function parseAmountKobo(v) {
  if (v === null || v === undefined || typeof v === "boolean") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const text = fs.readFileSync("payments.jsonl", "utf8").replace(/^\uFEFF/, "");
const latest = new Map(); // txn_id -> latest attempt

text.split("\n").forEach((raw, idx) => {
  const line = raw.trim();
  if (!line) return;

  let ev;
  try {
    ev = JSON.parse(line);
  } catch {
    return; // unreadable line: ignore
  }
  if (ev === null || typeof ev !== "object" || Array.isArray(ev)) return;

  let id = ev.txn_id;
  if (id === null || id === undefined || (typeof id === "string" && !id.trim())) return; // no txn_id: ignore
  id = String(id);

  const ts = parseTs(ev.ts);
  const t = ts === null ? -Infinity : ts;
  const status = String(ev.status ?? "").trim().toLowerCase();
  const prev = latest.get(id);

  // Latest ts wins; ties fall back to later file position
  if (!prev || t > prev.ts || (t === prev.ts && idx > prev.idx)) {
    latest.set(id, { ts: t, idx, status, kobo: parseAmountKobo(ev.amount) });
  }
});

let count = 0;
let totalKobo = 0;
for (const e of latest.values()) {
  if (e.status === "success") {
    count++;
    totalKobo += e.kobo;
  }
}

const expected = parseInt(fs.readFileSync("expected.txt", "utf8").trim(), 10);

if (count !== expected) {
  console.log(`Check failed: counted ${count} successful payments, expected ${expected}.`);
  console.log("Something in the data isn't being handled the way the README describes.");
} else {
  console.log(`Check passed: ${count} successful payments.`);
  console.log(`Your code: KOYA-${Math.round(totalKobo / 100)}`);
}
