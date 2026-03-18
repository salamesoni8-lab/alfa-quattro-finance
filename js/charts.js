// charts.js — Todas las gráficas y visualizaciones

function renderBars(id, data, colors) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!data.length) { el.innerHTML='<div style="color:var(--muted);font-size:11px">Sin datos</div>'; return; }
  const max   = data[0].v;
  const total = data.reduce((s,r) => s+r.v, 0);
  el.innerHTML = data.slice(0,9).map((item,i) => {
    const c = typeof colors === 'function' ? colors(item.k) :
              (Array.isArray(colors) && colors.length > 1 ? colors[i%colors.length] : colors[0]);
    return `<div class="bar-row">
      <div class="bar-lbl" title="${item.k}">${item.k||'—'}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(item.v/max*100).toFixed(1)}%;background:${c}"></div></div>
      <div class="bar-val">${fmtK(item.v)}</div>
      <div class="bar-pct">${(item.v/total*100).toFixed(1)}%</div>
    </div>`;
  }).join('');
}

function renderDonut(id, data) {
  const el = document.getElementById(id);
  if (!el || !data.length) return;
  const total = data.reduce((s,r) => s+r.v, 0);
  const sz=120, r=40, cx=sz/2, cy=sz/2;
  let angle = -Math.PI/2, paths = '';
  const clrs = data.map((item,i) => catColor(item.k) || THEME.chartColors[i%THEME.chartColors.length]);
  data.forEach((item,i) => {
    const slice = (item.v/total)*Math.PI*2;
    const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
    angle += slice;
    const x2=cx+r*Math.cos(angle), y2=cy+r*Math.sin(angle);
    paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${slice>Math.PI?1:0},1 ${x2},${y2} Z" fill="${clrs[i]}" opacity=".85"/>`;
  });
  paths += `<circle cx="${cx}" cy="${cy}" r="${r*.55}" fill="var(--s1)"/>`;
  const legend = data.slice(0,5).map((item,i) => `
    <div class="donut-item">
      <div class="donut-dot" style="background:${clrs[i]}"></div>
      <span class="donut-name">${item.k.split(' ')[0]}</span>
      <span class="donut-pct">${(item.v/total*100).toFixed(0)}%</span>
    </div>`).join('');
  el.innerHTML = `<svg width="${sz}" height="${sz}" style="flex-shrink:0">${paths}</svg>
    <div class="donut-legend">${legend}</div>`;
}

function renderTimeline(tlId, totId, legId, data) {
  const byDay = {};
  data.forEach(r => {
    if (!r.fechaObj) return;
    const k = r.fechaObj.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit'});
    if (!byDay[k]) byDay[k] = {};
    const p = r._period||'P1';
    byDay[k][p] = (byDay[k][p]||0) + r.importe;
  });
  const periods = [...new Set(data.map(r=>r._period).filter(Boolean))];
  const pColors = { 0:'#4da6ff', 1:'#00b87a' };
  const pidxMap = {};
  data.forEach(r => { if(r._period) pidxMap[r._period] = r._pidx||0; });
  const entries = Object.entries(byDay).sort((a,b) => {
    const[da,ma]=a[0].split('/').map(Number); const[db,mb]=b[0].split('/').map(Number);
    return ma!==mb ? ma-mb : da-db;
  });
  if (!entries.length) return;
  const allVals = entries.flatMap(([,v]) => Object.values(v));
  const maxV = Math.max(...allVals, 1);
  const total = allVals.reduce((a,b)=>a+b,0);
  if (totId) document.getElementById(totId).textContent = 'TOTAL: ' + fmtK(total);
  if (legId) document.getElementById(legId).innerHTML = periods.map(p =>
    `<div class="pl-item"><div class="pl-dot" style="background:${pColors[pidxMap[p]||0]}"></div>${p}</div>`
  ).join('');
  document.getElementById(tlId).innerHTML = entries.map(([d,vals]) => {
    const bars = periods.map((p,pi) => {
      const v = vals[p]||0;
      const h = v ? Math.max((v/maxV*100),2) : 0;
      return `<div class="tl-b" style="height:${h}%;background:${pColors[pidxMap[p]||pi]};opacity:.8" data-tip="${d} ${p}: ${fmt(v)}"></div>`;
    }).join('');
    return `<div class="tl-col"><div class="tl-bars">${bars}</div><div class="tl-lbl">${d.slice(0,5)}</div></div>`;
  }).join('');
}

function renderScatter(scId, infoId, data) {
  const c = document.getElementById(scId);
  if (!c) return;
  const importes = data.map(r=>r.importe);
  const mean = importes.reduce((a,b)=>a+b,0)/importes.length;
  const std  = Math.sqrt(importes.map(x=>(x-mean)**2).reduce((a,b)=>a+b,0)/importes.length);
  const thr  = mean+2.5*std;
  const maxI = Math.max(...importes);
  const sample = data.slice().sort(()=>Math.random()-.5).slice(0,200);
  const outs   = data.filter(r=>r.importe>thr);
  c.innerHTML = sample.map((r,i) => {
    const isOut = r.importe>thr;
    const x = (i/sample.length*100);
    const y = (r.importe/maxI*100);
    const col = catColor(r.categoria);
    return `<div class="s-dot${isOut?' out':''}" style="left:${x}%;bottom:${y}%;background:${col};color:${col};width:${isOut?9:6}px;height:${isOut?9:6}px;" title="${r.descripcion}: ${fmt(r.importe)}"></div>`;
  }).join('');
  if (infoId) document.getElementById(infoId).textContent =
    `Media: ${fmt(mean)} · Desv. estándar: ${fmt(std)} · Umbral outlier: ${fmt(thr)} · Outliers detectados: ${outs.length}`;
}

function renderCmpBars(id, pa, pb, field, maxN=8) {
  const ma={}, mb={};
  pa.forEach(r => { const k=r[field]||''; ma[k]=(ma[k]||0)+r.importe; });
  pb.forEach(r => { const k=r[field]||''; mb[k]=(mb[k]||0)+r.importe; });
  const allKeys = [...new Set([...Object.keys(ma),...Object.keys(mb)].filter(Boolean))];
  const sorted  = allKeys.map(k=>({k,va:ma[k]||0,vb:mb[k]||0}))
    .sort((a,b)=>(b.va+b.vb)-(a.va+a.vb)).slice(0,maxN);
  const maxV = Math.max(...sorted.map(r=>Math.max(r.va,r.vb)),1);
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<div class="period-legend">
    <div class="pl-item"><div class="pl-dot" style="background:#4da6ff"></div>${P_NAMES[0]}</div>
    <div class="pl-item"><div class="pl-dot" style="background:#00b87a"></div>${P_NAMES[1]}</div>
  </div>` + sorted.map(item => {
    const diff = item.vb - item.va;
    const dp   = item.va ? ((diff/item.va)*100).toFixed(1) : 'N/A';
    return `<div class="cmp-row">
      <div class="cmp-lbl">${item.k||'—'}</div>
      <div class="cmp-bars">
        <div class="cmp-bar-wrap">
          <div class="cmp-period">${P_NAMES[0].slice(0,3)}</div>
          <div class="cmp-track"><div class="cmp-fill" style="width:${(item.va/maxV*100).toFixed(1)}%;background:#4da6ff"></div></div>
          <div class="cmp-val">${fmtK(item.va)}</div><div class="cmp-diff"></div>
        </div>
        <div class="cmp-bar-wrap">
          <div class="cmp-period">${P_NAMES[1].slice(0,3)}</div>
          <div class="cmp-track"><div class="cmp-fill" style="width:${(item.vb/maxV*100).toFixed(1)}%;background:#00b87a"></div></div>
          <div class="cmp-val">${fmtK(item.vb)}</div>
          <div class="cmp-diff" style="color:${diff>0?'var(--r)':'var(--g)'};font-family:var(--f2);font-size:8px">${diff>0?'+':''}${dp}%</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderSeccion3(all) {
  renderBars('gCat',    agg(all,'categoria'), catColor);
  renderDonut('gDonut', agg(all,'categoria').slice(0,6));
  renderBars('gFrente', agg(all,'frente').filter(r=>r.k), THEME.chartColors);
  renderBars('gProy',   agg(all,'proyecto').filter(r=>r.k), THEME.chartColors.slice(2));
  renderBars('gUser',   agg(all,'tarjeta').slice(0,8), THEME.chartColors.slice(4));
  renderTimeline('gTimeline','tlTot','tlLegend', all);
  renderScatter('gScatter','scatterInfo', all);
}

function renderSeccion4() {
  if (!PERIODS[1]) return;
  const p0 = PERIODS[0], p1 = PERIODS[1];
  renderCmpBars('cmpCat',  p0, p1, 'categoria');
  renderCmpBars('cmpProy', p0, p1, 'proyecto');
  const allCmp = [
    ...p0.map(r=>({...r,_period:P_NAMES[0],_pidx:0})),
    ...p1.map(r=>({...r,_period:P_NAMES[1],_pidx:1}))
  ];
  renderTimeline('cmpTimeline','cmpTlTot','cmpTlLegend', allCmp);
  renderCmpBars('cmpProv', p0, p1, 'descripcion', 8);
  const provs0 = new Set(p0.map(r=>r.descripcion));
  renderBars('cmpNew', agg(p1,'descripcion').filter(r=>!provs0.has(r.k)).slice(0,8), ['#00b87a']);
}
