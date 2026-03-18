// app.js — Inicialización y control de la aplicación

function initDash() {
  show('dash');
  document.getElementById('tabsBar').style.display = 'block';
  document.getElementById('btnReset').style.display = 'block';

  const all = getAllData();

  // Pills de estado
  document.getElementById('p1').textContent = P_NAMES[0] + ' · ' + PERIODS[0].length + ' MOV';
  document.getElementById('p1').className = 'pill on';
  if (PERIODS[1]) {
    document.getElementById('p2').textContent = P_NAMES[1] + ' · ' + PERIODS[1].length + ' MOV';
    document.getElementById('p2').style.display = 'block';
    document.getElementById('p2').className = 'pill b';
    document.getElementById('yesCmp').style.display = 'block';
    document.getElementById('noCmp').style.display  = 'none';
  }

  // Render todas las secciones
  renderSeccion1(all);
  renderSeccion2(all);
  renderSeccion3(all);
  if (PERIODS[1]) {
    renderKpiComparativo();
    renderSeccion4();
  }

  // Tabla
  populateSelects(all);
  renderTable();
}

function populateSelects(all) {
  fillSel('tCat',  [...new Set(all.map(r=>r.categoria))].sort(), 'Todas las categorías');
  fillSel('tProy', [...new Set(all.map(r=>r.proyecto).filter(Boolean))].sort(), 'Todos los proyectos');
  fillSel('tPer',  [...new Set(all.map(r=>r._period))], 'Todos los períodos');
}

function renderTable() {
  const all    = getAllData();
  const search = (document.getElementById('tSearch')?.value||'').toLowerCase();
  const cat    = document.getElementById('tCat')?.value||'';
  const proy   = document.getElementById('tProy')?.value||'';
  const per    = document.getElementById('tPer')?.value||'';
  const fil    = all.filter(r =>
    (!cat  || r.categoria===cat) &&
    (!proy || r.proyecto===proy) &&
    (!per  || r._period===per)   &&
    (!search || r.descripcion.toLowerCase().includes(search) || r.tarjeta.toLowerCase().includes(search))
  );
  document.getElementById('tblCnt').textContent = `${Math.min(fil.length,300)} / ${fil.length} registros`;
  const pc = ['#4da6ff','#00b87a'];
  document.getElementById('tblBody').innerHTML = fil.slice(0,300).map(r => `
    <tr>
      <td><span class="td-period" style="background:${pc[r._pidx||0]}18;color:${pc[r._pidx||0]}">${r._period}</span></td>
      <td class="td-m">${r.fecha}</td>
      <td>${r.descripcion}</td>
      <td><span class="td-tag" style="background:${catColor(r.categoria)}18;color:${catColor(r.categoria)}">${r.categoria}</span></td>
      <td class="td-m">${r.proyecto||'—'}</td>
      <td class="td-m">${r.frente||'—'}</td>
      <td class="td-m" style="font-size:9px">${r.tarjeta||'—'}</td>
      <td class="td-acc">${fmt(r.importe)}</td>
    </tr>`).join('');
}

function switchTab(btn, id) {
  // Ocultar todas las secciones
  ['s1','s2','s3','s4','s5','s6'].forEach(s => {
    const el = document.getElementById('tabS'+s.slice(1));
    if (el) el.style.display = 'none';
  });
  // Mostrar la seleccionada
  const target = document.getElementById('tab' + id.toUpperCase());
  if (target) target.style.display = 'block';
  // Actualizar tabs activos
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
}

function resetApp() {
  FILES_RAW = [null, null]; PERIODS = [null, null]; P_NAMES = ['P1','P2'];
  show('uploadScreen');
  document.getElementById('tabsBar').style.display = 'none';
  document.getElementById('btnReset').style.display = 'none';
  document.getElementById('p1').textContent = 'SIN DATOS'; document.getElementById('p1').className = 'pill';
  document.getElementById('p2').style.display = 'none';
  document.getElementById('btnAnalizar').disabled = true;
  document.getElementById('yesCmp').style.display = 'none';
  document.getElementById('noCmp').style.display  = 'block';
  [0,1].forEach(i => {
    document.getElementById('slot'+i).classList.remove('loaded');
    document.getElementById('sn'+i).textContent = '';
    document.getElementById('fi'+i).value = '';
  });
}
