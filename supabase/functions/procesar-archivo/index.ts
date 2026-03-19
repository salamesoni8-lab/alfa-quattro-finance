// supabase/functions/procesar-archivo/index.ts
// Deno Edge Function — parses an uploaded Excel/CSV file (straight from the
// bank, no manual cleaning required) and inserts INGRESO rows into the
// transacciones table.
//
// Supports:
//  • .xlsx / .xls  (parsed with the XLSX library via esm.sh)
//  • .csv          (built-in parser)
//
// Data-quality steps applied automatically:
//  1. Detect the 19 required columns by header name (extras are ignored)
//  2. Remove completely empty rows
//  3. Filter: only rows where EFECTO = 'INGRESO' (case-insensitive)
//  4. Deduplicate by NO_OP (first occurrence wins)
//  5. Normalise PROYECTO → MAYÚSCULAS, sin espacios extra
//  6. Normalise FECHA → YYYY-MM-DD

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// XLSX works in Deno via esm.sh (CommonJS shim is handled automatically)
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─────────────────────────────────────────────
// The 19 canonical DB columns
// ─────────────────────────────────────────────
const DB_COLUMNS = new Set([
  "banco", "fecha", "no_op", "descripcion", "importe", "titular",
  "efecto", "uuid", "rfc_emisor", "razon_social", "ieps", "iva_8",
  "iva_16", "subtotal", "total", "categoria", "proyecto", "frente", "documento",
]);

const NUMERIC_COLS = new Set(["importe", "ieps", "iva_8", "iva_16", "subtotal", "total"]);

// ─────────────────────────────────────────────
// Header → DB column name mapping
// Covers the most common variations in Mexican bank exports.
// ─────────────────────────────────────────────
const COL_MAP: Record<string, string> = {
  // banco
  banco: "banco",
  bank: "banco",
  "banco emisor": "banco",
  // fecha
  fecha: "fecha",
  date: "fecha",
  "fecha operacion": "fecha",
  "fecha de operacion": "fecha",
  "fecha operación": "fecha",
  "fecha de operación": "fecha",
  // no_op
  no_op: "no_op",
  "no op": "no_op",
  "num operacion": "no_op",
  "número de operación": "no_op",
  "numero de operacion": "no_op",
  "num. operacion": "no_op",
  folio: "no_op",
  referencia: "no_op",
  "no. referencia": "no_op",
  // descripcion
  descripcion: "descripcion",
  descripción: "descripcion",
  concepto: "descripcion",
  description: "descripcion",
  detalle: "descripcion",
  "descripcion del movimiento": "descripcion",
  "descripción del movimiento": "descripcion",
  // importe
  importe: "importe",
  monto: "importe",
  amount: "importe",
  cargo: "importe",
  abono: "importe",
  "monto operacion": "importe",
  "monto de la operacion": "importe",
  // titular
  titular: "titular",
  usuario: "titular",
  tarjeta: "titular",
  empleado: "titular",
  "nombre titular": "titular",
  "titular de la cuenta": "titular",
  // efecto
  efecto: "efecto",
  tipo: "efecto",
  "tipo movimiento": "efecto",
  "tipo de movimiento": "efecto",
  "tipo de transaccion": "efecto",
  "tipo de transacción": "efecto",
  // uuid
  uuid: "uuid",
  "uuid transaccion": "uuid",
  "uuid transacción": "uuid",
  "id transaccion": "uuid",
  "id transacción": "uuid",
  "clave rastreo": "uuid",
  "clave de rastreo": "uuid",
  // rfc_emisor
  rfc_emisor: "rfc_emisor",
  rfc: "rfc_emisor",
  "rfc emisor": "rfc_emisor",
  "rfc del emisor": "rfc_emisor",
  // razon_social
  razon_social: "razon_social",
  "razon social": "razon_social",
  "razón social": "razon_social",
  proveedor: "razon_social",
  "nombre proveedor": "razon_social",
  // ieps
  ieps: "ieps",
  "ieps trasladado": "ieps",
  // iva_8
  iva_8: "iva_8",
  "iva 8": "iva_8",
  "iva 8%": "iva_8",
  "iva8%": "iva_8",
  "iva al 8": "iva_8",
  // iva_16
  iva_16: "iva_16",
  "iva 16": "iva_16",
  "iva 16%": "iva_16",
  "iva16%": "iva_16",
  "iva al 16": "iva_16",
  iva: "iva_16",
  // subtotal
  subtotal: "subtotal",
  "sub total": "subtotal",
  // total
  total: "total",
  "total operacion": "total",
  "total de la operacion": "total",
  // categoria
  categoria: "categoria",
  categoría: "categoria",
  category: "categoria",
  giro: "categoria",
  // proyecto
  proyecto: "proyecto",
  obra: "proyecto",
  project: "proyecto",
  "numero de obra": "proyecto",
  "número de obra": "proyecto",
  // frente
  frente: "frente",
  "frente de trabajo": "frente",
  // documento
  documento: "documento",
  factura: "documento",
  "num factura": "documento",
  "número de factura": "documento",
  "num. factura": "documento",
  "folio fiscal": "documento",
};

/** Normalise a raw header string for lookup. */
function normKey(k: string): string {
  return String(k)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // strip diacritics for resilience
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Given a raw header, return the DB column name or null if not in the 19.
 * We first try the exact normalised key, then try stripping diacritics from
 * the original COL_MAP keys so accented/unaccented variants all match.
 */
function resolveHeader(h: string): string | null {
  const nk = normKey(h);
  // Direct lookup (COL_MAP keys are already lowercase/diacriticless)
  if (COL_MAP[nk]) return COL_MAP[nk];
  // Also check if the raw DB column name is used directly
  if (DB_COLUMNS.has(nk)) return nk;
  return null;
}

// ─────────────────────────────────────────────
// Date normalisation → YYYY-MM-DD
// ─────────────────────────────────────────────
function normalizeDate(v: unknown): string | null {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400000));
    return normalizeDate(d);
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return s; // fallback: keep as-is, Postgres will reject if invalid
}

// ─────────────────────────────────────────────
// Parse CSV (handles quoted fields)
// ─────────────────────────────────────────────
function parseCSV(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim());
  if (nonEmpty.length < 2) return [];
  const splitLine = (line: string): string[] => {
    const res: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        res.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    res.push(cur);
    return res.map((s) => s.trim());
  };
  const headers = splitLine(nonEmpty[0]);
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const cells = splitLine(nonEmpty[i]);
    if (cells.every((c) => !c)) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => { row[h] = cells[j] ?? ""; });
    rows.push(row);
  }
  return rows;
}

// ─────────────────────────────────────────────
// Parse Excel (.xlsx / .xls) with XLSX library
// ─────────────────────────────────────────────
function parseExcel(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // sheet_to_json with header:1 returns arrays per row
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (raw.length < 2) return [];

  // Find the header row (first row containing one of our known column names)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(15, raw.length); i++) {
    const row = raw[i] as unknown[];
    if (row.some((c) => resolveHeader(String(c ?? "")) !== null)) {
      headerIdx = i;
      break;
    }
  }

  const headers = (raw[headerIdx] as unknown[]).map((h) => String(h ?? "").trim());
  const rows: Record<string, unknown>[] = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const cells = raw[i] as unknown[];
    if (cells.every((c) => c === "" || c === null || c === undefined)) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => { row[h] = cells[j]; });
    rows.push(row);
  }
  return rows;
}

// ─────────────────────────────────────────────
// Transform raw rows into DB-ready rows
// ─────────────────────────────────────────────
function transformRows(rawRows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (rawRows.length === 0) return [];

  // Build column → DB mapping from the first row's headers
  const sampleKeys = Object.keys(rawRows[0]);
  const headerMap: Record<string, string> = {};
  for (const h of sampleKeys) {
    const db = resolveHeader(h);
    if (db) headerMap[h] = db;
  }

  const seenNoOp = new Set<string>();
  const result: Record<string, unknown>[] = [];

  for (const raw of rawRows) {
    // 1. Map to DB columns (ignore unmapped columns)
    const row: Record<string, unknown> = {};
    for (const [rawCol, dbCol] of Object.entries(headerMap)) {
      const v = raw[rawCol];
      if (v === null || v === undefined || v === "") continue;

      if (NUMERIC_COLS.has(dbCol)) {
        const n = parseFloat(String(v).replace(/,/g, ""));
        if (!isNaN(n)) row[dbCol] = n;
      } else if (dbCol === "fecha") {
        const d = normalizeDate(v);
        if (d) row[dbCol] = d;
      } else if (dbCol === "proyecto") {
        row[dbCol] = String(v).trim().toUpperCase().replace(/\s+/g, " ");
      } else {
        row[dbCol] = String(v).trim();
      }
    }

    // 2. Skip completely empty rows
    if (Object.keys(row).length === 0) continue;

    // 3. Filter: only EFECTO = 'INGRESO'
    const efecto = String(row["efecto"] ?? "").trim().toUpperCase();
    if (efecto && efecto !== "INGRESO") continue;

    // 4. Deduplicate by NO_OP (skip rows with a NO_OP we've already seen)
    const noOp = String(row["no_op"] ?? "").trim();
    if (noOp) {
      if (seenNoOp.has(noOp)) continue;
      seenNoOp.add(noOp);
    }

    result.push(row);
  }

  return result;
}

// ─────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const sb = createClient(supabaseUrl, supabaseKey);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "No file uploaded. Use form field name 'file'." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const fileName = file.name.toLowerCase();
    let rawRows: Record<string, unknown>[] = [];

    if (fileName.endsWith(".csv")) {
      const text = await file.text();
      rawRows = parseCSV(text);
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      rawRows = parseExcel(buffer);
    } else {
      return new Response(
        JSON.stringify({ error: `Unsupported file type: ${file.name}. Upload .xlsx, .xls or .csv.` }),
        { status: 415, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const dbRows = transformRows(rawRows);

    if (dbRows.length === 0) {
      return new Response(
        JSON.stringify({ inserted: 0, skipped: rawRows.length, errors: [], message: "No INGRESO rows found after filtering and deduplication." }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const errors: unknown[] = [];
    let inserted = 0;
    const CHUNK = 500;

    for (let i = 0; i < dbRows.length; i += CHUNK) {
      const chunk = dbRows.slice(i, i + CHUNK);
      const { data, error } = await sb
        .from("transacciones")
        .upsert(chunk, { onConflict: "no_op", ignoreDuplicates: true })
        .select();
      if (error) {
        errors.push({ chunk: Math.floor(i / CHUNK), message: error.message });
      } else {
        inserted += (data ?? []).length;
      }
    }

    return new Response(
      JSON.stringify({ inserted, total_parsed: rawRows.length, after_filter: dbRows.length, errors, rows: dbRows }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
