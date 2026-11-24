'use strict';
/* SoilLab Professional – Stage 1: core app + Moisture Content module */
const $ = s => document.querySelector(s);
const K = {projects:'soillab_projects', samples:'soillab_samples', tests:'soillab_tests', reports:'soillab_reports'};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clone = x => JSON.parse(JSON.stringify(x)); // works in older browsers that lack structuredClone
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const load = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const db = {projects: load(K.projects), samples: load(K.samples), tests: load(K.tests), reports: load(K.reports)};
function persist(k) {
  try { localStorage.setItem(K[k], JSON.stringify(db[k])); return true; }
  catch (e) { toast('Could not save (storage full or blocked)', 'danger'); return false; }
}
function toast(m, t = '') { const d = document.createElement('div'); d.textContent = m; d.className = t; $('#toast').append(d); setTimeout(() => d.remove(), 3000); }

/* ---- Schemas: [key, label, type, options|'req'] ---- */
const F = {
  projects: {title:'Project', cols:['ref','name','client','status'], f:[
    ['ref','Reference no.','text'],['name','Project name','text','req'],['client','Client / organisation','text'],
    ['location','Location','text'],['county','County','text'],['engineer','Engineer / supervisor','text'],
    ['start','Start date','date'],['end','Completion date','date'],['status','Status','select',['Planned','Active','Completed']],
    ['description','Description','textarea']]},
  samples: {title:'Sample', cols:['no','project','location','date','status'], f:[
    ['no','Sample ID','text','req'],['project','Project','proj','req'],['location','Sampling location','text'],
    ['chainage','Chainage / coordinates','text'],['description','Description','textarea'],['classification','Soil classification','text'],
    ['date','Sampling date','date'],['depth','Depth (m)','number'],['type','Sample type','select',['Disturbed','Undisturbed','Bulk']],
    ['source','Source of material','text'],['received','Received date','date'],['receivedBy','Received by','text'],
    ['condition','Condition','text'],['status','Testing status','select',['Pending','In testing','Completed']]]}
};
const projName = id => (db.projects.find(p => p.id === id) || {}).name || '—';
const sampleNo = id => (db.samples.find(s => s.id === id) || {}).no || '—';
const cell = (k, c, r) => esc(c === 'project' ? projName(r.project) : r[c]);

/* ---- Router ---- */
const pages = {dashboard, projects: () => list('projects'), samples: () => list('samples'), tests, reports, search: searchPage, graphs, settings};
const crumbs = {dashboard:'Dashboard', projects:'Project Management', samples:'Soil Sample Register', tests:'Soil Testing Laboratory', reports:'Laboratory Reports', search:'Search results', graphs:'Engineering Graphs', settings:'Settings & Data'};
function route() {
  const p = pages[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  document.querySelectorAll('#side a').forEach(a => a.classList.toggle('on', a.dataset.p === p));
  $('#title').textContent = crumbs[p]; $('#crumb').textContent = 'Home / ' + crumbs[p];
  $('#side').classList.remove('open'); pages[p]();
}
addEventListener('hashchange', route);

/* ---- Dashboard (all figures computed from saved records) ---- */
function dashboard() {
  const t = db.tests, done = t.filter(x => x.status === 'Completed').length;
  const stat = (n, l) => `<div class="card stat"><b>${n}</b><span>${l}</span></div>`;
  const pend = db.samples.filter(s => s.status !== 'Completed').length;
  $('#view').innerHTML = `<div class="grid">${stat(db.projects.length,'Projects')}${stat(db.samples.length,'Samples')}
    ${stat(t.length,'Tests conducted')}${stat(done,'Completed tests')}${stat(pend,'Samples pending')}
    ${stat(t.filter(x => x.warnings && x.warnings.length).length,'Tests needing review')}${stat(db.reports.filter(r => r.status === 'Approved').length,'Approved reports')}</div>
    <div class="bar"><button class="btn" data-a="new" data-k="projects">+ New project</button>
    <button class="btn" data-a="new" data-k="samples">+ Register sample</button>
    <button class="btn" data-a="moist">+ Moisture content test</button></div>
    <div class="two"><div class="card"><h3>Tests by category</h3><canvas id="d1" height="200"></canvas></div><div class="card"><h3>Monthly testing activity</h3><canvas id="d2" height="200"></canvas></div></div>
    <div class="card"><h3>Recent tests</h3>${t.length ? table(['Date','Test','Sample'], t.slice(-5).reverse().map(x => [x.date, x.type, sampleNo(x.sample)]))
      : '<div class="empty">No tests recorded yet.</div>'}</div>`;
  drawDash();
}
const table = (h, rows) => `<div class="tw"><table><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>`;

/* ---- Generic CRUD list ---- */
function list(k) {
  $('#view').innerHTML = `<div class="bar"><input id="q" placeholder="Search…"><button class="btn" data-a="new" data-k="${k}">+ Add ${F[k].title.toLowerCase()}</button></div><div class="card" id="rows"></div>`;
  const draw = () => {
    const q = $('#q').value.toLowerCase(), cols = F[k].cols;
    const rs = db[k].filter(r => JSON.stringify(Object.values(r)).toLowerCase().includes(q) || cell(k, 'project', r).toLowerCase().includes(q));
    $('#rows').innerHTML = rs.length ? `<div class="tw"><table><tr>${cols.map(c => `<th>${c}</th>`).join('')}<th></th></tr>${rs.map(r =>
      `<tr>${cols.map(c => `<td>${cell(k, c, r)}</td>`).join('')}<td><button class="btn sm ghost" data-a="edit" data-k="${k}" data-id="${r.id}">Edit</button>
      <button class="btn sm red" data-a="del" data-k="${k}" data-id="${r.id}">Delete</button></td></tr>`).join('')}</table></div>`
      : `<div class="empty">No ${k} found. Use the Add button to create one.</div>`;
  };
  $('#q').oninput = draw; draw();
}
function openForm(k, id) {
  const r = db[k].find(x => x.id === id) || {};
  if (k === 'samples' && !db.projects.length) return toast('Create a project first', 'danger');
  const inp = ([key, lab, type, o]) => {
    let v = r[key] ?? '', el;
    if (type === 'select') el = `<select name="${key}">${o.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
    else if (type === 'proj') el = `<select name="${key}" required>${db.projects.map(p => `<option value="${p.id}" ${p.id === v ? 'selected' : ''}>${esc(p.ref)} – ${esc(p.name)}</option>`).join('')}</select>`;
    else if (type === 'textarea') el = `<textarea name="${key}">${esc(v)}</textarea>`;
    else el = `<input name="${key}" type="${type}" value="${esc(v)}" ${o === 'req' ? 'required' : ''} ${type === 'number' ? 'step="any" min="0"' : ''}>`;
    return `<div><label>${lab}</label>${el}</div>`;
  };
  $('#dlg').innerHTML = `<form method="dialog" id="fm"><h3>${id ? 'Edit' : 'New'} ${F[k].title.toLowerCase()}</h3><div class="ff">${F[k].f.map(inp).join('')}</div>
    <p class="bar"><button class="btn">Save</button><button type="button" class="btn ghost" data-a="close">Cancel</button></p></form>`;
  $('#dlg').showModal();
  if (k === 'projects' && !r.ref) $('[name=ref]').value = `PRJ-${new Date().getFullYear()}-${String(db.projects.length + 1).padStart(3, '0')}`;
  $('#fm').onsubmit = e => {
    const d = Object.fromEntries(new FormData(e.target));
    const key = k === 'projects' ? 'ref' : 'no';
    if (db[k].some(x => x.id !== id && x[key] === d[key])) { e.preventDefault(); return toast('Duplicate ' + (k === 'projects' ? 'reference' : 'sample ID'), 'danger'); }
    if (id) Object.assign(r, d); else db[k].push({id: uid(), ...d});
    if (persist(k)) toast('Saved', 'success'); route();
  };
}
function del(k, id) {
  let msg = 'Delete this record?';
  if (k === 'projects') { const s = db.samples.filter(x => x.project === id).length; if (s) msg = `This project has ${s} sample(s) and their tests. All will be deleted. Continue?`; }
  if (k === 'samples') { const t = db.tests.filter(x => x.sample === id).length; if (t) msg = `This sample has ${t} test(s) which will be deleted. Continue?`; }
  if (k === 'tests') { const n = db.reports.filter(r => r.testId === id).length; if (n) msg = `This test has ${n} report(s) which will also be deleted. Continue?`; }
  if (!confirm(msg)) return;
  if (k === 'projects') { const ids = db.samples.filter(s => s.project === id).map(s => s.id); db.samples = db.samples.filter(s => s.project !== id); db.tests = db.tests.filter(t => !ids.includes(t.sample)); persist('samples'); persist('tests'); }
  if (k === 'samples') { db.tests = db.tests.filter(t => t.sample !== id); persist('tests'); }
  db[k] = db[k].filter(x => x.id !== id); persist(k); if (k !== 'reports') { db.reports = db.reports.filter(r => db.tests.some(t => t.id === r.testId)); persist('reports'); } toast('Deleted'); route();
}

/* ---- Moisture content (water content) ----
   w (%) = (Mw − Md) / (Md − Mc) × 100, where Mc = container, Mw = wet soil + container, Md = dry soil + container.
   Standard reference is user-entered: no method number is assumed (requires laboratory verification). */
function calcMoisture(rows) {
  const out = [], warnings = [];
  rows.forEach((r, i) => {
    const {c, w, d} = r, n = i + 1;
    if ([c, w, d].some(x => x === '' || isNaN(x))) { warnings.push(`Determination ${n}: incomplete readings`); return; }
    if (c < 0 || w < 0 || d < 0) { warnings.push(`Determination ${n}: negative mass`); return; }
    if (d <= c) { warnings.push(`Determination ${n}: dry soil + container must exceed container mass`); return; }
    if (w < d) { warnings.push(`Determination ${n}: wet mass is less than dry mass`); return; }
    const mw = w - d, ms = d - c, wc = mw / ms * 100;
    out.push({n, mw, ms, wc, step: `#${n}: Mw = ${w} − ${d} = ${mw.toFixed(2)} g; Ms = ${d} − ${c} = ${ms.toFixed(2)} g; w = ${mw.toFixed(2)} / ${ms.toFixed(2)} × 100 = ${wc.toFixed(2)} %`});
  });
  const mean = out.length ? out.reduce((a, x) => a + x.wc, 0) / out.length : null;
  return {out, mean, warnings};
}
let mrows = [];
function moistForm() {
  if (!db.samples.length) return toast('Register a sample first', 'danger');
  mrows = [{c:'', w:'', d:''}, {c:'', w:'', d:''}];
  $('#dlg').innerHTML = `<h3>Moisture content test</h3><div class="ff">
   <div><label>Sample</label><select id="m-s">${db.samples.map(s => `<option value="${s.id}">${esc(s.no)}</option>`).join('')}</select></div>
   <div><label>Test date</label><input id="m-d" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
   <div><label>Standard / method reference (enter and verify)</label><input id="m-std" placeholder="e.g. organisation, number, year" value="${esc(cfg.std)}"></div></div>
   <div id="m-rows"></div><p class="bar"><button class="btn ghost" data-a="addrow">+ Determination</button><button class="btn" data-a="calc">Calculate</button>
   <button class="btn" data-a="savem">Save test</button><button class="btn ghost" data-a="close">Close</button></p><div id="m-out"></div>`;
  drawRows(); $('#dlg').showModal();
}
function drawRows() {
  $('#m-rows').innerHTML = `<div class="tw"><table><tr><th>#</th><th>Container (g)</th><th>Wet soil + container (g)</th><th>Dry soil + container (g)</th></tr>${mrows.map((r, i) =>
    `<tr><td>${i + 1}</td>${['c', 'w', 'd'].map(f => `<td><input type="number" step="any" min="0" data-i="${i}" data-f="${f}" aria-label="Determination ${i + 1}: ${{c: 'container mass', w: 'wet soil plus container', d: 'dry soil plus container'}[f]}" value="${r[f]}"></td>`).join('')}</tr>`).join('')}</table></div>`;
}
function readRows() { document.querySelectorAll('#m-rows input').forEach(i => mrows[i.dataset.i][i.dataset.f] = i.value === '' ? '' : parseFloat(i.value)); }
function showCalc() {
  readRows(); const r = calcMoisture(mrows);
  $('#m-out').innerHTML = `${r.warnings.map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}
    ${r.out.length ? `<div class="steps">Formula: w = (Mw − Md) / (Md − Mc) × 100  [%]\n${r.out.map(x => x.step).join('\n')}\n\nMean moisture content = ${r.mean.toFixed(2)} %</div>` : '<div class="empty">No valid determinations.</div>'}`;
  return r;
}
function saveMoist() {
  const r = showCalc(); if (!r.out.length) return toast('Nothing valid to save', 'danger');
  db.tests.push({id: uid(), type: 'Moisture content', sample: $('#m-s').value, date: $('#m-d').value, standard: $('#m-std').value || 'Not specified – requires laboratory verification',
    status: 'Completed', data: clone(mrows), result: r.mean.toFixed(2) + ' %', steps: r.out.map(x => x.step), warnings: r.warnings});
  if (persist('tests')) toast('Test saved', 'success'); touchSample($('#m-s').value); $('#dlg').close(); route();
}
function viewTest(id) {
  const t = db.tests.find(x => x.id === id);
  $('#dlg').innerHTML = `<h3>${esc(t.type)} – test sheet</h3><p>Sample: ${esc(sampleNo(t.sample))} · Date: ${esc(t.date)}<br>Standard: ${esc(t.standard)}</p>
   <div class="steps">${esc(t.steps.join('\n'))}\n\nResult: ${esc(t.result)}</div>${t.warnings.map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}
   ${getCharts(t).map((c, i) => chartHtml(c, 'vc' + i)).join('')}<p class="bar noprint"><button class="btn" onclick="print()">Print</button><button class="btn ghost" data-a="csv" data-id="${t.id}">Export CSV</button><button class="btn ghost" data-a="close">Close</button></p>`;
  $('#dlg').showModal(); getCharts(t).forEach((c, i) => drawChart(c, 'vc' + i));
}
function download(name, text, mime) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: mime})); a.download = name; a.click(); }
function csvTest(id) {
  const t = db.tests.find(x => x.id === id); let s = '';
  if (t.groups) for (const [g, rs] of Object.entries(t.groups)) s += g + '\n' + (rs[0] ? Object.keys(rs[0]).join(',') : '') + '\n' + rs.map(r => Object.values(r).join(',')).join('\n') + '\n';
  else s = 'Determination,Container_g,Wet+Container_g,Dry+Container_g\n' + t.data.map((r, i) => `${i + 1},${r.c},${r.w},${r.d}`).join('\n');
  download(`${t.type.replace(/ /g, '_')}_${sampleNo(t.sample)}.csv`, s, 'text/csv');
}

/* ================= Phase 2/3: generic test framework + Sieve, Specific gravity ================= */
const N = v => (v === '' || v == null) ? NaN : parseFloat(v);
const blank = r => Object.values(r).every(v => v === '' || v === undefined);
const wcOf = (c, w, d) => (c >= 0 && d > c && w >= d) ? (w - d) / (d - c) * 100 : null; // w = (Mw-Md)/(Md-Mc)x100
const lg = Math.log10;

/* Sieve analysis: %ret = m/M x100; cum = sum; passing = 100 - cum. D-values by log-linear interpolation
   BETWEEN bracketing sieves only (no extrapolation). Cu = D60/D10; Cc = D30^2/(D10 x D60). */
function interpD(pts, P) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (a.p >= P && b.p <= P) return a.p === b.p ? b.d : Math.pow(10, lg(b.d) + (P - b.p) / (a.p - b.p) * (lg(a.d) - lg(b.d)));
  }
  return null;
}
function calcSieve(g, p) {
  const M = N(p.M), pan = isNaN(N(p.pan)) ? 0 : N(p.pan), warnings = [], steps = [];
  if (!(M > 0)) return {warnings: ['Initial dry mass must be greater than zero']};
  const rows = g.sieve.filter(r => !blank(r)).map(r => ({d: N(r.d), m: N(r.m)}));
  if (!rows.length) return {warnings: ['Enter at least one sieve']};
  if (rows.some(r => isNaN(r.d) || isNaN(r.m) || r.d <= 0 || r.m < 0)) return {warnings: ['Sieve sizes must be > 0 and masses ≥ 0; no blanks within a row']};
  if (new Set(rows.map(r => r.d)).size < rows.length) return {warnings: ['Duplicate sieve sizes']};
  rows.sort((a, b) => b.d - a.d);
  let cum = 0; const pts = [];
  steps.push('Formulae: %ret = m/M×100; cum = Σ%ret; %passing = 100 − cum');
  rows.forEach(r => { const pr = r.m / M * 100; cum += pr; const ps = 100 - cum; pts.push({d: r.d, p: ps});
    steps.push(`${r.d} mm: ${r.m} g → ret ${pr.toFixed(2)} %, cum ${cum.toFixed(2)} %, passing ${ps.toFixed(2)} %`); });
  const total = rows.reduce((a, r) => a + r.m, 0) + pan, loss = (M - total) / M * 100;
  steps.push(`Mass balance: Σ retained + pan = ${total.toFixed(2)} g vs initial ${M} g → difference ${loss.toFixed(2)} % (compare with your standard's tolerance)`);
  if (loss < 0) warnings.push('Recovered mass exceeds initial mass – check readings');
  const D = {}; [10, 30, 60].forEach(P => { D[P] = interpD(pts, P); steps.push(`D${P} = ${D[P] ? D[P].toFixed(3) + ' mm (log-linear interpolation between sieves)' : 'not determinable from grading data (no extrapolation)'}`); });
  let cu = null, cc = null;
  if (D[10] && D[30] && D[60]) { cu = D[60] / D[10]; cc = D[30] * D[30] / (D[10] * D[60]); steps.push(`Cu = D60/D10 = ${cu.toFixed(2)}; Cc = D30²/(D10×D60) = ${cc.toFixed(2)}`); }
  else warnings.push('Cu and Cc not calculated: D10, D30 and D60 are not all within the data');
  return {steps, warnings, result: `D10 ${D[10] ? D[10].toFixed(3) : 'n/d'}, D30 ${D[30] ? D[30].toFixed(3) : 'n/d'}, D60 ${D[60] ? D[60].toFixed(3) : 'n/d'} mm; Cu ${cu ? cu.toFixed(2) : 'n/d'}; Cc ${cc ? cc.toFixed(2) : 'n/d'}`,
    chart: {x: 'Particle size (mm, log)', y: 'Percentage passing (%)', xlog: true, rev: true, ds: [{label: 'Grading curve', line: true, pts: pts.map(q => ({x: q.d, y: +q.p.toFixed(3)}))}]}};
}

/* Specific gravity (pycnometer): Gs_T = (m2−m1) / [(m4−m1) − (m3−m2)]; relative to water at test temperature.
   Optional conversion to a reference temperature: Gs_ref = Gs_T × ρw(T)/ρw(ref) using water densities YOU enter (none assumed). */
function calcGs(g, p) {
  const steps = [], warnings = [], vals = [], rT = N(p.rT), rR = N(p.rR), conv = rT > 0 && rR > 0;
  if ((rT > 0) !== (rR > 0)) warnings.push('Enter both water densities for temperature correction, or neither');
  g.gs.forEach((r, i) => { if (blank(r)) return; const [m1, m2, m3, m4] = ['m1', 'm2', 'm3', 'm4'].map(k => N(r[k]));
    if ([m1, m2, m3, m4].some(isNaN) || [m1, m2, m3, m4].some(x => x < 0)) return warnings.push(`Determination ${i + 1}: incomplete or negative reading`);
    const ms = m2 - m1, den = (m4 - m1) - (m3 - m2);
    if (ms <= 0 || den <= 0) return warnings.push(`Determination ${i + 1}: invalid masses (dry soil mass or denominator ≤ 0)`);
    let gs = ms / den; steps.push(`#${i + 1}: Gs(T) = ${ms.toFixed(3)} / [(${(m4 - m1).toFixed(3)}) − (${(m3 - m2).toFixed(3)})] = ${gs.toFixed(3)}`);
    if (conv) { gs *= rT / rR; steps.push(`   corrected to reference: × ${rT}/${rR} = ${gs.toFixed(3)}`); }
    vals.push(gs); });
  if (!vals.length) return {warnings};
  const mean = vals.reduce((a, b) => a + b) / vals.length; steps.push(`Mean Gs = ${mean.toFixed(3)}${vals.length > 1 ? `; range ${(Math.max(...vals) - Math.min(...vals)).toFixed(3)} (compare with your standard's repeatability)` : ''}`);
  return {steps, warnings, result: 'Gs = ' + mean.toFixed(3) + (conv ? ' (at reference temp.)' : ' (at test temp.)')};
}

const T = {
  sieve: {name: 'Sieve analysis', calc: calcSieve, params: [['M', 'Initial dry mass (g)'], ['pan', 'Mass retained in pan (g)']],
    groups: [{id: 'sieve', title: 'Sieve readings', n: 8, cols: [['d', 'Sieve size (mm)'], ['m', 'Mass retained (g)']]}]},
  gs: {name: 'Specific gravity', calc: calcGs, params: [['T', 'Test temperature (°C)'], ['rT', 'Water density at test temp. (g/cm³, optional)'], ['rR', 'Water density at reference temp. (g/cm³, optional)']],
    groups: [{id: 'gs', title: 'Pycnometer determinations', n: 2, cols: [['m1', 'Empty pycnometer (g)'], ['m2', '+ dry soil (g)'], ['m3', '+ soil + water (g)'], ['m4', 'Filled with water (g)']]}]}
};

/* ================= Phase 3: Proctor (standard & modified), Field density, CBR ================= */
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
/* Least-squares parabola y = a·u² + b·u + c on centred x (u = x − mean). Vertex: u* = −b/2a, y* = c − b²/4a. */
function fitQuad(xs, ys) {
  const m = mean(xs), u = xs.map(x => x - m), S = k => u.reduce((s, v) => s + v ** k, 0), n = u.length;
  const Sy = ys.reduce((s, v) => s + v, 0), Suy = u.reduce((s, v, i) => s + v * ys[i], 0), Su2y = u.reduce((s, v, i) => s + v * v * ys[i], 0);
  const A = [[n, S(1), S(2)], [S(1), S(2), S(3)], [S(2), S(3), S(4)]], R = [Sy, Suy, Su2y], D = det3(A);
  if (Math.abs(D) < 1e-12) return null;
  const sol = i => det3(A.map((row, r) => row.map((v, c) => c === i ? R[r] : v))) / D;
  return {c: sol(0), b: sol(1), a: sol(2), m};
}
/* Proctor: wet density = (M_mould+soil − M_mould)/V; dry density = wet/(1 + w/100). g/cm³ ≡ Mg/m³.
   MDD/OMC = vertex of least-squares parabola through all valid points; only reported if the parabola is concave and the vertex lies inside the tested water-content range. */
function calcProctor(g, p) {
  const V = N(p.V), Mm = N(p.Mm), steps = [], warnings = [], pts = [];
  if (!(V > 0) || !(Mm >= 0)) return {warnings: ['Mould volume must be > 0 and mould mass ≥ 0']};
  steps.push('Formulae: ρ = (Mt − Mm)/V; ρd = ρ/(1 + w/100); w = (Mw − Md)/(Md − Mc)×100');
  g.pts.forEach((r, i) => { if (blank(r)) return; const mt = N(r.mt), wc = wcOf(N(r.c), N(r.w), N(r.d));
    if (isNaN(mt) || wc === null || mt <= Mm) return warnings.push(`Point ${i + 1}: invalid or incomplete readings`);
    const rho = (mt - Mm) / V, rd = rho / (1 + wc / 100); pts.push({w: wc, rd});
    steps.push(`Point ${i + 1}: ρ = (${mt} − ${Mm})/${V} = ${rho.toFixed(3)}; w = ${wc.toFixed(2)} %; ρd = ${rho.toFixed(3)}/${(1 + wc / 100).toFixed(4)} = ${rd.toFixed(3)} Mg/m³`); });
  if (!pts.length) return {warnings};
  pts.sort((x, y) => x.w - y.w);
  const ds = [{label: 'Test points', line: false, pts: pts.map(q => ({x: +q.w.toFixed(2), y: +q.rd.toFixed(3)}))}];
  let result = 'MDD / OMC not determined';
  const best = pts.reduce((a, b) => b.rd > a.rd ? b : a);
  if (pts.length < 3) warnings.push('At least 3 points are needed to fit the compaction curve');
  else {
    const f = fitQuad(pts.map(q => q.w), pts.map(q => q.rd));
    if (!f || f.a >= 0) warnings.push('Fitted curve is not concave – check readings');
    else {
      const uStar = -f.b / (2 * f.a), omc = f.m + uStar, mdd = f.c - f.b ** 2 / (4 * f.a), lo = pts[0].w, hi = pts[pts.length - 1].w;
      const curve = []; for (let i = 0; i <= 30; i++) { const x = lo + (hi - lo) * i / 30, u = x - f.m; curve.push({x: +x.toFixed(2), y: +(f.a * u * u + f.b * u + f.c).toFixed(4)}); }
      ds.push({label: 'Fitted parabola', line: true, pts: curve});
      if (omc < lo || omc > hi) warnings.push('Peak of the curve is outside the tested range – MDD/OMC not reported; add points either side of the peak');
      else { result = `MDD ${mdd.toFixed(3)} Mg/m³, OMC ${omc.toFixed(1)} %`; steps.push(`Quadratic fit: ρd = ${f.a.toFixed(5)}u² + ${f.b.toFixed(5)}u + ${f.c.toFixed(4)} (u = w − ${f.m.toFixed(3)}); vertex → OMC = ${omc.toFixed(2)} %, MDD = ${mdd.toFixed(4)} Mg/m³`); }
    }
  }
  steps.push(`Highest measured point: ρd = ${best.rd.toFixed(3)} Mg/m³ at w = ${best.w.toFixed(2)} %`);
  return {steps, warnings, result, chart: {x: 'Water content (%)', y: 'Dry density (Mg/m³)', ds}};
}

/* Field density, sand replacement: sand in hole = M1 − M2 − M_cone; V = sand in hole/ρ_sand; ρ = Mw/V; ρd = ρ/(1 + w/100); compaction = ρd/MDD×100. */
function calcSand(g, p) {
  const [M1, M2, Mc, rs, Mw, w, mdd] = ['M1', 'M2', 'Mc', 'rs', 'Mw', 'w', 'mdd'].map(k => N(p[k])), warnings = [];
  if ([M1, M2, Mc, rs, Mw, w, mdd].some(isNaN)) return {warnings: ['All fields are required, including the laboratory MDD reference']};
  if (M1 <= M2) return {warnings: ['Sand mass before must exceed sand mass after']};
  if (rs <= 0 || Mw <= 0 || w < 0 || mdd <= 0) return {warnings: ['Sand density, soil mass and MDD must be > 0; moisture content ≥ 0']};
  const used = M1 - M2, hole = used - Mc;
  if (hole <= 0) return {warnings: ['Sand used is not greater than the cone calibration mass – check readings']};
  const V = hole / rs, rho = Mw / V, rd = rho / (1 + w / 100), pc = rd / mdd * 100;
  const steps = [`Sand used = ${M1} − ${M2} = ${used.toFixed(1)} g`, `Sand in hole = ${used.toFixed(1)} − ${Mc} = ${hole.toFixed(1)} g`, `Hole volume = ${hole.toFixed(1)} / ${rs} = ${V.toFixed(1)} cm³`,
    `Wet density = ${Mw} / ${V.toFixed(1)} = ${rho.toFixed(3)} Mg/m³`, `Dry density = ${rho.toFixed(3)} / ${(1 + w / 100).toFixed(4)} = ${rd.toFixed(3)} Mg/m³`, `Compaction = ${rd.toFixed(3)} / ${mdd} × 100 = ${pc.toFixed(1)} %`];
  return {steps, warnings, result: `Dry density ${rd.toFixed(3)} Mg/m³; compaction ${pc.toFixed(1)} % of MDD ${mdd}`};
}

/* CBR = (load at penetration / standard load) × 100. Standard loads are USER-ENTERED (not assumed). Penetration is shifted by the zero correction
   you enter; loads at 2.5 and 5.0 mm are linearly interpolated between bracketing readings. Swell % = (reading − initial reading)/specimen height × 100. */
function calcCbr(g, p) {
  const s25 = N(p.s25), s50 = N(p.s50), corr = isNaN(N(p.corr)) ? 0 : N(p.corr), h0 = N(p.h0), steps = [], warnings = [];
  const rows = g.pen.filter(r => !blank(r)).map(r => ({s: N(r.s) - corr, l: N(r.l)}));
  if (rows.some(r => isNaN(r.s) || isNaN(r.l) || r.l < 0)) return {warnings: ['Penetration/load readings must be complete and non-negative']};
  rows.sort((a, b) => a.s - b.s); const parts = [], out = {};
  [[2.5, s25], [5, s50]].forEach(([t, std]) => {
    if (!(std > 0)) { warnings.push(`Standard load at ${t} mm not entered`); return; }
    for (let i = 0; i < rows.length - 1; i++) if (rows[i].s <= t && rows[i + 1].s >= t) {
      const a = rows[i], b = rows[i + 1], L = b.s === a.s ? b.l : a.l + (b.l - a.l) * (t - a.s) / (b.s - a.s);
      out[t] = L / std * 100; steps.push(`CBR ${t} mm = ${L.toFixed(3)} kN / ${std} kN × 100 = ${out[t].toFixed(1)} %`); parts.push(`CBR(${t}) ${out[t].toFixed(1)} %`); return;
    }
    warnings.push(`Penetration readings do not bracket ${t} mm`);
  });
  if (out[2.5] !== undefined && out[5] !== undefined && out[5] > out[2.5]) warnings.push('CBR at 5.0 mm exceeds CBR at 2.5 mm – apply your standard\'s rule for the reported value');
  let swc = null; const sw = g.sw.filter(r => !blank(r)).map(r => ({t: N(r.t), r: N(r.r)}));
  if (sw.length) {
    if (sw.some(x => isNaN(x.t) || isNaN(x.r)) || !(h0 > 0)) warnings.push('Swell: complete readings and specimen height are required');
    else { sw.sort((a, b) => a.t - b.t); const f = sw[sw.length - 1], pct = (f.r - sw[0].r) / h0 * 100; steps.push(`Swell = (${f.r} − ${sw[0].r}) / ${h0} × 100 = ${pct.toFixed(2)} %`); parts.push(`Swell ${pct.toFixed(2)} %`); swc = sw.map(x => ({x: x.t, y: +((x.r - sw[0].r) / h0 * 100).toFixed(3)})); }
  }
  if (!parts.length) return {warnings};
  return {steps, warnings, result: parts.join('; '), cbr: out, charts: [rows.length ? {title: 'CBR – load vs penetration', x: 'Corrected penetration (mm)', y: 'Load (kN)', ds: [{label: 'Load–penetration', line: true, pts: rows.map(r => ({x: +r.s.toFixed(3), y: r.l}))}]} : null,
    swc ? {title: 'Swell vs time', x: 'Time (h)', y: 'Swell (%)', ds: [{label: 'Swell', line: true, pts: swc}]} : null].filter(Boolean)};
}

const pr = (name, extra) => ({name, calc: calcProctor, params: [['V', 'Mould volume (cm³)'], ['Mm', 'Mould mass (g)'], ...extra],
  groups: [{id: 'pts', title: 'Compaction points (use ≥ 3, ideally 5)', n: 5, cols: [['mt', 'Mould + wet soil (g)'], ['c', 'Container (g)'], ['w', 'Wet soil + cont. (g)'], ['d', 'Dry soil + cont. (g)']]}]});
Object.assign(T, {
  proctor: pr('Standard Proctor', [['rammer', 'Rammer mass (record)', 'text'], ['drop', 'Drop height (record)', 'text'], ['layers', 'Layers (record)', 'text'], ['blows', 'Blows per layer (record)', 'text']]),
  modproctor: pr('Modified Proctor', [['rammer', 'Rammer mass (record)', 'text'], ['drop', 'Drop height (record)', 'text'], ['layers', 'Layers (record)', 'text'], ['blows', 'Blows per layer (record)', 'text'], ['mould', 'Mould dimensions (record)', 'text']]),
  sand: {name: 'Field density (sand replacement)', calc: calcSand, groups: [], params: [['M1', 'Mass of sand before test (g)'], ['M2', 'Mass of sand after test (g)'], ['Mc', 'Sand in cone – calibration (g)'],
    ['rs', 'Sand calibration density (g/cm³)'], ['Mw', 'Mass of excavated wet soil (g)'], ['w', 'Moisture content of soil (%)'], ['mdd', 'Laboratory MDD reference (Mg/m³)']]},
  cbr: {name: 'CBR', calc: calcCbr, params: [['s25', 'Standard load at 2.5 mm (kN) – from your standard'], ['s50', 'Standard load at 5.0 mm (kN) – from your standard'], ['corr', 'Penetration zero correction (mm, optional)'],
    ['cond', 'Soaked / unsoaked (record)', 'text'], ['soak', 'Soaking period (record)', 'text'], ['sur', 'Surcharge mass (record)', 'text'], ['h0', 'Specimen height for swell (mm)']],
    groups: [{id: 'pen', title: 'Penetration readings', n: 12, cols: [['s', 'Penetration (mm)'], ['l', 'Load (kN)']]}, {id: 'sw', title: 'Swell readings (optional)', n: 5, cols: [['t', 'Time (h)'], ['r', 'Dial reading (mm)']]}]}
});

/* ================= Phase 4: UCS, Direct shear, Triaxial ================= */
/* Least-squares line y = m·x + b (needs at least 2 distinct x). */
function linreg(xs, ys) {
  const mx = mean(xs), my = mean(ys), sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (xs.length < 2 || sxx < 1e-12) return null;
  const m = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx; return {m, b: my - m * mx};
}
const sigColors = ['#2563EB', '#16A34A', '#F59E0B', '#DC2626', '#7C3AED', '#0891B2'];

/* UCS: strain e = ΔH/H0; corrected area Ac = A0/(1 − e) (right-cylinder area correction); stress = P/Ac. A0 = πD²/4.
   qu = maximum stress; cu = qu/2 (undrained shear strength, φu = 0 interpretation). N/mm² × 1000 = kPa. */
function calcUcs(g, p) {
  const H0 = N(p.H0), D0 = N(p.D0), steps = [], warnings = [];
  if (!(H0 > 0) || !(D0 > 0)) return {warnings: ['Initial height and diameter must be greater than zero']};
  const rows = g.u.filter(r => !blank(r)).map(r => ({dh: N(r.dh), P: N(r.P)}));
  if (!rows.length) return {warnings: ['Enter at least one reading']};
  if (rows.some(r => isNaN(r.dh) || isNaN(r.P) || r.dh < 0 || r.P < 0 || r.dh >= H0)) return {warnings: ['Readings must be complete, non-negative, and deformation must be less than the initial height']};
  rows.sort((a, b) => a.dh - b.dh);
  const A0 = Math.PI * D0 * D0 / 4; steps.push(`A0 = π×${D0}²/4 = ${A0.toFixed(1)} mm²; ε = ΔH/H0; Ac = A0/(1−ε); σ = P/Ac × 1000 [kPa]`);
  const pts = rows.map(r => { const e = r.dh / H0, Ac = A0 / (1 - e), s = r.P / Ac * 1000; steps.push(`ΔH ${r.dh} mm: ε = ${(e * 100).toFixed(2)} %, Ac = ${Ac.toFixed(1)} mm², σ = ${s.toFixed(1)} kPa`); return {e: e * 100, s}; });
  const top = pts.reduce((a, b) => b.s > a.s ? b : a), qu = top.s;
  steps.push(`qu = ${qu.toFixed(1)} kPa at ε = ${top.e.toFixed(2)} %; cu = qu/2 = ${(qu / 2).toFixed(1)} kPa`);
  if (top === pts[pts.length - 1] && pts.length > 1) warnings.push('Maximum stress occurs at the last reading – the peak may not have been reached; apply your standard\'s failure criterion');
  return {steps, warnings, result: `qu = ${qu.toFixed(1)} kPa (ε ${top.e.toFixed(2)} %); cu = ${(qu / 2).toFixed(1)} kPa`,
    charts: [{title: 'UCS – stress vs strain', x: 'Axial strain (%)', y: 'Compressive stress (kPa)', ds: [{label: 'Stress–strain', line: true, pts: pts.map(q => ({x: +q.e.toFixed(3), y: +q.s.toFixed(2)}))}]}]};
}

/* Direct shear: σ = Fn/A, τ = Fs/A (×1000 → kPa). Peak τ per specimen. Envelope τ = c + σ·tanφ by least squares through the peak points (needs ≥ 2 specimens at different σ).
   Residual strength is not derived: no residual criterion is assumed. */
function calcDs(g, p) {
  const A = N(p.A), steps = [], warnings = [];
  if (!(A > 0)) return {warnings: ['Specimen area must be greater than zero']};
  const sp = {};
  for (const [i, r] of g.ds.entries()) {
    if (blank(r)) continue; const s = N(r.s), fn = N(r.fn), d = N(r.d), fs = N(r.fs);
    if ([s, fn, d, fs].some(isNaN) || s <= 0 || fn <= 0 || d < 0 || fs < 0) { warnings.push(`Row ${i + 1}: incomplete or invalid`); continue; }
    const o = sp[s] || (sp[s] = {fn, pts: []}); if (o.fn !== fn) warnings.push(`Specimen ${s}: normal force differs between rows – first value used`);
    o.pts.push({d, t: fs / A * 1000});
  }
  const ids = Object.keys(sp).sort((a, b) => a - b); if (!ids.length) return {warnings};
  steps.push(`σ = Fn/A × 1000, τ = Fs/A × 1000 [kPa], A = ${A} mm²`);
  const peaks = [], ds1 = [];
  ids.forEach(id => { const o = sp[id]; o.pts.sort((a, b) => a.d - b.d); const sig = o.fn / A * 1000, pk = o.pts.reduce((a, b) => b.t > a.t ? b : a);
    peaks.push({s: sig, t: pk.t}); steps.push(`Specimen ${id}: σ = ${sig.toFixed(1)} kPa, peak τ = ${pk.t.toFixed(1)} kPa at ${pk.d} mm`);
    ds1.push({label: `Specimen ${id} (σ ${sig.toFixed(0)} kPa)`, line: true, pts: o.pts.map(q => ({x: q.d, y: +q.t.toFixed(2)}))}); });
  const charts = [{title: 'Shear stress vs horizontal displacement', x: 'Horizontal displacement (mm)', y: 'Shear stress (kPa)', ds: ds1}];
  const f = peaks.length >= 2 ? linreg(peaks.map(q => q.s), peaks.map(q => q.t)) : null; let result;
  if (!f) { warnings.push('Cohesion and friction angle need at least 2 specimens with different normal stresses'); result = `Peak τ: ${peaks.map(q => q.t.toFixed(1)).join(', ')} kPa`; }
  else {
    const phi = Math.atan(f.m) * 180 / Math.PI, smax = Math.max(...peaks.map(q => q.s));
    steps.push(`Envelope τ = c + σ·tanφ (least squares): c = ${f.b.toFixed(2)} kPa, tanφ = ${f.m.toFixed(4)} → φ = ${phi.toFixed(2)}°`);
    if (f.b < 0) warnings.push('Negative intercept – check readings; reported as calculated');
    if (peaks.length === 2) warnings.push('Only two specimens: the envelope has no redundancy; 3 or more are recommended');
    result = `c = ${f.b.toFixed(1)} kPa, φ = ${phi.toFixed(1)}° (peak, as tested)`;
    charts.push({title: 'Mohr–Coulomb failure envelope', x: 'Normal stress (kPa)', y: 'Peak shear stress (kPa)', ds: [{label: 'Peak points', line: false, pts: peaks.map(q => ({x: +q.s.toFixed(2), y: +q.t.toFixed(2)}))},
      {label: 'Envelope', line: true, pr: 0, pts: [0, smax * 1.1].map(x => ({x, y: +(f.b + f.m * x).toFixed(2)}))}]});
  }
  return {steps, warnings, result, charts};
}

/* Triaxial: failure = peak deviator stress per specimen (documented criterion; others need verification). σ3 = cell pressure, σ1 = σ3 + q,
   effective: σ' = σ − u (u at the failure reading). Circles: centre p = (σ1+σ3)/2, radius r = q/2.
   Envelope from line r = a + p·tanα: sinφ = tanα, c = a/cosφ. Deviator stress is entered as measured (no area correction is applied here). */
function circle(c, r) { const o = []; for (let i = 0; i <= 40; i++) { const th = Math.PI * i / 40; o.push({x: +(c + r * Math.cos(th)).toFixed(2), y: +(r * Math.sin(th)).toFixed(2)}); } return o; }
function calcTx(g, p) {
  const steps = [], warnings = [], sp = {};
  for (const [i, r] of g.tx.entries()) {
    if (blank(r)) continue; const s = N(r.s), c3 = N(r.c3), e = N(r.e), q = N(r.q), u = N(r.u);
    if ([s, c3, e, q].some(isNaN) || s <= 0 || c3 < 0 || e < 0 || q < 0) { warnings.push(`Row ${i + 1}: incomplete or invalid`); continue; }
    const o = sp[s] || (sp[s] = {c3, pts: []}); if (o.c3 !== c3) warnings.push(`Specimen ${s}: cell pressure differs between rows – first value used`);
    o.pts.push({e, q, u});
  }
  const ids = Object.keys(sp).sort((a, b) => a - b); if (!ids.length) return {warnings};
  const ss = [], cs = []; let effOk = true;
  ids.forEach(id => { const o = sp[id]; o.pts.sort((a, b) => a.e - b.e); const f = o.pts.reduce((a, b) => b.q > a.q ? b : a), s1 = o.c3 + f.q, hasU = !isNaN(f.u);
    if (!hasU) effOk = false; cs.push({id, s3: o.c3, s1, q: f.q, u: f.u, hasU});
    steps.push(`Specimen ${id}: σ3 = ${o.c3} kPa, peak q = ${f.q.toFixed(1)} kPa at ε = ${f.e} % → σ1 = ${s1.toFixed(1)} kPa` + (hasU ? `; u = ${f.u} → σ3' = ${(o.c3 - f.u).toFixed(1)}, σ1' = ${(s1 - f.u).toFixed(1)} kPa` : ''));
    ss.push({label: `Specimen ${id} (σ3 ${o.c3} kPa)`, line: true, pts: o.pts.map(q => ({x: q.e, y: q.q}))}); });
  const charts = [{title: 'Deviator stress vs axial strain', x: 'Axial strain (%)', y: 'Deviator stress (kPa)', ds: ss}], mohr = [];
  const fit = (list, tag) => {
    const out = list.map(c => ({p: (c.s1 + c.s3) / 2, r: c.q / 2})); mohr.push(...list.map((c, i) => ({label: `${tag} circle ${c.id}`, line: true, pr: 0, pts: circle(out[i].p, out[i].r)})));
    if (list.length < 2) return `${tag}: need ≥ 2 specimens`;
    const f = linreg(out.map(o => o.p), out.map(o => o.r)); if (!f) return `${tag}: circles are not distinct enough to fit an envelope`;
    if (f.m <= -1 || f.m >= 1) return `${tag}: fitted slope outside valid range – check readings`;
    const phi = Math.asin(f.m), c = f.b / Math.cos(phi), smax = Math.max(...list.map(x => x.s1)); steps.push(`${tag} envelope: sinφ = ${f.m.toFixed(4)} → φ = ${(phi * 180 / Math.PI).toFixed(2)}°, c = ${c.toFixed(2)} kPa`);
    mohr.push({label: `${tag} envelope`, line: true, pr: 0, pts: [0, smax * 1.1].map(x => ({x, y: +(c + x * Math.tan(phi)).toFixed(2)}))});
    return `${tag}: c = ${c.toFixed(1)} kPa, φ = ${(phi * 180 / Math.PI).toFixed(1)}°`;
  };
  const res = [fit(cs, 'Total')];
  if (effOk) res.push(fit(cs.map(c => ({id: c.id, s3: c.s3 - c.u, s1: c.s1 - c.u, q: c.q})), 'Effective')); else res.push('Effective: not calculated (pore pressure missing at failure)');
  if (cs.length === 2) warnings.push('Only two specimens: 3 or more are recommended for the envelope');
  charts.push({title: 'Mohr circles and failure envelope', x: 'Normal stress (kPa)', y: 'Shear stress (kPa)', ds: mohr});
  return {steps, warnings, result: res.join('; '), charts};
}

Object.assign(T, {
  ucs: {name: 'Unconfined compressive strength', calc: calcUcs, params: [['H0', 'Initial specimen height (mm)'], ['D0', 'Initial specimen diameter (mm)'], ['m0', 'Initial specimen mass (g, record)'], ['rate', 'Test rate (record)', 'text']],
    groups: [{id: 'u', title: 'Axial readings', n: 12, cols: [['dh', 'Axial deformation (mm)'], ['P', 'Applied load (N)']]}]},
  directshear: {name: 'Direct shear', calc: calcDs, params: [['A', 'Specimen area (mm²)'], ['rate', 'Shear rate (record)', 'text']],
    groups: [{id: 'ds', title: 'Readings (one specimen number per normal load; use ≥ 3 specimens)', n: 18, cols: [['s', 'Specimen no.'], ['fn', 'Normal force (N)'], ['d', 'Horizontal disp. (mm)'], ['fs', 'Shear force (N)'], ['v', 'Vertical disp. (mm, record)']]}]},
  triaxial: {name: 'Triaxial compression', calc: calcTx, params: [['type', 'Test type: UU / CU / CD (record)', 'text'], ['cons', 'Consolidation / drainage info (record)', 'text'], ['H0', 'Specimen height (mm, record)'], ['D0', 'Specimen diameter (mm, record)']],
    groups: [{id: 'tx', title: 'Readings (one specimen number per confining pressure; u optional but needed for effective stresses)', n: 24, cols: [['s', 'Specimen no.'], ['c3', 'Cell / confining pressure (kPa)'], ['e', 'Axial strain (%)'], ['q', 'Deviator stress (kPa)'], ['u', 'Pore pressure (kPa)']]}]}
});

/* ================= Phase 5: Consolidation, Permeability, Swell, Free swell, Linear shrinkage, Relative density ================= */
const ex4 = x => x.toExponential(3);

/* Swell test: swell % = (R − R0)/H0 × 100 with R0 = first reading (a dial INCREASE means expansion). Optional cross-check from final height. */
function calcSwell(g, p) {
  const H0 = N(p.H0), Hf = N(p.Hf), steps = [], warnings = [];
  if (!(H0 > 0)) return {warnings: ['Initial specimen height must be greater than zero']};
  const rows = g.sw.filter(r => !blank(r)).map(r => ({t: N(r.t), r: N(r.r)}));
  if (!rows.length || rows.some(r => isNaN(r.t) || isNaN(r.r) || r.t < 0)) return {warnings: ['Enter complete, non-negative time and dial readings']};
  rows.sort((a, b) => a.t - b.t); const r0 = rows[0].r;
  steps.push(`Swell (%) = (R − R0)/H0 × 100; R0 = ${r0} mm (first reading), H0 = ${H0} mm`);
  const pts = rows.map(q => { const s = (q.r - r0) / H0 * 100; steps.push(`t = ${q.t} h: R = ${q.r} mm → swell ${s.toFixed(3)} %`); return {x: q.t, y: +s.toFixed(4)}; });
  const parts = [`Swell ${pts[pts.length - 1].y.toFixed(2)} % at ${rows[rows.length - 1].t} h`];
  if (Hf > 0) { const sh = (Hf - H0) / H0 * 100; steps.push(`From heights: (${Hf} − ${H0})/${H0} × 100 = ${sh.toFixed(3)} % (compare with the dial result)`); parts.push(`from final height ${sh.toFixed(2)} %`); }
  if (rows.length < 2) warnings.push('Only one reading: no swell–time curve');
  return {steps, warnings, result: parts.join('; '), charts: [{title: 'Swell vs time', x: 'Time (h)', y: 'Swell (%)', ds: [{label: 'Swell', line: true, pts}]}]};
}
/* Free swell index = (Vd − Vk)/Vk × 100, Vd = settled volume in water, Vk = settled volume in the reference liquid (confirm against your selected method). */
function calcFsi(g) {
  const steps = [], warnings = [], vals = [];
  g.f.forEach((r, i) => { if (blank(r)) return; const vd = N(r.vd), vk = N(r.vk);
    if (isNaN(vd) || isNaN(vk) || vd < 0 || !(vk > 0)) return warnings.push(`Determination ${i + 1}: invalid or incomplete`);
    const v = (vd - vk) / vk * 100; vals.push(v); steps.push(`#${i + 1}: (${vd} − ${vk}) / ${vk} × 100 = ${v.toFixed(1)} %`); });
  if (!vals.length) return {warnings};
  return {steps, warnings, result: `Free swell index = ${mean(vals).toFixed(1)} %` + (vals.length > 1 ? ` (mean of ${vals.length})` : '')};
}
/* Linear shrinkage (%) = (1 − Ld/L0) × 100. */
function calcLs(g) {
  const steps = [], warnings = [], vals = [];
  g.l.forEach((r, i) => { if (blank(r)) return; const l0 = N(r.l0), ld = N(r.ld);
    if (isNaN(l0) || isNaN(ld) || !(l0 > 0) || !(ld > 0)) return warnings.push(`Determination ${i + 1}: invalid or incomplete`);
    if (ld > l0) warnings.push(`Determination ${i + 1}: dry length exceeds mould length (negative shrinkage) – check readings`);
    const v = (1 - ld / l0) * 100; vals.push(v); steps.push(`#${i + 1}: (1 − ${ld}/${l0}) × 100 = ${v.toFixed(2)} %`); });
  if (!vals.length) return {warnings};
  return {steps, warnings, result: `Linear shrinkage = ${mean(vals).toFixed(1)} %`};
}
/* Relative density, two separate bases (never mixed): density Dr = ρmax(ρ − ρmin)/[ρ(ρmax − ρmin)] × 100; void ratio Dr = (emax − e)/(emax − emin) × 100. */
function calcRd(g, p) {
  const [rx, rn, r, ex, en, e] = ['rmax', 'rmin', 'r', 'emax', 'emin', 'e'].map(k => N(p[k])), steps = [], warnings = [], parts = [];
  const set = a => a.filter(v => !isNaN(v)).length;
  if (set([rx, rn, r]) === 3) {
    if (!(rn > 0) || rx <= rn || !(r > 0)) warnings.push('Density basis: need ρd,max > ρd,min > 0 and ρd > 0');
    else { const d = rx * (r - rn) / (r * (rx - rn)) * 100; steps.push(`Density basis: Dr = ${rx}×(${r} − ${rn}) / [${r}×(${rx} − ${rn})] × 100 = ${d.toFixed(1)} %`); parts.push(`Dr (density basis) ${d.toFixed(1)} %`);
      if (r < rn || r > rx) warnings.push('Natural density lies outside the min–max range'); }
  } else if (set([rx, rn, r]) > 0) warnings.push('Density basis incomplete');
  if (set([ex, en, e]) === 3) {
    if (en < 0 || ex <= en) warnings.push('Void-ratio basis: need e,max > e,min ≥ 0');
    else { const d = (ex - e) / (ex - en) * 100; steps.push(`Void-ratio basis: Dr = (${ex} − ${e}) / (${ex} − ${en}) × 100 = ${d.toFixed(1)} %`); parts.push(`Dr (void-ratio basis) ${d.toFixed(1)} %`);
      if (e > ex || e < en) warnings.push('Natural void ratio lies outside the min–max range'); }
  } else if (set([ex, en, e]) > 0) warnings.push('Void-ratio basis incomplete');
  if (!parts.length) return {warnings};
  if (parts.length === 2) warnings.push('Two bases entered and reported separately; report the basis your selected method specifies');
  return {steps, warnings, result: parts.join('; ')};
}
/* Permeability. Constant head: k = Q·L/(A·h·t). Falling head: k = (a·L)/(A·t)·ln(h1/h2). Units: cm, cm², cm³, s → k in cm/s (×0.01 = m/s).
   Optional temperature correction: k_ref = k_T × η_T/η_ref using viscosities YOU enter (none assumed). */
function kPrep(p, steps, warnings) {
  const vt = N(p.vt), vr = N(p.vr), conv = vt > 0 && vr > 0;
  if ((vt > 0) !== (vr > 0)) warnings.push('Enter both viscosities for temperature correction, or neither');
  return conv ? vt / vr : 1;
}
function kResult(vals, steps, warnings, conv, charts) {
  if (!vals.length) return {warnings};
  const m = mean(vals); steps.push(`Mean k = ${ex4(m)} cm/s = ${ex4(m / 100)} m/s` + (conv !== 1 ? ' (temperature-corrected)' : ''));
  return {steps, warnings, result: `k = ${ex4(m)} cm/s (${ex4(m / 100)} m/s)`, charts};
}
function calcKch(g, p) {
  const L = N(p.L), A = N(p.A), h = N(p.h), steps = [], warnings = [], vals = [], f = kPrep(p, steps, warnings);
  if (!(L > 0) || !(A > 0) || !(h > 0)) return {warnings: ['Length, area and head difference must be greater than zero']};
  g.k.forEach((r, i) => { if (blank(r)) return; const q = N(r.q), t = N(r.t);
    if (!(q > 0) || !(t > 0)) return warnings.push(`Determination ${i + 1}: Q and t must be greater than zero`);
    const k = q * L / (A * h * t) * f; vals.push(k); steps.push(`#${i + 1}: k = ${q}×${L} / (${A}×${h}×${t})${f !== 1 ? ` × ${f.toFixed(4)}` : ''} = ${ex4(k)} cm/s`); });
  return kResult(vals, steps, warnings, f, [{title: 'Permeability by determination', x: 'Determination no.', y: 'k (cm/s)', ds: [{label: 'k', line: false, pts: vals.map((v, i) => ({x: i + 1, y: v}))}]}]);
}
function calcKfh(g, p) {
  const L = N(p.L), A = N(p.A), a = N(p.a), steps = [], warnings = [], vals = [], ds = [], f = kPrep(p, steps, warnings);
  if (!(L > 0) || !(A > 0) || !(a > 0)) return {warnings: ['Length, specimen area and standpipe area must be greater than zero']};
  g.k.forEach((r, i) => { if (blank(r)) return; const h1 = N(r.h1), h2 = N(r.h2), t = N(r.t);
    if (!(h1 > h2) || !(h2 > 0) || !(t > 0)) return warnings.push(`Determination ${i + 1}: need h1 > h2 > 0 and t > 0`);
    const k = a * L / (A * t) * Math.log(h1 / h2) * f; vals.push(k); steps.push(`#${i + 1}: k = ${a}×${L}/(${A}×${t}) × ln(${h1}/${h2})${f !== 1 ? ` × ${f.toFixed(4)}` : ''} = ${ex4(k)} cm/s`);
    ds.push({label: `Determination ${i + 1}`, line: true, pts: [{x: 0, y: h1}, {x: t, y: h2}]}); });
  return kResult(vals, steps, warnings, f, ds.length ? [{title: 'Head vs elapsed time', x: 'Elapsed time (s)', y: 'Head (cm)', ds}] : []);
}

/* One-dimensional consolidation. Hs = H0/(1+e0); e = e0 − (R − R0)/Hs (dial INCREASE = compression, readings already corrected for apparatus compressibility).
   av = −Δe/Δσ'; mv = av/(1+e_prev); Cc, Cr = −slope of e vs log10 σ'. Cv by Taylor √t: line through the early points (≤ 60 % of the increment's total movement),
   t90 where the curve meets the line with abscissa ×1.15, Cv = 0.848·Hdr²/t90. Casagrande log-time and preconsolidation pressure are NOT computed. */
function taylor(pts, rs, rf) {
  const tot = rf - rs; if (!(tot > 0)) return null;
  const lin = pts.filter(q => (q.r - rs) / tot <= 0.6); if (lin.length < 3) return null;
  const f = linreg(lin.map(q => Math.sqrt(q.t)), lin.map(q => q.r)); if (!f || f.m <= 0) return null;
  const m90 = f.m / 1.15, d0 = f.b, gap = q => q.r - (d0 + m90 * Math.sqrt(q.t));
  for (let i = 0; i < pts.length - 1; i++) { const ga = gap(pts[i]), gb = gap(pts[i + 1]);
    if (ga > 0 && gb <= 0) { const sa = Math.sqrt(pts[i].t), sb = Math.sqrt(pts[i + 1].t), s = sa + ga / (ga - gb) * (sb - sa); return {t90: s * s, d0}; } }
  return null;
}
function calcConsol(g, p) {
  const H0 = N(p.H0), w0 = N(p.w0), Gs = N(p.Gs), r0 = N(p.r0), faces = N(p.faces) === 1 ? 1 : 2, steps = [], warnings = []; let e0 = N(p.e0);
  if (!(H0 > 0) || isNaN(r0)) return {warnings: ['Initial specimen height and initial dial reading are required']};
  if (isNaN(e0)) {
    if (w0 >= 0 && Gs > 0) { e0 = w0 * Gs / 100; steps.push(`e0 = w0·Gs/100 = ${e0.toFixed(4)} (assumes 100 % saturation)`); warnings.push('e0 computed assuming full saturation – enter e0 directly if known'); }
    else return {warnings: ['Enter e0, or both initial water content and Gs']};
  }
  const inc = g.inc.filter(r => !blank(r)).map(r => ({p: N(r.p), rf: N(r.rf)}));
  if (!inc.length || inc.some(x => isNaN(x.p) || isNaN(x.rf) || x.p <= 0)) return {warnings: ['Enter complete increments (pressure > 0 and final dial reading)']};
  const Hs = H0 / (1 + e0); steps.push(`Hs = H0/(1+e0) = ${Hs.toFixed(3)} mm; e = e0 − (R − R0)/Hs`);
  inc.forEach((x, i) => { x.c = x.rf - r0; x.e = e0 - x.c / Hs; steps.push(`Inc ${i + 1}: σ' = ${x.p} kPa, compression ${x.c.toFixed(3)} mm, H = ${(H0 - x.c).toFixed(3)} mm, e = ${x.e.toFixed(4)}`); if (x.e <= 0) warnings.push(`Increment ${i + 1}: void ratio ≤ 0 – check readings`); });
  const loadIdx = inc.map((x, i) => i).filter(i => i > 0 && inc[i].p > inc[i - 1].p);
  loadIdx.forEach(i => { const a = (inc[i - 1].e - inc[i].e) / (inc[i].p - inc[i - 1].p); steps.push(`Inc ${i + 1}: av = ${ex4(a)} kPa⁻¹, mv = ${ex4(a / (1 + inc[i - 1].e))} kPa⁻¹`); });
  const parts = [`e0 ${e0.toFixed(3)}`], c1 = N(p.cc1), c2 = N(p.cc2); let idx;
  if (c1 >= 1 && c2 > c1 && c2 <= inc.length) idx = inc.map((x, i) => i).filter(i => i + 1 >= c1 && i + 1 <= c2);
  else { idx = [...new Set(loadIdx.slice(-2).flatMap(i => [i - 1, i]))]; if (loadIdx.length) warnings.push('Cc range defaulted to the last loading increments – enter "from / to increment no." to choose the straight-line portion'); }
  const fc = idx.length >= 2 ? linreg(idx.map(i => lg(inc[i].p)), idx.map(i => inc[i].e)) : null;
  if (fc && fc.m < 0) { steps.push(`Cc = −Δe/Δlog10σ' = ${(-fc.m).toFixed(4)} (increments ${idx.map(i => i + 1).join(', ')})`); parts.push(`Cc ${(-fc.m).toFixed(3)}`); } else warnings.push('Cc not determined');
  const pk = inc.reduce((a, x, i) => x.p > inc[a].p ? i : a, 0), un = [pk]; for (let i = pk + 1; i < inc.length && inc[i].p < inc[i - 1].p; i++) un.push(i);
  if (un.length >= 2) { const fr = linreg(un.map(i => lg(inc[i].p)), un.map(i => inc[i].e)); if (fr && fr.m < 0) { steps.push(`Cr (unloading, increments ${un.map(i => i + 1).join(', ')}) = ${(-fr.m).toFixed(4)}`); parts.push(`Cr ${(-fr.m).toFixed(3)}`); } }
  const byInc = {}; g.tm.filter(r => !blank(r)).forEach((r, k) => { const n = N(r.inc), t = N(r.t), v = N(r.r);
    if (!(n >= 1 && n <= inc.length) || !(t >= 0) || isNaN(v)) { warnings.push(`Time reading ${k + 1}: invalid increment, time or reading`); return; } (byInc[n] = byInc[n] || []).push({t, r: v}); });
  const dl = [], st = [];
  Object.keys(byInc).sort((a, b) => a - b).forEach(n => {
    const pts = byInc[n].sort((a, b) => a.t - b.t), rs = n == 1 ? r0 : inc[n - 2].rf, rf = inc[n - 1].rf, lab = `Increment ${n} (${inc[n - 1].p} kPa)`;
    dl.push({label: lab, line: true, pts: pts.filter(q => q.t > 0).map(q => ({x: q.t, y: q.r}))}); st.push({label: lab, line: true, pts: pts.map(q => ({x: q.t, y: +(q.r - rs).toFixed(4)}))});
    const tv = taylor(pts.filter(q => q.t > 0), rs, rf);
    if (!tv) { warnings.push(`Increment ${n}: Taylor t90 not determined (needs ≥ 3 early points and a curve crossing the 1.15 line)`); return; }
    const Havg = H0 - ((rs - r0) + (rf - r0)) / 2, Hdr = faces === 2 ? Havg / 2 : Havg, cv = 0.848 * Hdr * Hdr / tv.t90;
    steps.push(`Inc ${n}: t90 = ${tv.t90.toFixed(2)} min, Hdr = ${Hdr.toFixed(3)} mm (${faces} drainage face${faces === 2 ? 's' : ''}), Cv = 0.848×Hdr²/t90 = ${cv.toFixed(4)} mm²/min = ${(cv * 0.5256).toFixed(3)} m²/year`);
    parts.push(`Cv(${n}) ${(cv * 0.5256).toFixed(2)} m²/yr`);
  });
  const charts = [{title: 'Void ratio vs log effective pressure', x: "Effective pressure σ' (kPa, log)", y: 'Void ratio e', xlog: true, ds: [{label: 'e–log σ\'', line: true, pts: inc.map(x => ({x: x.p, y: +x.e.toFixed(4)}))}]}];
  if (dl.length) { charts.push({title: 'Dial reading vs log time', x: 'Time (min, log)', y: 'Dial reading (mm)', xlog: true, ds: dl}); charts.push({title: 'Settlement vs time', x: 'Time (min)', y: 'Settlement in increment (mm)', ds: st}); }
  return {steps, warnings, result: parts.join('; '), charts};
}

Object.assign(T, {
  consol: {name: 'One-dimensional consolidation', calc: calcConsol, params: [['H0', 'Initial specimen height (mm)'], ['D', 'Specimen diameter (mm, record)'], ['w0', 'Initial water content (%)'], ['Gs', 'Specific gravity of solids'], ['e0', 'Initial void ratio (optional; else w0·Gs/100)'],
    ['r0', 'Initial dial reading (mm; increase = compression)'], ['faces', 'Drainage faces (1 or 2)'], ['cc1', 'Cc fit: from increment no. (optional)'], ['cc2', 'Cc fit: to increment no. (optional)']],
    groups: [{id: 'inc', title: 'Loading increments in test order (final dial reading at end of each increment)', n: 8, cols: [['p', "Effective pressure σ' (kPa)"], ['rf', 'Final dial reading (mm)']]},
      {id: 'tm', title: 'Time readings (optional, for Cv)', n: 30, cols: [['inc', 'Increment no.'], ['t', 'Elapsed time (min)'], ['r', 'Dial reading (mm)']]}]},
  constantk: {name: 'Constant head permeability', calc: calcKch, params: [['L', 'Specimen length (cm)'], ['A', 'Specimen area (cm²)'], ['h', 'Head difference (cm)'], ['T', 'Water temperature (°C, record)'], ['vt', 'Water viscosity at test temp. (optional)'], ['vr', 'Water viscosity at reference temp. (optional)']],
    groups: [{id: 'k', title: 'Determinations', n: 3, cols: [['q', 'Collected volume Q (cm³)'], ['t', 'Time (s)']]}]},
  fallingk: {name: 'Falling head permeability', calc: calcKfh, params: [['L', 'Specimen length (cm)'], ['A', 'Specimen area (cm²)'], ['a', 'Standpipe area (cm²)'], ['T', 'Water temperature (°C, record)'], ['vt', 'Water viscosity at test temp. (optional)'], ['vr', 'Water viscosity at reference temp. (optional)']],
    groups: [{id: 'k', title: 'Determinations', n: 3, cols: [['h1', 'Initial head h1 (cm)'], ['h2', 'Final head h2 (cm)'], ['t', 'Elapsed time (s)']]}]},
  swell: {name: 'Swell test', calc: calcSwell, params: [['H0', 'Initial specimen height (mm)'], ['Hf', 'Final specimen height (mm, optional)'], ['sur', 'Applied surcharge (record)', 'text'], ['soak', 'Soaking conditions (record)', 'text']],
    groups: [{id: 'sw', title: 'Dial readings (first reading = zero reference)', n: 8, cols: [['t', 'Time (h)'], ['r', 'Dial reading (mm)']]}]},
  fsi: {name: 'Free swell index', calc: calcFsi, params: [['m', 'Dry soil mass (g, record)'], ['liq', 'Reference liquid (record)', 'text']],
    groups: [{id: 'f', title: 'Determinations', n: 2, cols: [['vd', 'Settled volume in water Vd (mL)'], ['vk', 'Settled volume in reference liquid Vk (mL)']]}]},
  shrink: {name: 'Linear shrinkage', calc: calcLs, params: [['prep', 'Sample preparation (record)', 'text']],
    groups: [{id: 'l', title: 'Determinations', n: 2, cols: [['l0', 'Initial mould length (mm)'], ['ld', 'Final dry length (mm)']]}]},
  reldens: {name: 'Relative density', calc: calcRd, params: [['rmax', 'Maximum dry density (Mg/m³)'], ['rmin', 'Minimum dry density (Mg/m³)'], ['r', 'Natural dry density (Mg/m³)'], ['emax', 'Maximum void ratio'], ['emin', 'Minimum void ratio'], ['e', 'Natural void ratio']], groups: []}
});

/* ================= Phase 6: Organic matter, pH, Sulphate, Chloride, Soaked CBR, CBR swell ================= */
const sd = a => a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - mean(a)) ** 2, 0) / (a.length - 1)) : 0;

/* Organic matter – ONE method per test, chosen explicitly; data for the other method is ignored (never mixed).
   Loss on ignition: OM % = (M_dry+crucible − M_ignited+crucible)/(M_dry+crucible − M_crucible) × 100.
   Chemical oxidation (titration): OC % = (Vblank − Vsample) × N × k / m × 100 with titrant normality N and carbon equivalent k (g C per meq) ENTERED by you;
   OM % = OC % × the conversion factor you enter (if any). */
function calcOm(g, p) {
  const steps = [], warnings = [], vals = [], loi = p.method === 'Loss on ignition';
  if (!loi && p.method !== 'Chemical oxidation (titration)') return {warnings: ['Select a method']};
  const other = loi ? g.ox : g.loi; if (other.some(r => !blank(r))) warnings.push('Data entered for the other method was ignored – methods are never mixed');
  if (loi) {
    g.loi.forEach((r, i) => { if (blank(r)) return; const c = N(r.c), d = N(r.d), a = N(r.a);
      if ([c, d, a].some(isNaN) || c < 0 || !(d > c) || a < c || a > d) return warnings.push(`Determination ${i + 1}: need dry+crucible > crucible and crucible ≤ ignited ≤ dry+crucible`);
      const v = (d - a) / (d - c) * 100; vals.push(v); steps.push(`#${i + 1}: OM = (${d} − ${a}) / (${d} − ${c}) × 100 = ${v.toFixed(2)} %`); });
    if (!vals.length) return {warnings};
    return {steps, warnings, result: `Organic matter (loss on ignition) = ${mean(vals).toFixed(2)} %`};
  }
  const nrm = N(p.nrm), k = N(p.k), vb = N(p.vb), fac = N(p.fac);
  if (!(nrm > 0) || !(k > 0) || isNaN(vb)) return {warnings: ['Enter titrant normality, carbon equivalent (g per meq) and blank titre']};
  g.ox.forEach((r, i) => { if (blank(r)) return; const m = N(r.m), vs = N(r.vs);
    if (!(m > 0) || isNaN(vs) || vs < 0 || vs > vb) return warnings.push(`Determination ${i + 1}: need mass > 0 and 0 ≤ sample titre ≤ blank titre`);
    const oc = (vb - vs) * nrm * k / m * 100; vals.push(oc); steps.push(`#${i + 1}: OC = (${vb} − ${vs}) × ${nrm} × ${k} / ${m} × 100 = ${oc.toFixed(3)} %`); });
  if (!vals.length) return {warnings};
  const oc = mean(vals); let res = `Organic carbon (chemical oxidation) = ${oc.toFixed(3)} %`;
  if (fac > 0) { steps.push(`OM = OC × ${fac} = ${(oc * fac).toFixed(3)} %`); res += `; organic matter = ${(oc * fac).toFixed(3)} % (factor ${fac})`; } else warnings.push('No OC→OM factor entered: organic matter not reported');
  return {steps, warnings, result: res};
}
/* pH: reports mean, range and SD of replicate readings and the buffer errors (reading − nominal). Tolerances are OPTIONAL and entered by you; none are assumed. */
function calcPh(g, p) {
  const steps = [], warnings = [], vals = [];
  g.ph.forEach((r, i) => { if (blank(r)) return; const v = N(r.r);
    if (isNaN(v) || v < 0 || v > 14) return warnings.push(`Reading ${i + 1}: must be between 0 and 14`); vals.push(v); steps.push(`Reading ${i + 1}: pH ${v}`); });
  if (!vals.length) return {warnings};
  const m = mean(vals), range = Math.max(...vals) - Math.min(...vals), s = sd(vals), tolR = N(p.tolR), tolC = N(p.tolC), mass = N(p.m), vol = N(p.v);
  if (mass > 0 && vol > 0) steps.push(`Solid : solution = ${mass} g : ${vol} mL (${(vol / mass).toFixed(2)} mL/g)`);
  steps.push(`Mean pH = ${m.toFixed(2)}; range = ${range.toFixed(2)}; SD = ${s.toFixed(3)}; n = ${vals.length}`);
  if (tolR > 0 && range > tolR) warnings.push(`Replicate range ${range.toFixed(2)} exceeds your tolerance ${tolR}`);
  const buf = [[N(p.b1), N(p.r1)], [N(p.b2), N(p.r2)]].filter(x => !isNaN(x[0]) && !isNaN(x[1]));
  if (!buf.length) warnings.push('No calibration data entered – measurement quality cannot be assessed');
  buf.forEach(([b, r], i) => { const e = r - b; steps.push(`Calibration check ${i + 1}: buffer ${b}, reading ${r}, error ${e >= 0 ? '+' : ''}${e.toFixed(2)}`); if (tolC > 0 && Math.abs(e) > tolC) warnings.push(`Buffer ${b}: error ${e.toFixed(2)} exceeds your tolerance ${tolC} – result flagged`); });
  return {steps, warnings, result: `pH ${m.toFixed(2)} (n = ${vals.length}, range ${range.toFixed(2)})${p.temp ? ` at ${p.temp} °C` : ''}`};
}
/* Extract-based chemistry (sulphate, chloride): extract mg = mg in aliquot × (V_extract/V_aliquot) × dilution; mg/kg = extract mg / (sample g/1000); % = mg/kg / 10000. Reporting basis (dry / as-received) is stated in the result. */
function extFinish(list, p, name, steps, warnings) {
  const ve = N(p.ve), va = N(p.va), df = N(p.df) > 0 ? N(p.df) : 1;
  if (!(ve > 0) || !(va > 0)) return {warnings: [...warnings, 'Total extract volume and aliquot volume must be greater than zero']};
  if (!list.length) return {warnings};
  const vals = list.map(x => { const ext = x.mg * (ve / va) * df, mk = ext / (x.m / 1000); steps.push(`#${x.i}: ${name} in aliquot ${x.mg.toFixed(3)} mg → whole extract ${ext.toFixed(2)} mg (×${(ve / va).toFixed(3)}${df !== 1 ? `, dilution ×${df}` : ''}) → ${mk.toFixed(1)} mg/kg = ${(mk / 1e4).toFixed(4)} %`); return mk; });
  const m = mean(vals); return {steps, warnings, result: `${name} = ${m.toFixed(1)} mg/kg (${(m / 1e4).toFixed(4)} %) of ${p.basis || 'soil (basis not stated)'}`};
}
/* Sulphate (gravimetric, BaSO4): SO4 mg in aliquot = (M_BaSO4 − blank) × F × 1000, F = SO4/BaSO4 mass ratio ENTERED by you. */
function calcSo4(g, p) {
  const steps = [], warnings = [], list = [], F = N(p.f), bl = isNaN(N(p.bl)) ? 0 : N(p.bl);
  if (!(F > 0)) return {warnings: ['Enter the gravimetric factor SO4/BaSO4']};
  g.s.forEach((r, i) => { if (blank(r)) return; const m = N(r.m), c = N(r.c), cp = N(r.cp), ppt = cp - c - bl;
    if (!(m > 0) || isNaN(c) || isNaN(cp) || !(ppt >= 0)) return warnings.push(`Determination ${i + 1}: need mass > 0 and precipitate (net of blank) ≥ 0`);
    list.push({i: i + 1, m, mg: ppt * F * 1000}); steps.push(`#${i + 1}: BaSO4 = ${cp} − ${c} − blank ${bl} = ${ppt.toFixed(4)} g; SO4 = ${ppt.toFixed(4)} × ${F} × 1000`); });
  return extFinish(list, p, 'Sulphate (SO4)', steps, warnings);
}
/* Chloride (titration): Cl mg in aliquot = (V_sample − V_blank) × M × E, M = titrant molarity, E = chloride equivalent mass (mg per mmol), both ENTERED by you. */
function calcCl(g, p) {
  const steps = [], warnings = [], list = [], M = N(p.mol), E = N(p.eq), vb = isNaN(N(p.vbl)) ? 0 : N(p.vbl);
  if (!(M > 0) || !(E > 0)) return {warnings: ['Enter titrant molarity and the chloride equivalent mass (mg per mmol)']};
  g.c.forEach((r, i) => { if (blank(r)) return; const m = N(r.m), vs = N(r.vs), net = vs - vb;
    if (!(m > 0) || isNaN(vs) || !(net >= 0)) return warnings.push(`Determination ${i + 1}: need mass > 0 and titre ≥ blank titre`);
    list.push({i: i + 1, m, mg: net * M * E}); steps.push(`#${i + 1}: Cl = (${vs} − ${vb}) × ${M} × ${E} = ${(net * M * E).toFixed(3)} mg`); });
  return extFinish(list, p, 'Chloride (Cl)', steps, warnings);
}
/* Soaked CBR: uses the same CBR calculation as the CBR module (no duplicate maths) and adds an unsoaked-vs-soaked comparison when you supply unsoaked CBR values. */
function calcSoaked(g, p) {
  const r = calcCbr(g, p); if (!r.result) return r;
  if (!p.soak) r.warnings.push('Soaking period not recorded');
  const u = [[2.5, N(p.u25)], [5, N(p.u50)]].filter(x => !isNaN(x[1])), s = [2.5, 5].filter(t => r.cbr && r.cbr[t] !== undefined).map(t => [t, r.cbr[t]]);
  u.forEach(([t, v]) => { if (r.cbr && r.cbr[t] !== undefined && v > 0) r.steps.push(`Soaked / unsoaked at ${t} mm = ${r.cbr[t].toFixed(1)} / ${v} × 100 = ${(r.cbr[t] / v * 100).toFixed(0)} %`); });
  if (u.length && s.length) r.charts.push({title: 'CBR comparison – unsoaked vs soaked', x: 'Penetration (mm)', y: 'CBR (%)', ds: [{label: 'Unsoaked', line: false, pr: 8, pts: u.map(([x, y]) => ({x, y}))}, {label: 'Soaked', line: false, pr: 8, pts: s.map(([x, y]) => ({x, y}))}]});
  return r;
}

Object.assign(T, {
  organic: {name: 'Organic matter content', calc: calcOm, params: [['method', 'Method (one only)', 'select', ['Loss on ignition', 'Chemical oxidation (titration)']], ['temp', 'Ignition temperature (record, LOI)', 'text'], ['dur', 'Ignition duration (record, LOI)', 'text'],
    ['nrm', 'Titrant normality (oxidation method)'], ['k', 'Carbon equivalent, g C per meq (oxidation method)'], ['vb', 'Blank titre, mL (oxidation method)'], ['fac', 'OC → OM conversion factor (optional)']],
    groups: [{id: 'loi', title: 'Loss on ignition determinations', n: 2, cols: [['c', 'Crucible (g)'], ['d', 'Crucible + dry soil (g)'], ['a', 'Crucible + ignited soil (g)']]}, {id: 'ox', title: 'Chemical oxidation determinations', n: 2, cols: [['m', 'Soil mass (g)'], ['vs', 'Sample titre (mL)']]}]},
  ph: {name: 'Soil pH', calc: calcPh, params: [['m', 'Soil mass (g)'], ['v', 'Water / solution volume (mL)'], ['liq', 'Solution used (record)', 'text'], ['temp', 'Temperature (°C, record)', 'text'], ['b1', 'Calibration buffer 1 – nominal pH'], ['r1', 'Meter reading in buffer 1'], ['b2', 'Calibration buffer 2 – nominal pH'], ['r2', 'Meter reading in buffer 2'],
    ['tolC', 'Max buffer error (optional – from your method)'], ['tolR', 'Max replicate range (optional – from your method)']],
    groups: [{id: 'ph', title: 'Electrode readings (replicates)', n: 3, cols: [['r', 'pH reading']]}]},
  sulphate: {name: 'Sulphate content', calc: calcSo4, params: [['basis', 'Reporting basis', 'select', ['dry soil', 'as-received soil']], ['f', 'Gravimetric factor SO4/BaSO4 (= M(SO4)/M(BaSO4))'], ['bl', 'Blank BaSO4 mass (g)'], ['ve', 'Total extract volume (mL)'], ['va', 'Aliquot volume precipitated (mL)'], ['df', 'Extra dilution factor (optional, default 1)']],
    groups: [{id: 's', title: 'Determinations (gravimetric BaSO4)', n: 2, cols: [['m', 'Soil mass (g)'], ['c', 'Crucible (g)'], ['cp', 'Crucible + BaSO4 (g)']]}]},
  chloride: {name: 'Chloride content', calc: calcCl, params: [['basis', 'Reporting basis', 'select', ['dry soil', 'as-received soil']], ['mol', 'Titrant molarity (mol/L)'], ['eq', 'Chloride equivalent mass (mg per mmol)'], ['vbl', 'Blank titre (mL)'], ['ve', 'Total extract volume (mL)'], ['va', 'Aliquot titrated (mL)'], ['df', 'Extra dilution factor (optional, default 1)']],
    groups: [{id: 'c', title: 'Determinations (titration)', n: 2, cols: [['m', 'Soil mass (g)'], ['vs', 'Sample titre (mL)']]}]},
  soakedcbr: {name: 'Soaked CBR', calc: calcSoaked, params: [['s25', 'Standard load at 2.5 mm (kN) – from your standard'], ['s50', 'Standard load at 5.0 mm (kN) – from your standard'], ['corr', 'Penetration zero correction (mm, optional)'], ['soak', 'Soaking period (record)', 'text'], ['sur', 'Surcharge mass (record)', 'text'],
    ['h0', 'Specimen height for swell (mm)'], ['u25', 'Unsoaked CBR at 2.5 mm (%, optional – comparison)'], ['u50', 'Unsoaked CBR at 5.0 mm (%, optional – comparison)']], groups: T.cbr.groups},
  cbrswell: {name: 'CBR swell measurement', calc: calcSwell, params: [['H0', 'Specimen height (mm)'], ['Hf', 'Final specimen height (mm, optional)'], ['link', 'Linked soaked CBR test reference (record)', 'text'], ['sur', 'Applied surcharge (record)', 'text'], ['soak', 'Soaking conditions (record)', 'text']], groups: T.swell.groups}
});
let cur = null, chart = null;
function gForm(key) {
  if (!db.samples.length) return toast('Register a sample first', 'danger');
  const t = T[key]; cur = {key, groups: {}};
  t.groups.forEach(g => cur.groups[g.id] = Array.from({length: g.n}, () => ({})));
  $('#dlg').innerHTML = `<h3>${t.name}</h3><div class="note">Standard and edition are not assumed. Enter the reference you are working to; formulae are shown with every result.</div><div class="ff">
   <div><label>Sample</label><select id="g-s">${db.samples.map(s => `<option value="${s.id}">${esc(s.no)}</option>`).join('')}</select></div>
   <div><label>Test date</label><input id="g-d" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
   <div><label>Standard / method reference</label><input id="g-std" value="${esc(cfg.std)}"></div>
   ${t.params.map(([k, l, ty, o]) => `<div><label>${l}</label>${ty === 'select' ? `<select data-p="${k}">${o.map(x => `<option>${x}</option>`).join('')}</select>` : `<input type="${ty || 'number'}" step="any" min="0" data-p="${k}">`}</div>`).join('')}</div>
   <div id="g-area"></div><p class="bar"><button class="btn" data-a="gcalc">Calculate</button><button class="btn" data-a="gsave">Save test</button><button class="btn ghost" data-a="close">Close</button></p><div id="g-out"></div>`;
  gDraw(); $('#dlg').showModal();
}
function gDraw() {
  $('#g-area').innerHTML = T[cur.key].groups.map(g => `<h4>${g.title}</h4><div class="tw"><table><tr><th>#</th>${g.cols.map(c => `<th>${c[1]}</th>`).join('')}</tr>${cur.groups[g.id].map((r, i) =>
    `<tr><td>${i + 1}</td>${g.cols.map(c => `<td><input type="number" step="any" min="0" data-g="${g.id}" data-i="${i}" data-f="${c[0]}" aria-label="${esc(c[1])}, row ${i + 1}" value="${r[c[0]] ?? ''}"></td>`).join('')}</tr>`).join('')}</table></div>
    <button class="btn sm ghost" data-a="gadd" data-g="${g.id}">+ row</button>`).join('');
}
function gRead() {
  cur.params = {}; document.querySelectorAll('#dlg [data-p]').forEach(i => cur.params[i.dataset.p] = i.value);
  document.querySelectorAll('#g-area input').forEach(i => cur.groups[i.dataset.g][i.dataset.i][i.dataset.f] = i.value);
}
function gCalc() {
  gRead(); const r = T[cur.key].calc(cur.groups, cur.params), cs = getCharts(r);
  $('#g-out').innerHTML = `${(r.warnings || []).map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}${r.result ? `<div class="steps">${esc(r.steps.join('\n'))}\n\nRESULT: ${esc(r.result)}</div>${cs.map((c, i) => chartHtml(c, 'gc' + i)).join('')}` : ''}`;
  cs.forEach((c, i) => drawChart(c, 'gc' + i));
  return r;
}
function gSave() {
  const r = gCalc(); if (!r.result) return toast('Nothing valid to save – no results fabricated', 'danger');
  db.tests.push({id: uid(), type: T[cur.key].name, sample: $('#g-s').value, date: $('#g-d').value, standard: $('#g-std').value || 'Not specified – requires laboratory verification',
    status: 'Completed', params: cur.params, groups: clone(cur.groups), result: r.result, steps: r.steps, warnings: r.warnings, charts: getCharts(r)});
  if (persist('tests')) toast('Test saved', 'success'); touchSample($('#g-s').value); $('#dlg').close(); route();
}

/* ================= Graph module: multi-chart support, PNG export, print, Graphs page, dashboard charts ================= */
const CH = {};
const getCharts = r => r.charts || (r.chart ? [r.chart] : []);
let chartReady = false;
function chartSetup() { // white background so exported PNGs are readable in both themes
  if (chartReady) return; Chart.defaults.color = '#263445'; Chart.defaults.borderColor = '#E2E8F0';
  Chart.register({id: 'bg', beforeDraw(c) { const x = c.ctx; x.save(); x.globalCompositeOperation = 'destination-over'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.restore(); }});
  chartReady = true;
}
function drawChart(spec, id) {
  if (typeof Chart === 'undefined') return toast('Chart.js did not load (internet needed for the CDN)', 'danger');
  chartSetup(); if (CH[id]) CH[id].destroy();
  CH[id] = new Chart($('#' + id), {type: 'scatter', data: {datasets: spec.ds.map(d => ({label: d.label, data: d.pts, showLine: d.line, pointRadius: d.pr ?? (d.line ? 3 : 5), borderWidth: 2}))},
    options: {responsive: true, plugins: {title: {display: !!spec.title, text: spec.title}, legend: {display: true}, tooltip: {enabled: true}},
      scales: {x: {type: spec.xlog ? 'logarithmic' : 'linear', reverse: !!spec.rev, grid: {display: true}, title: {display: true, text: spec.x}}, y: {grid: {display: true}, title: {display: true, text: spec.y}}}}});
}
function drawBar(id, title, obj) {
  if (typeof Chart === 'undefined') return; chartSetup(); if (CH[id]) CH[id].destroy();
  const labels = Object.keys(obj).sort();
  CH[id] = new Chart($('#' + id), {type: 'bar', data: {labels, datasets: [{label: title, data: labels.map(l => obj[l]), backgroundColor: '#2563EB'}]},
    options: {responsive: true, plugins: {legend: {display: false}}, scales: {y: {beginAtZero: true, ticks: {precision: 0}}}}});
}
const chartHtml = (spec, id) => `<div class="cw"><canvas id="${id}" height="220"></canvas><div class="bar noprint">
  <button class="btn sm ghost" data-a="gpng" data-c="${id}">Export PNG</button><button class="btn sm ghost" data-a="gprint" data-c="${id}">Print graph</button></div></div>`;
function gPng(id) { const a = document.createElement('a'); a.href = $('#' + id).toDataURL('image/png'); a.download = id + '.png'; a.click(); }
function gPrint(id) {
  const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print the graph', 'danger');
  w.document.write(`<img src="${$('#' + id).toDataURL('image/png')}" style="max-width:100%"><script>onload=()=>print()<\/script>`); w.document.close();
}
function drawDash() { // dashboard charts computed from saved tests
  if (!$('#d1')) return;
  if (!db.tests.length) { ['d1', 'd2'].forEach(i => $('#' + i).parentNode.innerHTML += '<div class="empty">No data yet.</div>'); return; }
  const byType = {}, byMonth = {};
  db.tests.forEach(t => { byType[t.type] = (byType[t.type] || 0) + 1; const m = (t.date || '').slice(0, 7); if (m) byMonth[m] = (byMonth[m] || 0) + 1; });
  drawBar('d1', 'Tests', byType); drawBar('d2', 'Tests', byMonth);
}
function graphs() {
  const ts = db.tests.filter(t => getCharts(t).length);
  if (!ts.length) { $('#view').innerHTML = '<div class="card empty">No graphs yet. Save a test that produces a graph (Sieve, Atterberg, Proctor, CBR, strength, consolidation, permeability, swell) and it will appear here.</div>'; return; }
  $('#view').innerHTML = `<div class="bar"><select id="gsel" style="max-width:420px">${ts.map(t => `<option value="${t.id}">${esc(t.type)} – ${esc(sampleNo(t.sample))} – ${esc(t.date)}</option>`).join('')}</select></div><div class="card" id="gp"></div>`;
  const show = () => { const cs = getCharts(ts.find(x => x.id === $('#gsel').value)); $('#gp').innerHTML = cs.map((c, i) => chartHtml(c, 'gg' + i)).join(''); cs.forEach((c, i) => drawChart(c, 'gg' + i)); };
  $('#gsel').onchange = show; show();
}

/* ================= Atterberg limits: Casagrande OR cone penetrometer (one method per test, never mixed) =================
   Casagrande: flow line w = a + b·log10(N); LL = w at N = 25.
   Cone penetrometer: linear flow line w = a + b·d (d = mean penetration, mm); LL = w at the penetration YOU enter (taken from your standard/cone). No value is assumed.
   PL = mean water content of determinations; PI = LL − PL. */
function calcAtt(g, p) {
  const steps = [], warnings = [], pts = [], pls = [], cone = p.method === 'Cone penetrometer';
  if (!cone && p.method !== 'Casagrande (percussion)') return {warnings: ['Select the liquid limit method']};
  if ((cone ? g.LL : g.CP).some(r => !blank(r))) warnings.push('Data entered for the other liquid limit method was ignored – methods are never mixed');
  if (cone) g.CP.forEach((r, i) => { if (blank(r)) return; const a = N(r.p1), b = N(r.p2), pen = isNaN(b) ? a : (a + b) / 2, wc = wcOf(N(r.c), N(r.w), N(r.d));
    if (!(pen > 0) || wc === null) warnings.push(`Cone determination ${i + 1}: invalid or incomplete`);
    else { pts.push({x: pen, wc}); steps.push(`Cone ${i + 1}: penetration ${pen.toFixed(2)} mm${isNaN(b) ? '' : ` (mean of ${a} and ${b})`}, w = ${wc.toFixed(2)} %`); } });
  else g.LL.forEach((r, i) => { if (blank(r)) return; const n = N(r.n), wc = wcOf(N(r.c), N(r.w), N(r.d));
    if (!(n > 0) || wc === null) warnings.push(`LL determination ${i + 1}: invalid or incomplete`); else { pts.push({x: n, wc}); steps.push(`LL ${i + 1}: N = ${n}, w = ${wc.toFixed(2)} %`); } });
  g.PL.forEach((r, i) => { if (blank(r)) return; const wc = wcOf(N(r.c), N(r.w), N(r.d));
    if (wc === null) warnings.push(`PL determination ${i + 1}: invalid or incomplete`); else { pls.push(wc); steps.push(`PL ${i + 1}: w = ${wc.toFixed(2)} %`); } });
  let LL = null, PL = null, ds = [];
  if (new Set(pts.map(q => q.x)).size >= 2) {
    const tp = cone ? N(p.tp) : 25;
    if (cone && !(tp > 0)) warnings.push('Enter the penetration at which the liquid limit is read (from your standard)');
    else {
      const f = linreg(pts.map(q => cone ? q.x : lg(q.x)), pts.map(q => q.wc)), yv = x => f.b + f.m * (cone ? x : lg(x)); LL = yv(tp);
      steps.push(cone ? `Flow line (linear): w = ${f.b.toFixed(3)} + (${f.m.toFixed(4)})·d; LL = w at d = ${tp} mm = ${LL.toFixed(2)} %` : `Flow line: w = ${f.b.toFixed(3)} + (${f.m.toFixed(3)})·log10(N); LL = w at N = 25 = ${LL.toFixed(2)} %`);
      if (cone ? f.m <= 0 : f.m >= 0) warnings.push(cone ? 'Flow line slope is not positive – check readings' : 'Flow line slope is not negative – check readings');
      const lo = Math.min(...pts.map(q => q.x)), hi = Math.max(...pts.map(q => q.x));
      if (tp < lo || tp > hi) warnings.push(`${cone ? tp + ' mm penetration' : '25 blows'} lies outside the tested range: LL is extrapolated`);
      ds = [{label: 'Determinations', line: false, pts: pts.map(q => ({x: q.x, y: +q.wc.toFixed(2)}))}, {label: 'Flow line', line: true, pr: 0, pts: [Math.min(lo, tp), Math.max(hi, tp)].map(x => ({x, y: +yv(x).toFixed(2)}))},
        {label: 'Liquid limit', line: false, pr: 8, pts: [{x: tp, y: +LL.toFixed(2)}]}];
    }
  } else warnings.push('Liquid limit needs at least 2 valid determinations with different ' + (cone ? 'penetrations' : 'blow counts'));
  if (pls.length) { PL = mean(pls); steps.push(`PL = mean of ${pls.length} = ${PL.toFixed(2)} %`); } else warnings.push('Plastic limit: no valid determinations');
  if (LL !== null && PL !== null) steps.push(`PI = LL − PL = ${LL.toFixed(2)} − ${PL.toFixed(2)} = ${(LL - PL).toFixed(2)}`);
  if (LL === null && PL === null) return {warnings};
  return {steps, warnings, result: `LL ${LL !== null ? LL.toFixed(1) : 'n/d'} % (${cone ? 'cone penetrometer' : 'Casagrande'}), PL ${PL !== null ? PL.toFixed(1) : 'n/d'} %, PI ${LL !== null && PL !== null ? (LL - PL).toFixed(1) : 'n/d'}`,
    chart: ds.length ? {title: 'Liquid limit flow curve', x: cone ? 'Cone penetration (mm)' : 'Number of blows (log)', y: 'Water content (%)', xlog: !cone, ds} : null};
}
T.atterberg = {name: 'Atterberg limits', calc: calcAtt, params: [['method', 'Liquid limit method (one only)', 'select', ['Casagrande (percussion)', 'Cone penetrometer']], ['tp', 'Cone: penetration at which LL is read (mm) – from your standard'],
  ['cone', 'Cone mass / angle (record)', 'text'], ['cup', 'Casagrande apparatus (record)', 'text']],
  groups: [{id: 'LL', title: 'Casagrande liquid limit determinations', n: 4, cols: [['n', 'Blows'], ['c', 'Container (g)'], ['w', 'Wet soil + cont. (g)'], ['d', 'Dry soil + cont. (g)']]},
    {id: 'CP', title: 'Cone penetrometer determinations (penetration = mean of readings; reading 2 optional)', n: 4, cols: [['p1', 'Penetration reading 1 (mm)'], ['p2', 'Penetration reading 2 (mm)'], ['c', 'Container (g)'], ['w', 'Wet soil + cont. (g)'], ['d', 'Dry soil + cont. (g)']]},
    {id: 'PL', title: 'Plastic limit determinations', n: 3, cols: [['c', 'Container (g)'], ['w', 'Wet soil + cont. (g)'], ['d', 'Dry soil + cont. (g)']]}]};

/* ================= Phase 7: laboratory settings, reports, global search, filters, pagination ================= */
const CFG_DEF = {lab: '', addr: '', tel: '', email: '', logo: '', fmt: 'RPT-{YYYY}-{NNN}', footer: '', std: '', dateFmt: 'yyyy-mm-dd', tested: '', checked: '', approved: ''};
let cfg = Object.assign({}, CFG_DEF); try { Object.assign(cfg, JSON.parse(localStorage.getItem('soillab_settings')) || {}); } catch {}
function saveCfg() { try { localStorage.setItem('soillab_settings', JSON.stringify(cfg)); return true; } catch { toast('Could not save settings (storage full? try a smaller logo)', 'danger'); return false; } }
const CATS = {'Soil identification and classification': ['Sieve analysis', 'Atterberg limits', 'Specific gravity', 'Moisture content'], 'Compaction': ['Standard Proctor', 'Modified Proctor', 'Field density (sand replacement)'],
  'Soil strength': ['CBR', 'Soaked CBR', 'Unconfined compressive strength', 'Direct shear', 'Triaxial compression'], 'Consolidation and permeability': ['One-dimensional consolidation', 'Constant head permeability', 'Falling head permeability'],
  'Specialised soil tests': ['Swell test', 'Free swell index', 'Linear shrinkage', 'Organic matter content', 'Soil pH', 'Sulphate content', 'Chloride content', 'Relative density', 'CBR swell measurement']};
const catOf = n => Object.keys(CATS).find(c => CATS[c].includes(n)) || 'Other';
const allTypes = () => ['Moisture content', ...Object.values(T).map(t => t.name)];
const testBtns = () => ['<button class="btn" data-a="moist">+ Moisture content</button>', ...Object.entries(T).map(([k, t]) => `<button class="btn" data-a="gnew" data-t="${k}">+ ${esc(t.name)}</button>`)].join('');
const fmtD = d => !d ? '' : cfg.dateFmt === 'dd/mm/yyyy' ? String(d).split('-').reverse().join('/') : d;
const ctx = t => { const s = db.samples.find(x => x.id === t.sample) || {}; return {s, p: db.projects.find(x => x.id === s.project) || {}}; };
const hasW = t => t.warnings && t.warnings.length;
const go = h => location.hash === h ? route() : (location.hash = h);
let tf = {q: '', from: '', to: '', proj: '', type: '', cat: '', st: '', page: 1}, rf = {q: '', st: '', page: 1}, gq = ''; const PS = 25;
const opts = (arr, all) => `<option value="">${all}</option>` + arr.map(([v, l]) => `<option value="${esc(v)}">${esc(l ?? v)}</option>`).join('');
const pager = (n, page, key) => { const pg = Math.max(1, Math.ceil(n / PS)); return `<div class="pg noprint"><button class="btn sm ghost" data-a="pg" data-k="${key}" data-d="-1">‹ Prev</button> Page ${Math.min(page, pg)} of ${pg} (${n} records) <button class="btn sm ghost" data-a="pg" data-k="${key}" data-d="1">Next ›</button></div>`; };
function wireFilters(st, draw) { document.querySelectorAll('.fl [data-f]').forEach(i => { i.value = st[i.dataset.f]; i.oninput = i.onchange = () => { st[i.dataset.f] = i.value; st.page = 1; draw(); }; }); }
const filterT = () => db.tests.filter(t => { const {s, p} = ctx(t), hay = [t.type, t.result, t.date, s.no, p.name, p.client, p.ref, catOf(t.type)].join(' ').toLowerCase();
  return (!tf.q || hay.includes(tf.q.toLowerCase())) && (!tf.from || t.date >= tf.from) && (!tf.to || t.date <= tf.to) && (!tf.proj || p.id === tf.proj) && (!tf.type || t.type === tf.type) && (!tf.cat || catOf(t.type) === tf.cat) && (!tf.st || (tf.st === 'review' ? hasW(t) : !hasW(t))); })
  .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

/* ---- Tests page: filters, sorting (newest first), pagination ---- */
function tests() {
  $('#view').innerHTML = `<div class="note">Record a test with the buttons, then use Report on any saved test to issue a laboratory report. Hydrometer follows once your standard is chosen.</div><div class="bar">${testBtns()}</div>
   <div class="fl noprint"><input data-f="q" placeholder="Search tests…"><input data-f="from" type="date" title="From date"><input data-f="to" type="date" title="To date">
   <select data-f="proj">${opts(db.projects.map(p => [p.id, p.ref + ' – ' + p.name]), 'All projects')}</select><select data-f="cat">${opts(Object.keys(CATS).map(c => [c]), 'All categories')}</select>
   <select data-f="type">${opts(allTypes().map(c => [c]), 'All test types')}</select><select data-f="st"><option value="">All statuses</option><option value="ok">Completed – no warnings</option><option value="review">Needs review</option></select></div><div class="card" id="tl"></div>`;
  wireFilters(tf, drawT); drawT();
}
function drawT() {
  const all = filterT(), pg = Math.max(1, Math.ceil(all.length / PS)); tf.page = Math.min(tf.page, pg);
  const rows = all.slice((tf.page - 1) * PS, tf.page * PS);
  $('#tl').innerHTML = rows.length ? `<div class="tw"><table><tr><th>Date</th><th>Test</th><th>Category</th><th>Sample</th><th>Result</th><th></th></tr>${rows.map(t => `<tr><td>${esc(t.date)}</td><td>${esc(t.type)}</td><td>${esc(catOf(t.type))}</td><td>${esc(sampleNo(t.sample))}</td><td>${esc(t.result)}${hasW(t) ? ' ⚠' : ''}</td>
    <td><button class="btn sm ghost" data-a="viewt" data-id="${t.id}">View / print</button> <button class="btn sm ghost" data-a="newrep" data-id="${t.id}">Report</button> <button class="btn sm red" data-a="del" data-k="tests" data-id="${t.id}">Delete</button></td></tr>`).join('')}</table></div>${pager(all.length, tf.page, 't')}`
    : '<div class="empty">No tests match. Adjust the filters or record a test with the buttons above.</div>';
}

/* ---- Reports ---- */
function reports() {
  $('#view').innerHTML = `<div class="bar"><button class="btn" data-a="newrep">+ New report</button></div><div class="fl noprint"><input data-f="q" placeholder="Search reports…"><select data-f="st">${opts(['Draft', 'Issued', 'Approved'].map(x => [x]), 'All statuses')}</select></div><div class="card" id="rl"></div>`;
  wireFilters(rf, drawR); drawR();
}
function drawR() {
  const all = db.reports.filter(r => { const t = db.tests.find(x => x.id === r.testId) || {}, hay = [r.no, r.status, t.type, sampleNo(t.sample), r.tested].join(' ').toLowerCase(); return (!rf.q || hay.includes(rf.q.toLowerCase())) && (!rf.st || r.status === rf.st); })
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')), pg = Math.max(1, Math.ceil(all.length / PS)); rf.page = Math.min(rf.page, pg);
  const rows = all.slice((rf.page - 1) * PS, rf.page * PS);
  $('#rl').innerHTML = rows.length ? `<div class="tw"><table><tr><th>Report no.</th><th>Date</th><th>Test</th><th>Sample</th><th>Status</th><th></th></tr>${rows.map(r => { const t = db.tests.find(x => x.id === r.testId) || {};
    return `<tr><td>${esc(r.no)}</td><td>${esc(fmtD(r.date))}</td><td>${esc(t.type || '(test deleted)')}</td><td>${esc(sampleNo(t.sample))}</td><td>${esc(r.status)}</td>
    <td><button class="btn sm ghost" data-a="viewrep" data-id="${r.id}">Open</button> <button class="btn sm ghost" data-a="editrep" data-id="${r.id}">Edit</button> <button class="btn sm red" data-a="del" data-k="reports" data-id="${r.id}">Delete</button></td></tr>`; }).join('')}</table></div>${pager(all.length, rf.page, 'r')}`
    : '<div class="empty">No reports yet. Use “+ New report”, or the Report button on a saved test.</div>';
}
function nextNo() { const y = new Date().getFullYear(); let n = db.reports.length + 1, no; do { no = (cfg.fmt || CFG_DEF.fmt).replace('{YYYY}', y).replace('{NNN}', String(n).padStart(3, '0')); n++; } while (db.reports.some(r => r.no === no)); return no; }
function repForm(id, testId) {
  if (!db.tests.length) return toast('Save a test first – reports are generated from saved tests', 'danger');
  const r = db.reports.find(x => x.id === id) || {}, tv = r.testId || testId || db.tests[db.tests.length - 1].id;
  $('#dlg').innerHTML = `<form method="dialog" id="rf"><h3>${id ? 'Edit' : 'New'} report</h3><div class="ff">
   <div><label>Test</label><select name="testId" required>${db.tests.map(t => `<option value="${t.id}" ${t.id === tv ? 'selected' : ''}>${esc(t.type)} – ${esc(sampleNo(t.sample))} – ${esc(t.date)}</option>`).join('')}</select></div>
   <div><label>Report number</label><input name="no" required value="${esc(r.no || nextNo())}"></div>
   <div><label>Report date</label><input name="date" type="date" value="${esc(r.date || new Date().toISOString().slice(0, 10))}"></div>
   <div><label>Status</label><select name="status">${['Draft', 'Issued', 'Approved'].map(x => `<option ${x === (r.status || 'Draft') ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
   <div><label>Tested by</label><input name="tested" value="${esc(r.tested ?? cfg.tested)}"></div><div><label>Checked by</label><input name="checked" value="${esc(r.checked ?? cfg.checked)}"></div>
   <div><label>Approved by</label><input name="approved" value="${esc(r.approved ?? cfg.approved)}"></div></div>
   <label>Equipment details (optional)</label><textarea name="equip">${esc(r.equip)}</textarea>
   <label>Specification comparison (optional – enter the requirement and your conclusion)</label><textarea name="spec">${esc(r.spec)}</textarea>
   <p class="bar"><button class="btn">Save and view</button><button type="button" class="btn ghost" data-a="close">Cancel</button></p></form>`;
  $('#dlg').showModal();
  $('#rf').onsubmit = e => { const d = Object.fromEntries(new FormData(e.target));
    if (db.reports.some(x => x.id !== id && x.no === d.no)) { e.preventDefault(); return toast('Duplicate report number', 'danger'); }
    let rec = r; if (id) Object.assign(r, d); else { rec = {id: uid(), ...d}; db.reports.push(rec); }
    if (persist('reports')) toast('Report saved', 'success'); viewRep(rec.id); };
}
function rawHtml(t) {
  const def = Object.values(T).find(x => x.name === t.type) || {params: [], groups: []}; let h = '';
  const ps = def.params.filter(([k]) => t.params && t.params[k] !== undefined && t.params[k] !== '');
  if (ps.length) h += `<table><tr><th>Input</th><th>Value</th></tr>${ps.map(([k, l]) => `<tr><td>${esc(l)}</td><td>${esc(t.params[k])}</td></tr>`).join('')}</table>`;
  if (t.groups) def.groups.forEach(g => { const rows = (t.groups[g.id] || []).filter(r => !blank(r));
    if (rows.length) h += `<h4>${esc(g.title)}</h4><table><tr><th>#</th>${g.cols.map(c => `<th>${esc(c[1])}</th>`).join('')}</tr>${rows.map((r, i) => `<tr><td>${i + 1}</td>${g.cols.map(c => `<td>${esc(r[c[0]] ?? '')}</td>`).join('')}</tr>`).join('')}</table>`; });
  else if (t.data) h += `<table><tr><th>#</th><th>Container (g)</th><th>Wet soil + cont. (g)</th><th>Dry soil + cont. (g)</th></tr>${t.data.map((r, i) => `<tr><td>${i + 1}</td><td>${r.c}</td><td>${r.w}</td><td>${r.d}</td></tr>`).join('')}</table>`;
  return h || '<p>No observations recorded.</p>';
}
function repHtml(r) {
  const t = db.tests.find(x => x.id === r.testId); if (!t) return '<div class="empty">The test for this report has been deleted.</div>';
  const {s, p} = ctx(t), kv = (k, v) => `<div>${k}</div><div>${esc(v || '—')}</div>`, cs = getCharts(t);
  return `<article class="report"><div class="rh"><div>${cfg.logo ? `<img src="${cfg.logo}" alt="logo">` : '<div class="logo">LOGO</div>'}</div>
   <div><h2 style="margin:0">${esc(cfg.lab || 'Laboratory name (set in Settings)')}</h2><div>${esc(cfg.addr)}<br>${esc(cfg.tel)}${cfg.tel && cfg.email ? ' · ' : ''}${esc(cfg.email)}</div></div>
   <div>Report no.<br><b>${esc(r.no)}</b><br>${esc(fmtD(r.date))}<br>Status: ${esc(r.status)}</div></div>
   <h1>Laboratory Test Report – ${esc(t.type)}</h1>
   <h3>Project details</h3><div class="kv">${kv('Project', p.name)}${kv('Project ref.', p.ref)}${kv('Client', p.client)}${kv('Location', p.location)}${kv('Sample ID', s.no)}${kv('Sampling date', fmtD(s.date))}${kv('Sample description', s.description)}${kv('Source of material', s.source)}</div>
   <h3>Test details</h3><div class="kv">${kv('Test method', t.type)}${kv('Standard reference', t.standard)}${kv('Test date', fmtD(t.date))}${kv('Equipment', r.equip)}</div>
   <h3>Raw observations</h3>${rawHtml(t)}<h3>Calculations</h3><div class="steps">${esc(t.steps.join('\n'))}</div>
   <h3>Final results</h3><div class="res">${esc(t.result)}</div>${t.warnings.map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}
   ${cs.length ? '<h3>Engineering graphs</h3>' : ''}${cs.map((c, i) => chartHtml(c, 'rp' + i)).join('')}${r.spec ? `<h3>Specification comparison</h3><p>${esc(r.spec)}</p>` : ''}
   <h3>Authorisation</h3><div class="sig"><div>Tested by: ${esc(r.tested)}<br><small>Signature / date</small></div><div>Checked by: ${esc(r.checked)}<br><small>Signature / date</small></div><div>Approved by: ${esc(r.approved)}<br><small>Signature / date</small></div></div>
   <p style="margin-top:16px;font-size:10px;color:#555">${esc(cfg.footer)}</p></article>`;
}
function viewRep(id) {
  const r = db.reports.find(x => x.id === id); if (!r) return;
  $('#title').textContent = 'Report ' + r.no; $('#crumb').textContent = 'Home / Reports / ' + r.no;
  $('#view').innerHTML = `<div class="bar noprint"><button class="btn ghost" data-a="back">← Reports</button><button class="btn" onclick="print()">Print / Save as PDF</button><button class="btn ghost" data-a="csv" data-id="${r.testId}">Export observations CSV</button>
   <button class="btn ghost" data-a="repjson" data-id="${r.id}">Export JSON</button><button class="btn ghost" data-a="editrep" data-id="${r.id}">Edit report</button></div>${repHtml(r)}`;
  const t = db.tests.find(x => x.id === r.testId); if (t) getCharts(t).forEach((c, i) => drawChart(c, 'rp' + i));
}
function repJson(id) {
  const r = db.reports.find(x => x.id === id), t = db.tests.find(x => x.id === r.testId) || null, {s, p} = t ? ctx(t) : {};
  download(`${r.no}.json`, JSON.stringify({report: r, test: t, project: p, sample: s, laboratory: {name: cfg.lab, address: cfg.addr, telephone: cfg.tel, email: cfg.email}}, null, 2), 'application/json');
}

/* ---- Laboratory settings and data ---- */
function settings() {
  const f = (k, l, t = 'text') => `<div><label>${l}</label><input data-c="${k}" type="${t}" value="${esc(cfg[k])}"></div>`;
  $('#view').innerHTML = `<div class="card"><h3>Laboratory settings</h3><div class="ff">${f('lab', 'Laboratory name')}${f('addr', 'Address')}${f('tel', 'Telephone')}${f('email', 'Email', 'email')}
   ${f('fmt', 'Report numbering format ({YYYY}, {NNN})')}${f('std', 'Default standard / method reference (prefills test forms)')}
   <div><label>Date format (reports)</label><select data-c="dateFmt"><option ${cfg.dateFmt === 'yyyy-mm-dd' ? 'selected' : ''}>yyyy-mm-dd</option><option ${cfg.dateFmt === 'dd/mm/yyyy' ? 'selected' : ''}>dd/mm/yyyy</option></select></div>
   ${f('tested', 'Default “tested by”')}${f('checked', 'Default “checked by”')}${f('approved', 'Default “approved by”')}</div>
   <label>Default report footer</label><textarea data-c="footer">${esc(cfg.footer)}</textarea>
   <div class="bar" style="margin-top:10px"><label class="btn ghost" style="margin:0">Upload logo (max 200 KB)<input id="logo" type="file" accept="image/*" hidden></label><button class="btn ghost" data-a="rmlogo">Remove logo</button>
   ${cfg.logo ? `<img src="${cfg.logo}" style="max-height:48px" alt="">` : '<small>No logo set</small>'}</div>
   <button class="btn" data-a="savecfg">Save settings</button><p><small>Units are SI throughout. Theme is set with the Light / Dark button.</small></p></div>
   <div class="card"><h3>Backup &amp; restore</h3><div class="note">Data is stored in this browser only. It is not synchronised or backed up automatically – export JSON regularly.</div>
   <div class="bar"><button class="btn" data-a="backup">Download JSON backup</button><label class="btn ghost" style="margin:0">Restore JSON<input id="rs" type="file" accept=".json" hidden></label></div></div>
   <div class="card"><h3>Calculation self-check &amp; data integrity</h3><p><small>Re-runs every calculation module on constructed test data and checks that saved records are properly linked.</small></p><button class="btn" data-a="selftest">Run self-check</button><div id="st" style="margin-top:12px"></div></div>`;
  $('#logo').onchange = e => { const f = e.target.files[0]; if (!f) return; if (f.size > 200000) return toast('Logo is larger than 200 KB', 'danger');
    const rd = new FileReader(); rd.onload = () => { cfg.logo = rd.result; if (saveCfg()) settings(); }; rd.readAsDataURL(f); };
  $('#rs').onchange = e => {
    const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
    rd.onload = () => { try {
      const d = JSON.parse(rd.result); if (!['projects', 'samples', 'tests'].every(k => Array.isArray(d[k]))) throw 0;
      if (!confirm('Replace all current data with this backup?')) return;
      Object.keys(K).forEach(k => { db[k] = Array.isArray(d[k]) ? d[k] : []; persist(k); });
      if (d.settings && typeof d.settings === 'object') { Object.assign(cfg, CFG_DEF, d.settings); saveCfg(); }
      toast('Restored', 'success'); route();
    } catch { toast('Invalid backup file', 'danger'); } };
    rd.readAsText(f);
  };
}

/* ---- Global search ---- */
function searchPage() {
  const q = gq.toLowerCase(); if (!q) { $('#view').innerHTML = '<div class="card empty">Type in the search box above and press Enter.</div>'; return; }
  const has = a => a.join(' ').toLowerCase().includes(q);
  const P = db.projects.filter(p => has([p.ref, p.name, p.client, p.location, p.county])), S = db.samples.filter(s => has([s.no, s.location, s.description, projName(s.project)]));
  const Tt = db.tests.filter(t => { const {s, p} = ctx(t); return has([t.type, t.result, t.date, s.no, p.name, p.client, catOf(t.type)]); }), R = db.reports.filter(r => { const t = db.tests.find(x => x.id === r.testId) || {}; return has([r.no, r.status, t.type]); });
  const sec = (h, rows, tb) => rows.length ? `<div class="card"><h3>${h} (${rows.length})</h3><div class="tw"><table>${tb}</table></div></div>` : '';
  $('#view').innerHTML = sec('Projects', P, P.map(p => `<tr><td>${esc(p.ref)}</td><td>${esc(p.name)}</td><td>${esc(p.client)}</td><td><button class="btn sm ghost" data-a="edit" data-k="projects" data-id="${p.id}">Open</button></td></tr>`).join(''))
    + sec('Samples', S, S.map(s => `<tr><td>${esc(s.no)}</td><td>${esc(projName(s.project))}</td><td>${esc(s.location)}</td><td><button class="btn sm ghost" data-a="edit" data-k="samples" data-id="${s.id}">Open</button></td></tr>`).join(''))
    + sec('Tests', Tt, Tt.map(t => `<tr><td>${esc(t.date)}</td><td>${esc(t.type)}</td><td>${esc(sampleNo(t.sample))}</td><td>${esc(t.result)}</td><td><button class="btn sm ghost" data-a="viewt" data-id="${t.id}">Open</button></td></tr>`).join(''))
    + sec('Reports', R, R.map(r => `<tr><td>${esc(r.no)}</td><td>${esc(r.status)}</td><td><button class="btn sm ghost" data-a="viewrep" data-id="${r.id}">Open</button></td></tr>`).join(''))
    || `<div class="card empty">No results for “${esc(gq)}”.</div>`;
}
$('#gs').onkeydown = e => { if (e.key === 'Enter') { gq = e.target.value.trim(); go('#search'); } };

/* ================= Phase 8: built-in calculation self-check, data-integrity check, sample status ================= */
/* The self-check re-runs every calculation module on constructed datasets whose answers were worked out by hand from the formulae.
   It proves the code still reproduces its own formulae; it does NOT replace checking against your laboratory's verified datasets. */
function selfTestCases() {
  const E = [{}], C = [], add = (name, fn, re) => C.push({name, fn, re});
  const cp = [15, 20, 25].map(pn => ({p1: pn - .2, p2: pn + .2, c: 10, d: 110, w: 110 + 2 * pn}));
  const mt = (w, rd) => 4200 + rd * (1 + w / 100) * 944, W = [8, 10, 12, 14, 16], RD = [1.80, 1.88, 1.90, 1.86, 1.79];
  const A0 = Math.PI * 38 * 38 / 4, ucs = [0, 1, 2, 3, 4, 5].map(dh => ({dh, P: (100 + 30 * dh - 4 * dh * dh) * A0 / 1000 / (1 - dh / 76)}));
  const ds = []; [100, 200, 300].forEach((sg, i) => [0, 1, 2, 3].forEach(d => ds.push({s: i + 1, fn: sg * 3600 / 1000, d, fs: (10 + sg * Math.tan(Math.PI / 6)) * (d < 3 ? d / 3 : 1) * 3600 / 1000})));
  const tx = []; [100, 200, 300].forEach((c3, i) => [0, 5, 10].forEach((e, k) => { const q = 2 * c3 + 34.641; tx.push({s: i + 1, c3, e, q: k === 2 ? q : q * k / 3, u: k === 2 ? 50 : ''}); }));
  const U = Tv => { let u = 0; for (let m = 0; m < 200; m++) { const M = Math.PI * (2 * m + 1) / 2; u += 2 / (M * M) * Math.exp(-M * M * Tv); } return 1 - u; };
  const tm = [1, 2, 4, 8, 15, 30, 60, 120, 240, 400, 600, 900, 1440, 2000].map(t => ({inc: 1, t, r: 5 + .5 * U(.05 * t / 25)}));
  const inc = [{p: 25, rf: 5.5}, {p: 50, rf: 6.0}, {p: 100, rf: 6.6}], cons = () => calcConsol({inc, tm}, {H0: 20, w0: 30, Gs: 2.7, r0: 5, faces: 2});
  add('Moisture content', () => calcMoisture([{c: 10, w: 30, d: 25}]).mean.toFixed(2), /^33\.33$/);
  add('Sieve analysis', () => calcSieve({sieve: [{d: 4.75, m: 50}, {d: 2, m: 150}, {d: .425, m: 300}, {d: .075, m: 350}]}, {M: 1000, pan: 140}).result, /D30 0\.158, D60 0\.712/);
  add('Atterberg – Casagrande', () => calcAtt({LL: [{n: 15, c: 10, w: 30, d: 25}, {n: 25, c: 10, w: 30, d: 25.5}, {n: 35, c: 10, w: 30, d: 26}], CP: E, PL: [{c: 10, w: 20, d: 18}]}, {method: 'Casagrande (percussion)'}).result, /LL 28\.6 % \(Casagrande\), PL 25\.0 %, PI 3\.6/);
  add('Atterberg – cone penetrometer', () => calcAtt({LL: E, CP: cp, PL: [{c: 10, w: 20, d: 18}]}, {method: 'Cone penetrometer', tp: 20}).result, /LL 40\.0 % \(cone penetrometer\), PL 25\.0 %, PI 15\.0/);
  add('Specific gravity', () => calcGs({gs: [{m1: 50, m2: 80, m3: 164, m4: 150}]}, {}).result, /Gs = 1\.875/);
  add('Proctor MDD / OMC', () => calcProctor({pts: W.map((w, i) => ({mt: mt(w, RD[i]), c: 10, w: 110 + w, d: 110}))}, {V: 944, Mm: 4200}).result, /MDD 1\.898 Mg\/m³, OMC 11\.8/);
  add('Field density (sand)', () => calcSand({}, {M1: 6000, M2: 2500, Mc: 1500, rs: 1.5, Mw: 2600, w: 10, mdd: 1.9}).result, /compaction 93\.3 %/);
  add('CBR', () => calcCbr({pen: [0, .5, 1, 1.5, 2, 2.5, 3, 4, 5, 6].map(s => ({s, l: s * 1.2})), sw: []}, {s25: 13, s50: 20}).result, /CBR\(2\.5\) 23\.1 %; CBR\(5\) 30\.0 %/);
  add('Unconfined compressive strength', () => calcUcs({u: ucs}, {H0: 76, D0: 38}).result, /qu = 156\.0 kPa/);
  add('Direct shear', () => calcDs({ds}, {A: 3600}).result, /c = 10\.0 kPa, φ = 30\.0°/);
  add('Triaxial (total stress)', () => calcTx({tx}, {}).result, /Total: c = 10\.0 kPa, φ = 30\.0°/);
  add('Consolidation – Cc', () => cons().result, /Cc 0\.165/);
  add('Consolidation – Taylor t90', () => cons().steps.join(' '), /t90 = 41\d\.\d+ min/);
  add('Constant head permeability', () => calcKch({k: [{q: 100, t: 100}]}, {L: 10, A: 50, h: 50}).result, /k = 4\.000e-3 cm\/s/);
  add('Falling head permeability', () => calcKfh({k: [{h1: 100, h2: 50, t: 100}]}, {L: 10, A: 50, a: 1}).result, /k = 1\.386e-3 cm\/s/);
  add('Swell test', () => calcSwell({sw: [{t: 0, r: 2}, {t: 24, r: 2.5}, {t: 96, r: 2.9}]}, {H0: 20}).result, /Swell 4\.50 % at 96 h/);
  add('Free swell index', () => calcFsi({f: [{vd: 20, vk: 10}]}).result, /= 100\.0 %/);
  add('Linear shrinkage', () => calcLs({l: [{l0: 140, ld: 130}]}).result, /= 7\.1 %/);
  add('Relative density', () => calcRd({}, {rmax: 1.8, rmin: 1.4, r: 1.6, emax: .9, emin: .5, e: .7}).result, /56\.3 %.*50\.0 %/);
  add('Organic matter – loss on ignition', () => calcOm({loi: [{c: 20, d: 30, a: 29}], ox: E}, {method: 'Loss on ignition'}).result, /= 10\.00 %/);
  add('Organic matter – oxidation', () => calcOm({loi: E, ox: [{m: 1, vs: 12}]}, {method: 'Chemical oxidation (titration)', nrm: .5, k: .003, vb: 20, fac: 1.724}).result, /= 1\.200 %.*= 2\.069 %/);
  add('Soil pH', () => calcPh({ph: [{r: 6.8}, {r: 6.9}, {r: 6.85}]}, {}).result, /pH 6\.85/);
  add('Sulphate', () => calcSo4({s: [{m: 10, c: 20, cp: 20.2338}]}, {f: .4116, ve: 100, va: 50, basis: 'dry soil'}).result, /19246\.4 mg\/kg/);
  add('Chloride', () => calcCl({c: [{m: 10, vs: 5}]}, {mol: .1, eq: 35.45, vbl: .2, ve: 100, va: 50, basis: 'dry soil'}).result, /3403\.2 mg\/kg/);
  add('Soaked CBR (shares CBR maths)', () => calcSoaked({pen: [0, .5, 1, 1.5, 2, 2.5, 3, 4, 5, 6].map(s => ({s, l: s * 1.2})), sw: []}, {s25: 13, s50: 20, soak: '96 h'}).result, /CBR\(2\.5\) 23\.1 %/);
  return C.map(c => { let out; try { out = String(c.fn()); } catch (e) { out = 'ERROR: ' + e.message; } return {name: c.name, out, ok: c.re.test(out)}; });
}
function integrity() {
  const n = (a, f) => a.filter(f).length;
  return [['Samples without a project', n(db.samples, s => !db.projects.some(p => p.id === s.project))], ['Tests without a sample', n(db.tests, t => !db.samples.some(s => s.id === t.sample))],
    ['Reports without a test', n(db.reports, r => !db.tests.some(t => t.id === r.testId))], ['Duplicate project references', db.projects.length - new Set(db.projects.map(p => p.ref)).size], ['Duplicate report numbers', db.reports.length - new Set(db.reports.map(r => r.no)).size]];
}
function runSelfTest() {
  const R = selfTestCases(), pass = R.filter(r => r.ok).length, I = integrity();
  $('#st').innerHTML = `<div class="${pass === R.length ? 'note' : 'warn'}"><b>${pass} of ${R.length} calculation checks passed.</b> These use constructed datasets worked out from the formulae: they show the code still reproduces its own formulae and do not replace verification against your laboratory's datasets.</div>
   <div class="tw"><table><tr><th>Check</th><th>Result</th><th></th></tr>${R.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.out.slice(0, 90))}</td><td>${r.ok ? '✓' : '<b class="warn">✗ FAIL</b>'}</td></tr>`).join('')}</table></div>
   <h4>Data integrity</h4>${table(['Check', 'Count'], I)}`;
}
function touchSample(id) { const s = db.samples.find(x => x.id === id); if (s && s.status === 'Pending') { s.status = 'In testing'; persist('samples'); } }

/* ---- Event delegation ---- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const {a, k, id} = b.dataset;
  ({new: () => openForm(k), edit: () => openForm(k, id), del: () => del(k, id), close: () => $('#dlg').close(),
    moist: moistForm, gnew: () => gForm(b.dataset.t), gadd: () => { gRead(); cur.groups[b.dataset.g].push({}); gDraw(); }, gcalc: gCalc, gsave: gSave, pg: () => { const st = k === 't' ? tf : rf; st.page = Math.max(1, st.page + Number(b.dataset.d)); (k === 't' ? drawT : drawR)(); }, newrep: () => repForm(null, id), viewrep: () => viewRep(id), editrep: () => repForm(id), back: () => go('#reports'), repjson: () => repJson(id), rmlogo: () => { cfg.logo = ''; saveCfg(); settings(); }, savecfg: () => { document.querySelectorAll('[data-c]').forEach(i => cfg[i.dataset.c] = i.value); if (saveCfg()) toast('Settings saved', 'success'); }, selftest: runSelfTest, gpng: () => gPng(b.dataset.c), gprint: () => gPrint(b.dataset.c), addrow: () => { readRows(); mrows.push({c:'', w:'', d:''}); drawRows(); }, calc: showCalc, savem: saveMoist,
    viewt: () => viewTest(id), csv: () => csvTest(id), backup: () => download('soillab_backup.json', JSON.stringify({projects: db.projects, samples: db.samples, tests: db.tests, reports: db.reports, settings: cfg}, null, 2), 'application/json')}[a] || (() => {}))();
});
$('#menu').onclick = () => $('#side').classList.toggle('open');
const applyTheme = t => document.documentElement.dataset.theme = t;
applyTheme(localStorage.getItem('soillab_theme') || 'light');
$('#theme').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('soillab_theme', t); applyTheme(t); };
route();