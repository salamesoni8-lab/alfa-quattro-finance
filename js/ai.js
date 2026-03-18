// ai.js — Análisis con Inteligencia Artificial

async function runAI() {
  const btn  = document.getElementById('aiBtn');
  const body = document.getElementById('aiBody');
  btn.disabled = true; btn.textContent = 'ANALIZANDO...';
  body.innerHTML = '<span class="ai-thinking">Procesando datos y generando análisis ejecutivo...</span>';

  const all   = getAllData();
  const total = all.reduce((s,r) => s+r.importe, 0);
  const cats  = agg(all,'categoria').slice(0,5);
  const proys = agg(all,'proyecto').filter(r=>r.k).slice(0,4);
  const imps  = all.map(r=>r.importe);
  const mean  = imps.reduce((a,b)=>a+b,0)/imps.length;
  const std   = Math.sqrt(imps.map(x=>(x-mean)**2).reduce((a,b)=>a+b,0)/imps.length);
  const outs  = all.filter(r=>r.importe>mean+2.5*std);
  const topP  = agg(all,'descripcion')[0];
  const dates = all.map(r=>r.fechaObj).filter(Boolean).sort((a,b)=>a-b);
  const days  = dates.length>1 ? Math.max(1,Math.round((dates[dates.length-1]-dates[0])/86400000)+1):1;
  const hasCmp = !!PERIODS[1];

  let cmpBlock = '';
  if (hasCmp) {
    const t0 = PERIODS[0].reduce((s,r)=>s+r.importe,0);
    const t1 = PERIODS[1].reduce((s,r)=>s+r.importe,0);
    cmpBlock = `\nCOMPARATIVO ${P_NAMES[0]} vs ${P_NAMES[1]}:\nGasto P1: ${fmt(t0)} · Gasto P2: ${fmt(t1)} · Variación: ${((t1-t0)/t0*100).toFixed(1)}%`;
  }

  const ctx = `Empresa: ALFA QUATTRO (Constructora de obra pública, México)
Períodos: ${P_NAMES.filter((_,i)=>PERIODS[i]).join(' y ')} · ${days} días
Transacciones: ${all.length} · Gasto total: ${fmt(total)}
Ticket promedio: ${fmt(mean)} · Burn rate diario: ${fmt(total/days)}
Top categorías:\n${cats.map(c=>`- ${c.k}: ${fmt(c.v)} (${(c.v/total*100).toFixed(1)}%)`).join('\n')}
Top proyectos:\n${proys.map(p=>`- ${p.k}: ${fmt(p.v)}`).join('\n')}
Proveedor principal: ${topP?.k} · ${fmt(topP?.v||0)} (${((topP?.v||0)/total*100).toFixed(1)}%)
Outliers detectados: ${outs.length}${cmpBlock}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1000,
        system: `Eres un CFO senior especializado en constructoras de obra pública en México.
Genera un análisis ejecutivo (5-6 párrafos) para presentar a dirección.
Usa lenguaje directo y profesional en español.
Usa <strong> para cifras clave, <span class="hi"> para alertas, <span class="wi"> para advertencias.
Solo párrafos HTML, sin markdown, sin bullets.`,
        messages: [{ role:'user', content:`Analiza estos datos y genera el informe ejecutivo:\n\n${ctx}` }]
      })
    });
    const data = await res.json();
    const text = data.content?.map(c=>c.text||'').join('') || '';
    body.innerHTML = text || fallbackAI(all,total,cats,outs,topP,days,hasCmp);
  } catch(e) {
    body.innerHTML = fallbackAI(all,total,cats,outs,topP,days,hasCmp);
  }
  btn.disabled = false; btn.textContent = 'REGENERAR ANÁLISIS';
}

function fallbackAI(all,total,cats,outs,topP,days,hasCmp) {
  const mean = all.map(r=>r.importe).reduce((a,b)=>a+b,0)/all.length;
  const conc = topP ? (topP.v/total*100).toFixed(1) : 0;
  let cmp = '';
  if (hasCmp) {
    const t0=PERIODS[0].reduce((s,r)=>s+r.importe,0), t1=PERIODS[1].reduce((s,r)=>s+r.importe,0);
    const v=((t1-t0)/t0*100).toFixed(1);
    cmp = `<p>Comparando ambos períodos, el gasto de <strong>${P_NAMES[1]}</strong> fue <strong>${fmt(t1)}</strong> frente a <strong>${fmt(t0)}</strong> en ${P_NAMES[0]}, una variación de <strong>${+v>0?'+':''}${v}%</strong>. ${+v>10?'<span class="wi">Este incremento supera el 10%, lo que amerita revisión de causas.</span>':'La variación se mantiene en rangos normales.'}</p><br>`;
  }
  return `<p>Durante el período analizado, <strong>ALFA QUATTRO</strong> registró un gasto total de <strong>${fmt(total)}</strong> en <strong>${all.length} transacciones</strong>, con un ticket promedio de <strong>${fmt(mean)}</strong> y un burn rate diario de <strong>${fmt(total/days)}</strong>, lo que proyecta un gasto mensual de <strong>${fmt(total/days*30)}</strong>.</p><br>
<p>El gasto está liderado por <strong>${cats[0]?.k}</strong> con <strong>${fmt(cats[0]?.v||0)}</strong> (${(((cats[0]?.v||0)/total)*100).toFixed(1)}% del total), seguida de <strong>${cats[1]?.k||'—'}</strong>. Este patrón es consistente con la etapa de ejecución activa de obra.</p><br>
${cmp}
<p>${outs.length>0 ? `<span class="hi">Se detectaron ${outs.length} transacciones con importes inusuales que superan el umbral estadístico. Se recomienda validación manual antes de su cierre contable.</span>` : 'El flujo de gastos se mantiene dentro de parámetros estadísticos normales, sin transacciones que requieran atención urgente.'}</p><br>
<p>${+conc>30 ? `<span class="wi">El proveedor "${topP?.k}" concentra el ${conc}% del gasto total. Una dependencia superior al 30% representa un riesgo operacional. Se recomienda evaluar alternativas de suministro.</span>` : `La distribución de proveedores es saludable. El proveedor principal "${topP?.k}" representa el ${conc}% del gasto, dentro de rangos aceptables para operaciones de obra pública.`}</p>`;
}
