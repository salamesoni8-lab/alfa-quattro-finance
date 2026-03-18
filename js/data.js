// data.js — Lectura y normalización de archivos Excel + Supabase integration

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
  for (let i = 0; i < toLoad.length; i++) {
    setLoad(`PROCESANDO ARCHIVO ${i+1} DE ${toLoad.length}...`, 15 + i*40);
    PERIODS[i] = await readExcel(toLoad[i]);
    P_NAMES[i] = toLoad[i].name.replace(/\.(xlsx?|csv)$/i,'').slice(0,22);

    // Save parsed rows to Supabase in the background (non-blocking)
    if (PERIODS[i] && PERIODS[i].length > 0) {
      const dbRows = PERIODS[i].map(r => toDbRow(r));
      saveTransacciones(dbRows).then(result => {
        if (result.errors.length > 0) {
          console.warn('[Supabase] Some rows failed to save:', result.errors);
        } else {
          console.log(`[Supabase] Saved ${result.inserted} rows from period ${i+1}.`);
        }
      }).catch(err => console.warn('[Supabase] saveTransacciones failed:', err));
    }
  }
  if (!FILES_RAW[1]) PERIODS[1] = null;
  setLoad('CALCULANDO MÉTRICAS...', 88);
  await sleep(200);
  setLoad('LISTO', 100);
  await sleep(250);
  initDash();
}

/**
 * Map a normalised local row to the transacciones DB schema.
 */
function toDbRow(r) {
  // Convert localised date string (DD/MM/YYYY) to ISO (YYYY-MM-DD) for Postgres
  let fecha = null;
  if (r.fechaObj instanceof Date && !isNaN(r.fechaObj)) {
    const d = r.fechaObj;
    fecha = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return {
    fecha,
    descripcion: r.descripcion || null,
    importe:     r.importe     || null,
    categoria:   r.categoria   || null,
    proyecto:    r.proyecto    || null,
    frente:      r.frente      || null,
    titular:     r.tarjeta     || null,
    banco:       r.banco       || null,
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
      fecha:       r.fecha ? new Date(r.fecha).toLocaleDateString('es-MX') : '',
      fechaObj:    r.fecha ? new Date(r.fecha) : null,
      descripcion: r.descripcion || '',
      importe:     parseFloat(r.importe) || 0,
      categoria:   r.categoria  || 'Sin categoría',
      proyecto:    r.proyecto   || '',
      frente:      r.frente     || '',
      tarjeta:     r.titular    || '',
      banco:       r.banco      || '',
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

function readExcel(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type:'binary', cellDates:true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header:1 });
        let hr = 0;
        for (let i = 0; i < Math.min(12, raw.length); i++) {
          if (raw[i] && raw[i].some(c => c && /banco|fecha|importe/i.test(String(c)))) { hr=i; break; }
        }
        const headers = (raw[hr]||[]).map(h => h ? String(h).trim() : '');
        const rows = [];
        for (let i = hr+1; i < raw.length; i++) {
          if (!raw[i] || raw[i].every(c => !c)) continue;
          const o = {}; headers.forEach((h,j) => { o[h] = raw[i][j]; }); rows.push(o);
        }
        res(normalize(rows));
      } catch(err) { rej(err); }
    };
    reader.readAsBinaryString(file);
  });
}

function normalize(rows) {
  const get = (r, ...keys) => {
    for (const k of keys) {
      const f = Object.keys(r).find(rk => rk.toLowerCase().replace(/\s/g,'').includes(k.toLowerCase().replace(/\s/g,'')));
      if (f && r[f] !== undefined && r[f] !== '') return r[f];
    } return '';
  };
  return rows.map(r => {
    let fecha = get(r,'fecha');
    if (fecha instanceof Date && !isNaN(fecha)) fecha = fecha.toLocaleDateString('es-MX');
    else if (typeof fecha === 'number') fecha = new Date(Math.round((fecha-25569)*86400000)).toLocaleDateString('es-MX');
    const imp = parseFloat(String(get(r,'importe','total','monto')).replace(/,/g,'')) || 0;
    return {
      fecha: String(fecha||''), fechaObj: parseDate(String(fecha||'')),
      descripcion: String(get(r,'descripcion','descripción')||''),
      importe: imp,
      categoria: String(get(r,'categoria','categoría')||'Sin categoría'),
      proyecto:  String(get(r,'proyecto')||''),
      frente:    String(get(r,'frente')||''),
      tarjeta:   String(get(r,'tarjeta','usuario')||''),
      banco:     String(get(r,'banco')||''),
    };
  }).filter(r => r.importe > 0);
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
