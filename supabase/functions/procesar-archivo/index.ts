// supabase/functions/procesar-archivo/index.ts
// Deno Edge Function — parses an uploaded Excel/CSV file and inserts
// the rows into the transacciones table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─────────────────────────────────────────────
// Column-name normalisation map
// Maps variations found in bank exports → DB column name
// ─────────────────────────────────────────────
const COL_MAP: Record<string, string> = {
  // banco
  banco: "banco",
  bank: "banco",
  // fecha
  fecha: "fecha",
  date: "fecha",
  "fecha operacion": "fecha",
  "fecha de operacion": "fecha",
  "fecha operación": "fecha",
  // no_op
  no_op: "no_op",
  "no op": "no_op",
  "num operacion": "no_op",
  "número de operación": "no_op",
  folio: "no_op",
  referencia: "no_op",
  // descripcion
  descripcion: "descripcion",
  descripción: "descripcion",
  concepto: "descripcion",
  description: "descripcion",
  detalle: "descripcion",
  // importe
  importe: "importe",
  monto: "importe",
  total: "importe",
  amount: "importe",
  cargo: "importe",
  abono: "importe",
  // titular
  titular: "titular",
  usuario: "titular",
  tarjeta: "titular",
  empleado: "titular",
  // efecto
  efecto: "efecto",
  tipo: "efecto",
  "tipo movimiento": "efecto",
  // rfc_emisor
  rfc_emisor: "rfc_emisor",
  rfc: "rfc_emisor",
  "rfc emisor": "rfc_emisor",
  // razon_social
  razon_social: "razon_social",
  "razon social": "razon_social",
  "razón social": "razon_social",
  proveedor: "razon_social",
  // ieps
  ieps: "ieps",
  // iva_8
  iva_8: "iva_8",
  "iva 8": "iva_8",
  "iva8%": "iva_8",
  // iva_16
  iva_16: "iva_16",
  "iva 16": "iva_16",
  "iva16%": "iva_16",
  iva: "iva_16",
  // subtotal
  subtotal: "subtotal",
  // categoria
  categoria: "categoria",
  categoría: "categoria",
  category: "categoria",
  // proyecto
  proyecto: "proyecto",
  obra: "proyecto",
  project: "proyecto",
  // frente
  frente: "frente",
  // documento
  documento: "documento",
  factura: "documento",
  "num factura": "documento",
};

function normKey(k: string): string {
  return k.toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeHeader(h: string): string {
  const k = normKey(h);
  return COL_MAP[k] ?? k;
}

/** Parse a simple CSV string into an array of objects. */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    if (cells.every((c) => !c)) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = cells[j] ?? ""; });
    rows.push(row);
  }
  return rows;
}

/** Map raw parsed row to DB schema. */
function mapRow(raw: Record<string, string>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const dbCol = normalizeHeader(k);
    if (!v || v === "") continue;
    // Numeric columns
    if (["importe","ieps","iva_8","iva_16","subtotal","total"].includes(dbCol)) {
      const n = parseFloat(String(v).replace(/,/g, ""));
      if (!isNaN(n)) mapped[dbCol] = n;
    } else if (dbCol === "fecha") {
      // Accept ISO (YYYY-MM-DD) or localised (DD/MM/YYYY)
      const parts = v.match(/(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (parts) {
        const [, a, b, c] = parts;
        if (a.length === 4) {
          mapped[dbCol] = `${a}-${b.padStart(2,"0")}-${c.padStart(2,"0")}`;
        } else {
          mapped[dbCol] = `${c}-${b.padStart(2,"0")}-${a.padStart(2,"0")}`;
        }
      } else {
        mapped[dbCol] = v;
      }
    } else {
      mapped[dbCol] = v;
    }
  }
  return mapped;
}

Deno.serve(async (req: Request) => {
  // Handle CORS pre-flight
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
      return new Response(JSON.stringify({ error: "No file uploaded. Use field name 'file'." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const fileName = file.name.toLowerCase();
    let rawRows: Record<string, string>[] = [];

    if (fileName.endsWith(".csv")) {
      const text = await file.text();
      rawRows = parseCSV(text);
    } else {
      // For Excel files, return a helpful error — full XLSX parsing in Deno
      // requires a binary dependency. Clients should convert to CSV first,
      // or use the local JS parser and call saveTransacciones() directly.
      return new Response(
        JSON.stringify({
          error: "Excel parsing is not supported server-side. Please upload a CSV file, or use the local parser in the browser and call saveTransacciones() directly.",
        }),
        { status: 415, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    if (rawRows.length === 0) {
      return new Response(JSON.stringify({ inserted: 0, errors: ["No data rows found in file."] }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const dbRows = rawRows.map(mapRow);
    const errors: unknown[] = [];
    let inserted = 0;
    const CHUNK = 500;

    for (let i = 0; i < dbRows.length; i += CHUNK) {
      const chunk = dbRows.slice(i, i + CHUNK);
      const { data, error } = await sb.from("transacciones").insert(chunk).select();
      if (error) {
        errors.push({ chunk: Math.floor(i / CHUNK), message: error.message });
      } else {
        inserted += (data ?? []).length;
      }
    }

    return new Response(JSON.stringify({ inserted, errors }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
