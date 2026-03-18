// kpis.js — Cálculo y renderizado de KPIs y métricas

function renderSeccion1(all) {
  const total   = all.reduce((s,r) => s+r.importe, 0);
  const txN     = all.length;
  const avg     = total / txN;
  const proys   = agg(all,'proyecto').filter(r=>r.k);
  const cats    = agg(all,'categoria');
  const topProy = proys[0] || {k:'—', v:0};
  const topUser = agg(all,'tarjeta')[0] || {k:'—', v:0};
  const dates   = all.map(r=>r.fechaObj).filter(Boolean).sort((a,b)=>a-b);
  const days    = dates.length>1 ? Math.max(1,Math.round((dates[dates.length-1]-dates[0])/86400000)+1) : 1;
  const pagosN  = txN;
  const pagosObra = {};
  all.forEach(r => { const k=r.proyecto||'Sin proyecto'; pagosObra[k]=(pagosObra[k]||0)+1; });
  const topPagosObra = Object.entries(pagosObra).sort((a,b)=>b[1]-a[1])[0] || ['—',0];

  // Fila 1 — Dinero
  document.getElementById('kpiRow1').innerHTML = [
    { icon:'💰', lbl:'GASTO TOTAL',    val:fmtK(total),  sub:txN+' transacciones · '+days+' días', c:THEME.accent, trend:'neutral', tval:'' },
    { icon:'🧾', lbl:'TICKET PROMEDIO', val:fmtK(avg),   sub:'por transacción',                    c:THEME.accent, trend:'neutral', tval:'' },
    { icon:'📅', lbl:'GASTO DIARIO',    val:fmtK(total/days), sub:'burn rate',                     c:THEME.purple, trend:'neutral', tval:'' },
    { icon:'📊', lbl:'PROYECTOS',       val:proys.length, sub:cats.length+' categorías',            c:THEME.cyan,   trend:'neutral', tval:'' },
    { icon:'🏗️', lbl:'OBRA TOP',        val:topProy.k.split('-').pop(), sub:fmtK(topProy.v),       c:THEME.orange, trend:'neutral', tval:'' },
    { icon:'💳', lbl:'% OBRA TOP',      val:topProy.v?(topProy.v/total*100).toFixed(1)+'%':'—', sub:'del gasto total', c:THEME.success, trend:'neutral', tval:'' },
  ].map(k => kpiHTML(k)).join('');

  // Fila 2 — Operación
  document.getElementById('kpiRow2').innerHTML = [
    { icon:'🔢', lbl:'Nº PAGOS TOTAL',   val:pagosN,             sub:'transacciones registradas',     c:THEME.accent,   trend:'neutral', tval:'' },
    { icon:'🏢', lbl:'PAGOS OBRA TOP',    val:topPagosObra[1],   sub:topPagosObra[0].split('-').pop(), c:THEME.orange,   trend:'neutral', tval:'' },
    { icon:'👤', lbl:'TARJETA MÁS USADA',val:topUser.k.split('|').pop().trim().split(' ')[0], sub:txN===0?'—':((agg(all,'tarjeta')[0]?.v||0)/total*100).toFixed(1)+'% del gasto', c:THEME.purple, trend:'neutral', tval:'' },
    { icon:'📦', lbl:'CAT. PRINCIPAL',    val:(cats[0]?.k||'—').split(' ')[0], sub:cats[0]?fmtK(cats[0].v):'—', c:THEME.orange, trend:'neutral', tval:'' },
    { icon:'🏪', lbl:'TOP PROVEEDOR',     val:(agg(all,'descripcion')[0]?.k||'—').split(' ')[0], sub:fmtK(agg(all,'descripcion')[0]?.v||0), c:THEME.cyan, trend:'neutral', tval:'' },
    { icon:'📆', lbl:'DÍAS ANALIZADOS',   val:days,              sub:'período completo',               c:THEME.success,  trend:'neutral', tval:'' },
  ].map(k => kpiHTML(k)).join('');

  // Obra top card
  const pct = topProy.v ? (topProy.v/total*100).toFixed(1) : 0;
  document.getElementById('topObraCard').innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-family:var(--f1);font-size:28px;color:var(--accent)">${topProy.k}</div>
      <div style="font-family:var(--f2);font-size:11px;color:var(--muted);margin-top:4px">${fmtK(topProy.v)} · ${pct}% del gasto total</div>
    </div>
    <div style="height:6px;background:var(--s3);border-radius:3px;margin-bottom:8px">
      <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px;transition:width 1s ease"></div>
    </div>
    <div style="font-family:var(--f2);font-size:9px;color:var(--muted)">${pagosObra[topProy.k]||0} pagos registrados en esta obra</div>
  `;

  // Tarjeta top card
  const topU = agg(all,'tarjeta')[0] || {k:'—',v:0};
  const uPct = topU.v ? (topU.v/total*100).toFixed(1) : 0;
  const uCount = all.filter(r=>r.tarjeta===topU.k).length;
  document.getElementById('topTarjetaCard').innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-family:var(--f1);font-size:24px;color:var(--purple)">${topU.k.split('|').pop().trim()}</div>
      <div style="font-family:var(--f2);font-size:11px;color:var(--muted);margin-top:4px">${fmtK(topU.v)} · ${uPct}% del gasto total</div>
    </div>
    <div style="height:6px;background:var(--s3);border-radius:3px;margin-bottom:8px">
      <div style="height:100%;width:${uPct}%;background:var(--purple);border-radius:3px;transition:width 1s ease"></div>
    </div>
    <div style="font-family:var(--f2);font-size:9px;color:var(--muted)">${uCount} transacciones · ticket promedio ${fmtK(topU.v/uCount)}</div>
  `;
}

function kpiHTML(k) {
  return `<div class="kpi fade">
    <div class="kpi-top">
      <span class="kpi-icon">${k.icon}</span>
      ${k.tval ? `<span class="kpi-trend ${k.trend}">${k.tval}</span>` : ''}
    </div>
    <div class="kpi-lbl">${k.lbl}</div>
    <div class="kpi-val" style="color:${k.c}">${k.val}</div>
    <div class="kpi-sub">${k.sub}</div>
    <div class="kpi-bar"><div class="kpi-bar-fill" style="background:${k.c};width:100%"></div></div>
  </div>`;
}

function renderSeccion2(all) {
  const total   = all.reduce((s,r) => s+r.importe, 0);
  const dates   = all.map(r=>r.fechaObj).filter(Boolean).sort((a,b)=>a-b);
  const days    = dates.length>1 ? Math.max(1,Math.round((dates[dates.length-1]-dates[0])/86400000)+1) : 1;

  // Burn rate
  document.getElementById('mBurnD').textContent = fmtK(total/days);
  document.getElementById('mBurnW').textContent = fmtK(total/days*7);
  document.getElementById('mBurnM').textContent = fmtK(total/days*30);
  document.getElementById('mDays').textContent  = days;

  // Concentración proveedores
  const provs = agg(all,'descripcion');
  const top3pct = provs.slice(0,3).reduce((s,r)=>s+r.v,0)/total*100;
  const topProvPct = provs[0] ? (provs[0].v/total*100).toFixed(1) : 0;
  const riesgo = top3pct > 60 ? 'ALTO' : top3pct > 40 ? 'MEDIO' : 'BAJO';
  const riesgoClass = top3pct > 60 ? 'danger' : top3pct > 40 ? 'warn' : 'ok';
  document.getElementById('concProvCard').innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-family:var(--f1);font-size:32px;color:var(--accent)">${top3pct.toFixed(1)}%</div>
      <div style="font-family:var(--f2);font-size:10px;color:var(--muted)">concentrado en top 3 proveedores</div>
    </div>
    <span class="metric-badge badge-${riesgoClass}">RIESGO ${riesgo}</span>
    <div style="margin-top:12px;font-family:var(--f2);font-size:10px;color:var(--muted)">
      Proveedor #1: <strong style="color:var(--text)">${provs[0]?.k||'—'}</strong> · ${topProvPct}% del gasto
    </div>
  `;

  // Outliers
  const importes = all.map(r=>r.importe);
  const mean = importes.reduce((a,b)=>a+b,0)/importes.length;
  const std  = Math.sqrt(importes.map(x=>(x-mean)**2).reduce((a,b)=>a+b,0)/importes.length);
  const thr  = mean + 2.5*std;
  const outs = all.filter(r=>r.importe>thr);
  const outClass = outs.length > 5 ? 'danger' : outs.length > 0 ? 'warn' : 'ok';
  document.getElementById('outliersCard').innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-family:var(--f1);font-size:32px;color:${outs.length>5?'var(--r)':outs.length>0?'var(--y)':'var(--g)'}">${outs.length}</div>
      <div style="font-family:var(--f2);font-size:10px;color:var(--muted)">transacciones por encima del umbral estadístico</div>
    </div>
    <span class="metric-badge badge-${outClass}">${outs.length>5?'REVISAR URGENTE':outs.length>0?'REVISAR':'NORMAL'}</span>
    <div style="margin-top:12px;font-family:var(--f2);font-size:10px;color:var(--muted)">
      Umbral: ${fmt(thr)} · Media: ${fmt(mean)}
    </div>
    ${outs.slice(0,3).map(o=>`
      <div style="margin-top:6px;font-family:var(--f2);font-size:9px;padding:6px 8px;background:rgba(232,48,74,.05);border-left:2px solid var(--r)">
        ${o.descripcion} · <strong>${fmt(o.importe)}</strong>
      </div>`).join('')}
  `;

  // Top 10 proveedores
  const topProv = provs.slice(0,10);
  document.getElementById('provTotal').textContent = fmt(topProv.reduce((s,r)=>s+r.v,0));
  renderBars('mTopProv', topProv, [THEME.accent]);

  // Alertas
  renderAlerts(all, total, outs, provs, top3pct);
}

function renderAlerts(all, total, outs, provs, top3pct) {
  const seen = {}; let dups = 0;
  all.forEach(r => { const k=r.descripcion+'|'+r.importe; seen[k]=(seen[k]||0)+1; });
  Object.values(seen).forEach(v => { if(v>1) dups++; });
  const topCat = agg(all,'categoria')[0];
  const catPct = topCat ? (topCat.v/total*100) : 0;
  const items = [];
  if (outs.length > 0) items.push({t:'danger', i:'🚨', m:`<strong>${outs.length} transacciones inusuales</strong> detectadas con importes muy por encima del promedio. Se recomienda revisión manual.`});
  if (dups > 3)        items.push({t:'warn',   i:'⚠️', m:`<strong>${dups} posibles cargos duplicados</strong> (mismo proveedor e importe exacto). Verifica que no sean pagos repetidos.`});
  if (top3pct > 50)    items.push({t:'warn',   i:'📊', m:`<strong>Alta concentración de proveedores:</strong> los 3 principales concentran el ${top3pct.toFixed(1)}% del gasto. Riesgo operacional.`});
  if (catPct > 55)     items.push({t:'info',   i:'ℹ️', m:`<strong>Categoría dominante:</strong> "${topCat.k}" representa el ${catPct.toFixed(1)}% del gasto total.`});
  if (items.length===0) items.push({t:'ok',    i:'✅', m:'Sin alertas críticas en el período analizado. Los datos se ven dentro de parámetros normales.'});
  document.getElementById('alertsBox').innerHTML = items.map(a =>
    `<div class="alert-row ${a.t}"><div class="a-icon">${a.i}</div><div class="a-text">${a.m}</div></div>`
  ).join('');
}

function renderKpiComparativo() {
  if (!PERIODS[1]) return;
  const p0 = PERIODS[0], p1 = PERIODS[1];
  const t0=p0.reduce((s,r)=>s+r.importe,0), t1=p1.reduce((s,r)=>s+r.importe,0);
  const avg0=t0/p0.length, avg1=t1/p1.length;
  const d0=calcDays(p0), d1=calcDays(p1);
  const br0=t0/d0, br1=t1/d1;
  const varT=((t1-t0)/t0*100).toFixed(1);
  const varBr=((br1-br0)/br0*100).toFixed(1);
  const pc = ['#4da6ff','#00b87a'];
  document.getElementById('kpiCmp').innerHTML = [
    {lbl:'GASTO '+P_NAMES[0],  val:fmtK(t0),  sub:p0.length+' transacciones', c:pc[0]},
    {lbl:'GASTO '+P_NAMES[1],  val:fmtK(t1),  sub:p1.length+' transacciones', c:pc[1]},
    {lbl:'VARIACIÓN',           val:(+varT>0?'+':'')+varT+'%', sub:fmt(Math.abs(t1-t0))+' diferencia', c:+varT>0?'var(--r)':'var(--g)'},
    {lbl:'BURN RATE '+P_NAMES[0].slice(0,3), val:fmtK(br0), sub:'por día', c:pc[0]},
    {lbl:'BURN RATE '+P_NAMES[1].slice(0,3), val:fmtK(br1), sub:'por día', c:pc[1]},
    {lbl:'VAR. BURN RATE', val:(+varBr>0?'+':'')+varBr+'%', sub:'cambio en ritmo de gasto', c:+varBr>0?'var(--r)':'var(--g)'},
  ].map(k => `<div class="kpi fade">
    <div class="kpi-lbl">${k.lbl}</div>
    <div class="kpi-val" style="color:${k.c}">${k.val}</div>
    <div class="kpi-sub">${k.sub}</div>
  </div>`).join('');
}

function calcDays(data) {
  const dates = data.map(r=>r.fechaObj).filter(Boolean).sort((a,b)=>a-b);
  return dates.length>1 ? Math.max(1,Math.round((dates[dates.length-1]-dates[0])/86400000)+1) : 1;
}
