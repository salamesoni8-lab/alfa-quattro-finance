// utils.js — Funciones de utilidad compartidas

const fmt  = n => '$' + n.toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtK = n => n>=1e6 ? '$'+(n/1e6).toFixed(1)+'M' : n>=1000 ? '$'+(n/1000).toFixed(1)+'K' : fmt(n);
const fmtPct = (a,b) => b ? ((a-b)/b*100).toFixed(1)+'%' : 'N/A';
const hsh = s => { let h=0; for(const c of s) h=Math.imul(31,h)+c.charCodeAt(0)|0; return h; };

function catColor(c='') {
  const t = THEME.catColors;
  const k = Object.keys(t).find(k => c.toUpperCase().includes(k));
  return k ? t[k] : THEME.chartColors[Math.abs(hsh(c)) % THEME.chartColors.length];
}

function parseDate(s) {
  if (!s) return null;
  const p = s.split('/');
  if (p.length === 3) return new Date(+p[2], +p[1]-1, +p[0]);
  return null;
}

function agg(data, field) {
  const m = {};
  data.forEach(r => { const k = r[field]||''; m[k] = (m[k]||0) + r.importe; });
  return Object.entries(m).map(([k,v]) => ({k,v})).sort((a,b) => b.v - a.v);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function show(id) {
  ['uploadScreen','loadScreen','dash'].forEach(s => {
    const el = document.getElementById(s);
    if (!el) return;
    if (s === id) el.style.display = s==='dash' ? 'block' : 'flex';
    else el.style.display = 'none';
  });
}

function setLoad(msg, pct) {
  document.getElementById('loadMsg').textContent = msg;
  document.getElementById('loadFill').style.width = pct + '%';
}

function fillSel(id, opts, ph) {
  const s = document.getElementById(id);
  if (!s) return;
  s.innerHTML = `<option value="">${ph}</option>`;
  opts.forEach(o => { const e = document.createElement('option'); e.value=o; e.textContent=o; s.appendChild(e); });
}
