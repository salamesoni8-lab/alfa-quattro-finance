// data.js — Lectura y normalización de archivos Excel + Supabase integration
// Parser inteligente: detecta automáticamente las 19 columnas requeridas,
// ignora columnas extra, elimina duplicados por NO_OP, filtra EFECTO=INGRESO,
// normaliza PROYECTO y fechas a YYYY-MM-DD.

let FILES_RAW = [null, null];
let PERIODS   = [null, null];
let P_NAMES   = ['P1', 'P2'];

function triggerFile(i) {
  const inp = document.getElementById('fi' + i);
  inp.value = ''; inp.click();
}

function onFile(i, inp) {
  if (!inp.files[0]) return;
  FILES_RAW[i] = inp.files[0];
  const slot = document.getElementById('slot' + i);
  slot.classList.add('loaded');
  document.getElementById('sn' + i).textContent = '✓ ' + inp.files[0].name;
  if (FILES_RAW[0]) document.getElementById('btnAnalizar').disabled = false;
}

// Drag & Drop
[0,1].forEach(i => {
  const s = document.getElementById('slot' + i);
  s.addEventListener('dragover', e => { e.preventDefault(); s.classList.add('over'); });
  s.addEventListener('dragleave', () => s.classList.remove('over'));
  s.addEventListener('drop', e => {
    e.preventDefault(); s.classList.remove('over');
    const f = e.dataTransfer.files[0]; if (!f) return;
    FILES_RAW[i] = f;
    s.classList.add('loaded');
    document.getElementById('sn' + i).textContent = '✓ ' + f.name;
    if (FILES_RAW[0]) document.getElementById('btnAnalizar').disabled = false;
  });
});

async function startAnalysis() {
  show('loadScreen');
  const toLoad = FILES_RAW.filter(Boolean);
  const useEdge = !!(CONFIG.supabase.url && CONFIG.supabase.anonKey);

  for (let i = 0; i < toLoad.length; i++) {
    const file = toLoad[i];
    P_NAMES[i] = file.name.replace(/\.(xlsx?|csv)$/i, '').slice(0, 22).toUpperCase();

    if (useEdge) {
      try {
        setLoad(`SUBIENDO ARCHIVO ${i+1} DE ${toLoad.length}...`, 5);
        const result = await uploadToEdgeFunction(file, (uploadPct, phase) => {
          if (phase === 'upload') {
            // upload byte transfer: 5% → 65%
            setLoad(`SUBIENDO ARCHIVO ${i+1} DE ${toLoad.length} · ${uploadPct}%`, 5 + uploadPct * 0.6);
          } else {
            // server processing: 65% → 88%, animated by timer inside uploadToEdgeFunction
            setLoad('ANALIZANDO Y GUARDANDO EN SUPABASE...', uploadPct);
          }
        });
        PERIODS[i] = (result.rows || []).map(edgeRowToLocal).filter(r => r.importe > 0);
        console.log(`[Edge] Archivo ${i+1}: ${result.inserted} nuevas, ${result.after_filter} procesadas.`);
      } catch (err) {
        console.warn('[Edge] Error, usando parser local:', err.message);
        setLoad(`PROCESANDO LOCALMENTE...`, 40 + i*25);
        PERIODS[i] = await readExcel(file);
        if (PERIODS[i]?.length > 0) {
          saveTransacciones(PERIODS[i].map(r => toDbRow(r)))
            .catch(e => console.warn('[Supabase]', e));
        }
      }
    } else {
      // Local mode (no Supabase configured)
      setLoad(`PROCESANDO ARCHIVO ${i+1} DE ${toLoad.length}...`, 15 + i*40);
      PERIODS[i] = await readExcel(file);
    }
  }

  if (!FILES_RAW[1]) PERIODS[1] = null;
  setLoad('CALCULANDO MÉTRICAS...', 94);
  await sleep(200);
  setLoad('LISTO', 100);
  await sleep(300);
  initDash();
}

/**
 * Upload a file to the Edge Function via XHR.
 * Calls onProgress(pct, 'upload') during byte transfer (0-100).
 * Calls onProgress(pct, 'server') during server processing (65-88).
 * Returns the parsed response JSON.
 */
function uploadToEdgeFunction(file, onProgress) {
  return new Promise((resolve, reject) => {
    const url = `${CONFIG.supabase.url}/functions/v1/procesar-archivo`;
    const fd = new FormData();
    fd.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${CONFIG.supabase.anonKey}`);
    xhr.setRequestHeader('apikey', CONFIG.supabase.anonKey);
    xhr.timeout = 180000; // 3 min for very large files

    // Real upload progress (byte transfer)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100), 'upload');
    };

    // Once upload is complete, animate the bar while server processes
    let processingTimer = null;
    let serverPct = 65;
    xhr.upload.onload = () => {
      serverPct = 65;
      processingTimer = setInterval(() => {
        serverPct = Math.min(88, serverPct + 0.3);
        onProgress(Math.round(serverPct), 'server');
      }, 100);
    };

    xhr.onload = () => {
      if (processingTimer) clearInterval(processingTimer);
      try {
        const result = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(result);
        } else {
          reject(new Error(result.error || `HTTP ${xhr.status}`));
        }
      } catch (e) {
        reject(new Error(`Respuesta inválida del servidor: ${xhr.responseText.slice(0, 200)}`));
      }
    };

    xhr.onerror   = () => { if (processingTimer) clearInterval(processingTimer); reject(new Error('Error de red')); };
    xhr.ontimeout = () => { if (processingTimer) clearInterval(processingTimer); reject(new Error('Tiempo de espera agotado (>3 min)')); };

    xhr.send(fd);
  });
}

/**
 * Convert a row returned by the Edge Function into the local dashboard format.
 */
function edgeRowToLocal(r) {
  return {
    banco:        r.banco        || '',
    fecha:        r.fecha        || '',
    no_op:        r.no_op        || '',
    descripcion:  r.descripcion  || '',
    importe:      parseFloat(r.importe)  || 0,
    titular:      r.titular      || '',
    efecto:       r.efecto       || '',
    uuid:         r.uuid         || '',
    rfc_emisor:   r.rfc_emisor   || '',
    razon_social: r.razon_social || '',
    ieps:         parseFloat(r.ieps)     || 0,
    iva_8:        parseFloat(r.iva_8)    || 0,
    iva_16:       parseFloat(r.iva_16)   || 0,
    subtotal:     parseFloat(r.subtotal) || 0,
    total:        parseFloat(r.total)    || 0,
    categoria:    r.categoria    || 'Sin categoría',
    proyecto:     r.proyecto     || '',
    frente:       r.frente       || '',
    documento:    r.documento    || '',
    fechaObj:     r.fecha ? new Date(r.fecha) : null,
    tarjeta:      r.titular      || '', // alias for dashboard compatibility
  };
}

/**
 * Map a normalised local row to the transacciones DB schema (all 19 columns).
 */
function toDbRow(r) {
  return {
    banco:        r.banco        || null,
    fecha:        r.fecha        || null,   // already YYYY-MM-DD from normalize()
    no_op:        r.no_op        || null,
    descripcion:  r.descripcion  || null,
    importe:      r.importe      || null,
    titular:      r.titular      || null,
    efecto:       r.efecto       || null,
    uuid:         r.uuid         || null,
    rfc_emisor:   r.rfc_emisor   || null,
    razon_social: r.razon_social || null,
    ieps:         r.ieps         || null,
    iva_8:        r.iva_8        || null,
    iva_16:       r.iva_16       || null,
    subtotal:     r.subtotal     || null,
    total:        r.total        || null,
    categoria:    r.categoria    || null,
    proyecto:     r.proyecto     || null,
    frente:       r.frente       || null,
    documento:    r.documento    || null,
  };
}

/**
 * Load all transacciones from Supabase and populate PERIODS[0].
 * Returns true if data was loaded, false if empty or on error.
 */
async function loadFromSupabase() {
  try {
    const { data, error } = await getTransacciones();
    if (error || !data || data.length === 0) return false;

    // Convert DB rows back to the local row format expected by the dashboard
    const rows = data.map(r => ({
      banco:        r.banco        || '',
      fecha:        r.fecha        || '',
      no_op:        r.no_op        || '',
      descripcion:  r.descripcion  || '',
      importe:      parseFloat(r.importe) || 0,
      titular:      r.titular      || '',
      efecto:       r.efecto       || '',
      uuid:         r.uuid         || '',
      rfc_emisor:   r.rfc_emisor   || '',
      razon_social: r.razon_social || '',
      ieps:         parseFloat(r.ieps)    || 0,
      iva_8:        parseFloat(r.iva_8)   || 0,
      iva_16:       parseFloat(r.iva_16)  || 0,
      subtotal:     parseFloat(r.subtotal)|| 0,
      total:        parseFloat(r.total)   || 0,
      categoria:    r.categoria    || 'Sin categoría',
      proyecto:     r.proyecto     || '',
      frente:       r.frente       || '',
      documento:    r.documento    || '',
      // Dashboard helpers
      fechaObj: r.fecha ? new Date(r.fecha) : null,
      tarjeta:  r.titular || '',
    })).filter(r => r.importe > 0);

    if (rows.length === 0) return false;

    PERIODS[0] = rows;
    P_NAMES[0] = 'SUPABASE';
    FILES_RAW[0] = true;
    return true;
  } catch (err) {
    console.warn('[Supabase] loadFromSupabase failed:', err);
    return false;
  }
}

// ─────────────────────────────────────────────
// Smart parser — column name mapping
// ─────────────────────────────────────────────
const _DB_COLUMNS = new Set([
  'banco','fecha','no_op','descripcion','importe','titular',
  'efecto','uuid','rfc_emisor','razon_social','ieps','iva_8',
  'iva_16','subtotal','total','categoria','proyecto','frente','documento',
]);

const _NUMERIC_COLS = new Set(['importe','ieps','iva_8','iva_16','subtotal','total']);

const _COL_MAP = {
  banco:'banco', bank:'banco', 'banco emisor':'banco',
  fecha:'fecha', date:'fecha', 'fecha operacion':'fecha',
  'fecha de operacion':'fecha', 'fecha operacion':'fecha',
  no_op:'no_op', 'no op':'no_op', 'num operacion':'no_op',
  'numero de operacion':'no_op', folio:'no_op', referencia:'no_op',
  'no. referencia':'no_op',
  descripcion:'descripcion', descripcion:'descripcion',
  concepto:'descripcion', description:'descripcion', detalle:'descripcion',
  'descripcion del movimiento':'descripcion',
  importe:'importe', monto:'importe', amount:'importe',
  cargo:'importe', abono:'importe', 'monto operacion':'importe',
  titular:'titular', usuario:'titular', tarjeta:'titular', empleado:'titular',
  'nombre titular':'titular',
  efecto:'efecto', tipo:'efecto', 'tipo movimiento':'efecto',
  'tipo de movimiento':'efecto', 'tipo de transaccion':'efecto',
  uuid:'uuid', 'uuid transaccion':'uuid', 'id transaccion':'uuid',
  'clave rastreo':'uuid', 'clave de rastreo':'uuid',
  rfc_emisor:'rfc_emisor', rfc:'rfc_emisor', 'rfc emisor':'rfc_emisor',
  razon_social:'razon_social', 'razon social':'razon_social', proveedor:'razon_social',
  ieps:'ieps', 'ieps trasladado':'ieps',
  iva_8:'iva_8', 'iva 8':'iva_8', 'iva 8%':'iva_8', 'iva8%':'iva_8',
  iva_16:'iva_16', 'iva 16':'iva_16', 'iva 16%':'iva_16', 'iva16%':'iva_16', iva:'iva_16',
  subtotal:'subtotal', 'sub total':'subtotal',
  total:'total',
  categoria:'categoria', category:'categoria', giro:'categoria',
  proyecto:'proyecto', obra:'proyecto', project:'proyecto',
  frente:'frente', 'frente de trabajo':'frente',
  documento:'documento', factura:'documento', 'num factura':'documento',
  'folio fiscal':'documento',
};

function _normKey(k) {
  return String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ');
}

function _resolveHeader(h) {
  const nk = _normKey(h);
  if (_COL_MAP[nk]) return _COL_MAP[nk];
  if (_DB_COLUMNS.has(nk)) return nk;
  return null;
}

function _normalizeDate(v) {
  if (v instanceof Date && !isNaN(v)) {
    const y = v.getFullYear();
    const m = String(v.getMonth()+1).padStart(2,'0');
    const d = String(v.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number') {
    return _normalizeDate(new Date(Math.round((v-25569)*86400000)));
  }
  const s = String(v||'').trim();
  if (!s) return null;
  let match = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
  match = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
  return s;
}

function readExcel(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type:'binary', cellDates:true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });

        // Auto-detect header row (first row with a recognised column name)
        let hr = 0;
        for (let i = 0; i < Math.min(15, raw.length); i++) {
          if (raw[i] && raw[i].some(c => _resolveHeader(String(c||'')) !== null)) { hr=i; break; }
        }
        const headers = (raw[hr]||[]).map(h => h ? String(h).trim() : '');
        const rawRows = [];
        for (let i = hr+1; i < raw.length; i++) {
          if (!raw[i] || raw[i].every(c => c==='' || c===null || c===undefined)) continue;
          const o = {}; headers.forEach((h,j) => { o[h] = raw[i][j]; }); rawRows.push(o);
        }
        res(normalize(rawRows));
      } catch(err) { rej(err); }
    };
    reader.readAsBinaryString(file);
  });
}

/**
 * Normalise raw rows from bank Excel:
 *  - Map to 19 DB columns, ignore extras
 *  - Filter EFECTO = 'INGRESO'
 *  - Deduplicate by NO_OP
 *  - Normalise PROYECTO (uppercase, trim)
 *  - Normalise FECHA → YYYY-MM-DD
 *  - Remove completely empty rows
 */
function normalize(rows) {
  if (!rows.length) return [];

  // Build header→dbCol map from first row keys
  const sampleKeys = Object.keys(rows[0]);
  const headerMap = {};
  for (const h of sampleKeys) {
    const db = _resolveHeader(h);
    if (db) headerMap[h] = db;
  }

  const seenNoOp = new Set();
  const result = [];

  for (const raw of rows) {
    const r = {};
    for (const [rawCol, dbCol] of Object.entries(headerMap)) {
      const v = raw[rawCol];
      if (v === null || v === undefined || v === '') continue;
      if (_NUMERIC_COLS.has(dbCol)) {
        const n = parseFloat(String(v).replace(/,/g,''));
        if (!isNaN(n)) r[dbCol] = n;
      } else if (dbCol === 'fecha') {
        const d = _normalizeDate(v);
        if (d) r[dbCol] = d;
      } else if (dbCol === 'proyecto') {
        r[dbCol] = String(v).trim().toUpperCase().replace(/\s+/g,' ');
      } else {
        r[dbCol] = String(v).trim();
      }
    }

    if (Object.keys(r).length === 0) continue;

    // Filter: only EFECTO = 'INGRESO'
    const efecto = String(r.efecto||'').trim().toUpperCase();
    if (efecto && efecto !== 'INGRESO') continue;

    // Deduplicate by NO_OP
    const noOp = String(r.no_op||'').trim();
    if (noOp) {
      if (seenNoOp.has(noOp)) continue;
      seenNoOp.add(noOp);
    }

    // Build dashboard-compatible row (adds fechaObj and tarjeta alias)
    result.push({
      // All 19 DB columns
      banco:        r.banco        || '',
      fecha:        r.fecha        || '',
      no_op:        r.no_op        || '',
      descripcion:  r.descripcion  || '',
      importe:      r.importe      || 0,
      titular:      r.titular      || '',
      efecto:       r.efecto       || '',
      uuid:         r.uuid         || '',
      rfc_emisor:   r.rfc_emisor   || '',
      razon_social: r.razon_social || '',
      ieps:         r.ieps         || 0,
      iva_8:        r.iva_8        || 0,
      iva_16:       r.iva_16       || 0,
      subtotal:     r.subtotal     || 0,
      total:        r.total        || 0,
      categoria:    r.categoria    || 'Sin categoría',
      proyecto:     r.proyecto     || '',
      frente:       r.frente       || '',
      documento:    r.documento    || '',
      // Dashboard helpers
      fechaObj: r.fecha ? new Date(r.fecha) : null,
      tarjeta:  r.titular || '',  // alias kept for dashboard compatibility
    });
  }

  return result.filter(r => r.importe > 0);
}

function getAllData() {
  const a = (PERIODS[0]||[]).map(r => ({...r, _period: P_NAMES[0], _pidx: 0}));
  const b = (PERIODS[1]||[]).map(r => ({...r, _period: P_NAMES[1], _pidx: 1}));
  return [...a, ...b];
}

function loadDemo() {
  show('loadScreen'); setLoad('GENERANDO DEMO...', 30);
  setTimeout(() => {
    PERIODS[0] = genDemo(new Date(2026,0,1), 31, 1.0);
    PERIODS[1] = genDemo(new Date(2026,1,1), 28, 1.12);
    P_NAMES = ['ENERO 2026', 'FEBRERO 2026'];
    FILES_RAW = [true, true];
    setLoad('LISTO', 100);
    setTimeout(initDash, 300);
  }, 600);
}

function genDemo(base, dias, mult) {
  const cats = ['COMBUSTIBLES','CONTRATISTAS Y CONSTR','MATERIAL','HERRAMIENTA','VIATICOS','FLETES'];
  const proys = ['5294-POWERCHINA','5301-SEMARNAT','5288-CAPUFE','5310-CFE'];
  const frentes = ['01-MATERIAL','07-COMBUSTIBLE','02-OTROS','03-HERRAMIENTA','04-VIATICOS'];
  const descs = {
    'COMBUSTIBLES':['GAS PETROPLAZAS 9758','GAS PETROPLAZAS MOCORITO','PEMEX DIESEL','BIDON COMBUSTIBLE'],
    'CONTRATISTAS Y CONSTR':['FERRETERIA FERRELEK','REFACCIONARIA YAALE','MATERIALES SA','BLOCK Y CONCRETO'],
    'MATERIAL':['CEMEX','ACEROS DEL NORTE','VARILLA TRUPER','ARENA Y GRAVA'],
    'HERRAMIENTA':['TRUPER','FERRECENTRO','STANLEY TOOLS','DEWALT'],
    'VIATICOS':['HOTEL PREMIER','RESTAURANTE EL RANCHO','OXXO','UBER'],
    'FLETES':['TRANSPORTES GARCIA','FLETES NORTE','CARGA PESADA'],
  };
  const users = ['5803 | Oscar Hernandez','5712 | Maria Lopez','5891 | Juan Perez','5634 | Carlos Ruiz'];
  const rows = [];
  for (let i = 0; i < Math.floor(300*mult); i++) {
    const cat = cats[Math.floor(Math.random()*cats.length)];
    const d = new Date(base.getTime() + Math.random()*(dias-1)*86400000);
    const desc = descs[cat][Math.floor(Math.random()*descs[cat].length)];
    const imp = Math.round((Math.random()*3000+200)*100)/100 * mult;
    const isOut = Math.random() < 0.04;
    rows.push({
      fecha: d.toLocaleDateString('es-MX'), fechaObj: d,
      descripcion: desc, importe: isOut ? imp*7 : imp,
      categoria: cat, proyecto: proys[Math.floor(Math.random()*proys.length)],
      frente: frentes[Math.floor(Math.random()*frentes.length)],
      tarjeta: users[Math.floor(Math.random()*users.length)], banco: 'Clara Tech 645',
    });
  }
  return rows;
}
