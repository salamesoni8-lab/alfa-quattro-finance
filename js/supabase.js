// supabase.js — Supabase client and data access layer
// Depends on: CONFIG (config/config.js) and the Supabase CDN bundle

const { createClient } = supabase;

const _sb = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);

/**
 * Fetch all rows from transacciones, with optional filters.
 * @param {Object} filters  Optional key/value pairs to filter by (eq)
 * @returns {Promise<{data: Array, error: any}>}
 */
async function getTransacciones(filters = {}) {
  try {
    let query = _sb.from('transacciones').select('*');

    Object.entries(filters).forEach(([col, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        query = query.eq(col, val);
      }
    });

    const { data, error } = await query;
    if (error) {
      console.error('[Supabase] getTransacciones error:', error.message);
      return { data: [], error };
    }
    return { data: data || [], error: null };
  } catch (err) {
    console.error('[Supabase] getTransacciones exception:', err);
    return { data: [], error: err };
  }
}

/**
 * Insert a single row into transacciones.
 * @param {Object} row  Row object matching the transacciones schema
 * @returns {Promise<{data: Object|null, error: any}>}
 */
async function saveTransaccion(row) {
  try {
    const { data, error } = await _sb
      .from('transacciones')
      .insert([row])
      .select()
      .single();

    if (error) {
      console.error('[Supabase] saveTransaccion error:', error.message);
      return { data: null, error };
    }
    return { data, error: null };
  } catch (err) {
    console.error('[Supabase] saveTransaccion exception:', err);
    return { data: null, error: err };
  }
}

/**
 * Batch-insert multiple rows into transacciones.
 * Supabase handles up to ~1 000 rows per request; for larger sets we chunk.
 * @param {Array<Object>} rows
 * @returns {Promise<{inserted: number, errors: Array}>}
 */
async function saveTransacciones(rows) {
  if (!rows || rows.length === 0) return { inserted: 0, errors: [] };

  const CHUNK = 500;
  let inserted = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    try {
      const { data, error } = await _sb
        .from('transacciones')
        .insert(chunk)
        .select();

      if (error) {
        console.error('[Supabase] saveTransacciones chunk error:', error.message);
        errors.push({ chunk: i / CHUNK, error: error.message });
      } else {
        inserted += (data || []).length;
      }
    } catch (err) {
      console.error('[Supabase] saveTransacciones exception:', err);
      errors.push({ chunk: i / CHUNK, error: err.message || String(err) });
    }
  }

  return { inserted, errors };
}
