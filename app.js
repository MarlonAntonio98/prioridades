'use strict';
(() => {
if (window.top !== window.self) { document.documentElement.classList.add('framed'); return; }

const $ = s => document.querySelector(s);
const main = $('#main'), ov = $('#overlay');
const APP_VERSION = 1;
const Q = {
  1:{n:'Hacer ahora', d:'Urgente e importante', c:'#FF7A6B', tip:'Hazlo hoy o lo antes posible.'},
  2:{n:'Planificar', d:'Importante, no urgente', c:'#5FD3A0', tip:'Ponle fecha y resérvale tiempo.'},
  3:{n:'Delegar', d:'Urgente, no importante', c:'#F0C45A', tip:'Pídele a alguien más que lo haga, o hazlo rápido.'},
  4:{n:'Eliminar', d:'Ni urgente ni importante', c:'#8E8E96', tip:'Déjalo ir, o hazlo solo si te sobra tiempo.'}};
const I = {plus:'<path d="M12 5v14M5 12h14"/>',back:'<path d="m15 6-6 6 6 6"/>',x:'<path d="M6 6l12 12M18 6 6 18"/>',gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',check:'<path d="m5 12 5 5 9-10"/>',down:'<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',up:'<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',chev:'<path d="m9 6 6 6-6 6"/>'};
const ic = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => (b % 36).toString(36)).join('');
const NO_SPELL = 'autocomplete="off" autocorrect="off" spellcheck="false"';
const pad2 = n => String(n).padStart(2, '0');
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d, 12); };
const daysTo = s => Math.round((parse(s) - parse(todayKey())) / 864e5);
const dueText = s => { const n = daysTo(s); if (n < 0) return n === -1 ? 'Venció ayer' : `Venció hace ${-n} días`; if (n === 0) return 'Para hoy'; if (n === 1) return 'Para mañana'; if (n < 7) return `En ${n} días`; return parse(s).toLocaleDateString('es-SV', {day:'numeric', month:'short'}).replace(/\./g, ''); };
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

/* ---------- Almacenamiento ---------- */
const DB = { db:null,
  open(){ return new Promise(res => { try { const r = indexedDB.open('prioridades', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('tasks', {keyPath:'id'}); d.createObjectStore('meta', {keyPath:'k'}); };
    r.onsuccess = () => { this.db = r.result; res(true); }; r.onerror = () => res(false); r.onblocked = () => res(false); } catch(e){ res(false); } }); },
  req(s, m, fn){ return new Promise((res, rej) => { try { const t = this.db.transaction(s, m), q = fn(t.objectStore(s)); let out;
    if (q) q.onsuccess = () => { out = q.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); } catch(e){ rej(e); } }); },
  all(s){ return this.req(s,'readonly',o=>o.getAll()).then(r=>r||[]); }, put(s,v){ return this.req(s,'readwrite',o=>o.put(v)); }, del(s,k){ return this.req(s,'readwrite',o=>o.delete(k)); }, clear(s){ return this.req(s,'readwrite',o=>o.clear()); } };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, ID_RE = /^[a-z0-9]{6,40}$/;
const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
function clean(t){ if (!t || !ID_RE.test(t.id)) return null; const text = str(t.text, 200).trim(); if (!text) return null;
  return {id:t.id, text, q:[1,2,3,4].includes(+t.q) ? +t.q : 2, due:DATE_RE.test(t.due || '') ? t.due : '', who:str(t.who, 60), note:str(t.note, 1000), done:!!t.done, doneAt:+t.doneAt || 0, created:+t.created || Date.now()}; }
let tasks = [], view = {name:'home'}, hist = [], installEvt = null, draft = null, showDone = false;
async function saveTask(t){ await DB.put('tasks', t); const k = tasks.findIndex(x => x.id === t.id); k < 0 ? tasks.push(t) : tasks[k] = t; }
const open = q => tasks.filter(t => !t.done && t.q === q).sort((a,b) => (a.due || '9999').localeCompare(b.due || '9999') || a.created - b.created);

/* ---------- Superposiciones y botón atrás ---------- */
let ovState = false, pendingBack = false, wantPush = false, pendingCb = null, sheetRes = null;
function toast(m, undo){ const t = $('#toast'); t.textContent = m + (undo ? '. Toca para deshacer' : ''); t.classList.add('show'); t.classList.toggle('undo', !!undo); undoFn = undo || null; clearTimeout(toast.t); toast.t = setTimeout(() => { t.classList.remove('show','undo'); undoFn = null; }, undo ? 4500 : 2600); }
let undoFn = null;
function openOverlay(html, cls){ ov.className = cls; ov.innerHTML = html; ov.hidden = false; document.body.style.overflow = 'hidden'; if (!ovState){ ovState = true; if (pendingBack) wantPush = true; else history.pushState({ov:1}, ''); } }
function hideOverlay(){ ov.hidden = true; ov.innerHTML = ''; ov.className = ''; document.body.style.overflow = ''; }
function closeOverlay(cb){ hideOverlay(); if (ovState){ ovState = false; if (wantPush){ wantPush = false; if (cb) cb(); } else { pendingBack = true; pendingCb = cb || null; history.back(); } } else if (cb) cb(); }
function resolveSheet(v){ const r = sheetRes; sheetRes = null; closeOverlay(() => { if (r) r(v); }); }
function confirmBox(title, text, ok){ return new Promise(res => { sheetRes = v => res(!!v); openOverlay(`<div class="sheet" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn btn-danger" data-act="sheetOk">${esc(ok)}</button><button class="btn btn-ghost" data-act="sheetNo">Cancelar</button></div>`, 'dim'); }); }
function go(v){ hist.push(Object.assign({}, view, {y:window.scrollY})); view = v; history.pushState({d:hist.length}, ''); render(); window.scrollTo(0,0); }
function back(){ if (ovState) return resolveSheet(null); if (hist.length) history.back(); }
window.addEventListener('popstate', () => {
  if (pendingBack){ pendingBack = false; if (wantPush){ wantPush = false; history.pushState({ov:1}, ''); } const cb = pendingCb; pendingCb = null; if (cb) cb(); return; }
  if (ovState){ ovState = false; hideOverlay(); const r = sheetRes; sheetRes = null; if (r) r(null); return; }
  if (!hist.length) return; const v = hist.pop(), y = v.y || 0; delete v.y; view = v; render(); window.scrollTo(0, y); });

/* ---------- Vistas ---------- */
const dueBadge = t => t.due ? `<span class="due${daysTo(t.due) < 0 ? ' late' : daysTo(t.due) <= 1 ? ' soon' : ''}">${esc(dueText(t.due))}</span>` : '';
function taskRow(t){ return `<div class="task${t.done ? ' done' : ''}" data-tid="${t.id}"><button class="tick" data-tick="${t.id}" aria-label="${t.done ? 'Marcar pendiente' : 'Completar'}">${ic('check',16)}</button><button class="task-main" data-edit="${t.id}"><b>${esc(t.text)}</b>${t.due || t.who ? `<span class="meta">${dueBadge(t)}${t.who ? `<span>${esc(t.who)}</span>` : ''}</span>` : ''}</button></div>`; }
function viewHome(){ const total = tasks.filter(t => !t.done).length;
  let h = `<header class="bar"><h1 class="title">Prioridades</h1><div class="bar-actions">${installEvt?'<button class="pill-btn" data-act="install">Instalar</button>':''}<button class="icon-btn" data-act="settings" aria-label="Ajustes">${ic('gear')}</button></div></header>`;
  const promote = open(2).filter(t => t.due && daysTo(t.due) <= 1);
  if (promote.length) h += `<div class="nudge"><span>${promote.length === 1 ? `«${esc(promote[0].text)}» ya es para ${daysTo(promote[0].due) < 0 ? 'antes' : daysTo(promote[0].due) === 0 ? 'hoy' : 'mañana'}.` : `${promote.length} tareas de «Planificar» ya son para hoy o mañana.`}</span><button class="pill-btn sm" data-act="promote">Pasar a Hacer ahora</button></div>`;
  h += `<div class="axes"><span></span><span>Urgente</span><span>No urgente</span></div><div class="matrix-wrap"><div class="side"><span>Importante</span><span>No importante</span></div><div class="matrix">${[1,2,3,4].map(q => { const l = open(q);
    return `<button class="quad" data-quad="${q}" data-c="${Q[q].c}"><div class="q-head"><b>${Q[q].n}</b><span class="q-count">${l.length || ''}</span></div><ul>${l.slice(0, 4).map(t => `<li${t.due && daysTo(t.due) <= 1 ? ' class="hot"' : ''}>${esc(t.text)}</li>`).join('')}${l.length > 4 ? `<li class="more">y ${l.length - 4} más</li>` : ''}</ul>${!l.length ? `<small>${Q[q].d}</small>` : ''}</button>`; }).join('')}</div></div>`;
  if (!total && !tasks.length) h += `<p class="hint">Toca «+» para agregar tu primera tarea. La app te preguntará si es urgente e importante, y la pondrá en su lugar.</p>`;
  return h + `<button class="fab" data-act="add" aria-label="Agregar tarea">${ic('plus',28)}</button>`; }
function viewQuad(){ const q = view.q, l = open(q), done = tasks.filter(t => t.done && t.q === q).sort((a,b) => b.doneAt - a.doneAt);
  let h = `<header class="bar"><button class="icon-btn" data-act="back" aria-label="Volver">${ic('back')}</button><h1 class="title title-sm">${Q[q].n}</h1><span class="spacer"></span></header>`;
  h += `<div class="q-intro" data-c="${Q[q].c}"><b>${Q[q].d}</b><span>${Q[q].tip}</span></div>`;
  h += `<div class="quick-add"><input id="qa" placeholder="Agregar a «${Q[q].n}»" maxlength="200" enterkeyhint="done" ${NO_SPELL}><button class="icon-btn icon-btn-solid" data-act="quickAdd" aria-label="Agregar">${ic('plus')}</button></div>`;
  h += l.length ? `<div class="tasks">${l.map(taskRow).join('')}</div>` : `<p class="hint">No hay nada aquí.</p>`;
  if (done.length) h += `<button class="link-btn done-toggle" data-act="toggleDone">${showDone ? 'Ocultar' : 'Ver'} completadas (${done.length})</button>${showDone ? `<div class="tasks">${done.map(taskRow).join('')}</div><button class="btn btn-danger-text" data-act="clearDone">Borrar completadas</button>` : ''}`;
  return h; }
function editSheet(t){ const d = Object.assign({}, t); draft = d;
  openOverlay(`<div class="sheet" role="dialog" aria-modal="true"><h2>${t.id ? 'Editar tarea' : 'Nueva tarea'}</h2>
  <label class="field"><input id="e_text" value="${esc(d.text)}" maxlength="200" placeholder="¿Qué tienes que hacer?" ${NO_SPELL}><em class="err" id="e_err"></em></label>
  ${t.id ? `<div class="field"><span>Dónde va</span><div class="q-pick">${[1,2,3,4].map(q => `<button type="button" class="q-opt${d.q === q ? ' on' : ''}" data-qpick="${q}" data-c="${Q[q].c}"><b>${Q[q].n}</b><small>${Q[q].d}</small></button>`).join('')}</div></div>`
  : `<div class="field"><span>¿Es importante?</span><div class="yn"><button type="button" class="yn-btn${d.imp === true ? ' on' : ''}" data-imp="1">Sí</button><button type="button" class="yn-btn${d.imp === false ? ' on' : ''}" data-imp="0">No</button></div><small>Te acerca a tus metas o tiene consecuencias si no lo haces.</small></div>
    <div class="field"><span>¿Es urgente?</span><div class="yn"><button type="button" class="yn-btn${d.urg === true ? ' on' : ''}" data-urg="1">Sí</button><button type="button" class="yn-btn${d.urg === false ? ' on' : ''}" data-urg="0">No</button></div><small>Tiene que hacerse ya o en muy poco tiempo.</small></div><p class="dest" id="dest">${destText(d)}</p>`}
  <div class="two"><label class="field"><span>Fecha (opcional)</span><input id="e_due" type="date" value="${d.due || ''}"></label><label class="field"><span>Encargado (opcional)</span><input id="e_who" value="${esc(d.who)}" maxlength="60" placeholder="¿A quién?" ${NO_SPELL}></label></div>
  <label class="field"><span>Nota (opcional)</span><textarea id="e_note" rows="2" maxlength="1000" ${NO_SPELL}>${esc(d.note)}</textarea></label>
  <button class="btn btn-primary" data-act="saveTask">Guardar</button>${t.id ? '<button class="btn btn-danger-text" data-act="delTask">Eliminar</button>' : ''}<button class="btn btn-ghost" data-act="sheetNo">Cancelar</button></div>`, 'dim');
  setTimeout(() => { const i = $('#e_text'); if (i && !t.id) i.focus(); }, 80); }
const qFrom = d => d.imp === undefined || d.urg === undefined ? null : d.imp ? (d.urg ? 1 : 2) : (d.urg ? 3 : 4);
const destText = d => { const q = qFrom(d); return q ? `Irá a <b data-c="${Q[q].c}">${Q[q].n}</b>. ${Q[q].tip}` : 'Responde las dos preguntas y la app la pone en su lugar.'; };
function viewSettings(){ const standalone = window.matchMedia('(display-mode: standalone)').matches, done = tasks.filter(t => t.done).length;
  return `<header class="bar"><button class="icon-btn" data-act="back" aria-label="Volver">${ic('back')}</button><h1 class="title title-sm">Ajustes</h1><span class="spacer"></span></header>
  <h2 class="section">Cómo funciona</h2><div class="box">${[1,2,3,4].map(q => `<div class="row"><span><i class="qdot" data-c="${Q[q].c}"></i>${Q[q].n}</span><b>${Q[q].d}</b></div>`).join('')}</div>
  <h2 class="section">Instalación</h2><div class="box">${standalone?'<p class="fine">Ya estás usando la app instalada.</p>':installEvt?`<button class="set-row" data-act="install"><span>Instalar Prioridades en el celular</span><span class="chev">${ic('down',18)}</span></button>`:'<p class="fine">Chrome todavía no ofrece instalarla. Abre la app en Chrome con internet, espera unos segundos y vuelve a entrar aquí.</p>'}</div>
  <h2 class="section">Copia de seguridad</h2><div class="box"><button class="set-row" data-act="exportBk"><span>Descargar copia</span><span class="chev">${ic('down',18)}</span></button><label class="set-row"><span>Restaurar una copia</span><span class="chev">${ic('up',18)}</span><input type="file" accept="application/json,.json" id="f_import" hidden></label></div>
  ${done ? `<button class="btn btn-secondary mt" data-act="clearAllDone">Borrar todas las completadas (${done})</button>` : ''}
  <button class="btn btn-danger-text mt" data-act="wipe">Borrar todo</button><p class="ver">Versión ${APP_VERSION}</p>`; }
function paint(){ document.querySelectorAll('[data-c]').forEach(e => e.style.setProperty('--c', e.dataset.c)); }
function render(){ main.innerHTML = ({home:viewHome, quad:viewQuad, settings:viewSettings}[view.name] || viewHome)(); paint(); }

/* ---------- Mantener presionada una tarea: moverla ---------- */
let lp = null, lpFired = 0;
document.addEventListener('pointerdown', e => { const r = e.target.closest('.task[data-tid]'); if (!r || !e.isPrimary || e.target.closest('.tick')) return;
  lp = {x:e.clientX, y:e.clientY, t:setTimeout(() => { lp = null; lpFired = Date.now(); try { if (navigator.vibrate) navigator.vibrate(12); } catch(err){} moveMenu(r.dataset.tid); }, 480)}; }, {passive:true});
document.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10){ clearTimeout(lp.t); lp = null; } }, {passive:true});
['pointerup','pointercancel'].forEach(ev => document.addEventListener(ev, () => { if (lp){ clearTimeout(lp.t); lp = null; } }));
document.addEventListener('contextmenu', e => { if (e.target.closest('.task, .quad')) e.preventDefault(); });
function moveMenu(id){ const t = tasks.find(x => x.id === id); if (!t) return;
  openOverlay(`<div class="sheet" role="dialog" aria-modal="true"><h2>${esc(t.text)}</h2><p>Mover a:</p>${[1,2,3,4].filter(q => q !== t.q).map(q => `<button class="menu-item" data-moveto="${q}" data-mid="${id}"><i class="qdot" data-c="${Q[q].c}"></i>${Q[q].n}<small>${Q[q].d}</small></button>`).join('')}<button class="btn btn-ghost" data-act="sheetNo">Cancelar</button></div>`, 'dim'); paint(); }

/* ---------- Acciones ---------- */
async function complete(t){ t.done = !t.done; t.doneAt = t.done ? Date.now() : 0; await saveTask(t); try { if (t.done && navigator.vibrate) navigator.vibrate(8); } catch(e){}
  render(); if (t.done) toast('Completada', async () => { t.done = false; t.doneAt = 0; await saveTask(t); render(); }); }
const A = {
  add(){ editSheet({id:null, text:'', q:null, due:'', who:'', note:''}); },
  back(){ back(); },
  settings(){ go({name:'settings'}); },
  async quickAdd(){ const i = $('#qa'), text = i.value.trim(); if (!text) return i.focus(); const t = clean({id:uid(), text, q:view.q, created:Date.now()}); await saveTask(t); render(); const n = $('#qa'); if (n) n.focus(); toast('Agregada'); },
  async saveTask(){ const d = draft, text = $('#e_text').value.trim(); if (!text){ $('#e_err').textContent = 'Escribe la tarea.'; return; }
    const q = d.id ? d.q : qFrom(d); if (!q){ $('#dest').textContent = 'Responde si es importante y si es urgente.'; $('#dest').classList.add('err-t'); return; }
    const ex = tasks.find(t => t.id === d.id), rec = clean(Object.assign({}, ex || {}, {id:ex ? ex.id : uid(), text, q, due:$('#e_due').value, who:$('#e_who').value.trim(), note:$('#e_note').value.trim(), created:ex ? ex.created : Date.now()}));
    await saveTask(rec); draft = null; resolveSheet(null); setTimeout(() => { render(); toast(ex ? 'Guardada' : `Agregada a «${Q[q].n}»`); }, 50); },
  async delTask(){ const id = draft && draft.id; const t = tasks.find(x => x.id === id); if (!t) return; resolveSheet(null);
    await DB.del('tasks', id); tasks = tasks.filter(x => x.id !== id); setTimeout(() => { render(); toast('Eliminada', async () => { await saveTask(t); render(); }); }, 50); },
  toggleDone(){ showDone = !showDone; render(); },
  async clearDone(){ const l = tasks.filter(t => t.done && t.q === view.q); for (const t of l) await DB.del('tasks', t.id); tasks = tasks.filter(t => !(t.done && t.q === view.q)); showDone = false; render(); toast('Completadas borradas'); },
  async clearAllDone(){ if (!await confirmBox('¿Borrar las completadas?', 'Se eliminan todas las tareas que ya terminaste.', 'Borrar')) return; for (const t of tasks.filter(t => t.done)) await DB.del('tasks', t.id); tasks = tasks.filter(t => !t.done); render(); toast('Listo'); },
  async promote(){ const l = open(2).filter(t => t.due && daysTo(t.due) <= 1); for (const t of l){ t.q = 1; await saveTask(t); } render(); toast(`${plural(l.length, 'tarea pasó', 'tareas pasaron')} a «Hacer ahora»`); },
  sheetOk(){ resolveSheet(true); }, sheetNo(){ draft = null; resolveSheet(null); },
  async install(){ if (!installEvt) return; const e = installEvt; installEvt = null; try { await e.prompt(); await e.userChoice; } catch(err){} render(); },
  exportBk(){ const url = URL.createObjectURL(new Blob([JSON.stringify({app:'prioridades', v:1, created:new Date().toISOString(), tasks})], {type:'application/json'})), a = document.createElement('a'); a.href = url; a.download = `prioridades-copia-${todayKey()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); toast('Copia descargada'); },
  async wipe(){ if (!await confirmBox('¿Borrar todo?', 'Se eliminan todas tus tareas de este celular.', 'Borrar todo')) return; await DB.clear('tasks'); tasks = []; toast('Todo borrado'); back(); }
};
async function importBk(file){ let d; try { d = JSON.parse(await file.text()); } catch(e){ return toast('Ese archivo no es una copia válida.'); }
  if (!d || d.app !== 'prioridades' || !Array.isArray(d.tasks)) return toast('Ese archivo no es una copia válida.');
  let n = 0; for (const r of d.tasks){ const t = clean(r); if (!t) continue; await saveTask(t); n++; } render(); toast(`${plural(n, 'tarea restaurada', 'tareas restauradas')}`); }

/* ---------- Eventos ---------- */
document.addEventListener('click', async e => {
  if (e.target.closest('#toast.undo')){ const f = undoFn; undoFn = null; $('#toast').classList.remove('show','undo'); if (f) f(); return; }
  if (Date.now() - lpFired < 600 && e.target.closest('.task')) return;
  const t = e.target.closest('[data-act],[data-quad],[data-tick],[data-edit],[data-moveto],[data-qpick],[data-imp],[data-urg]'); if (!t) return; const ds = t.dataset;
  if (ds.quad){ showDone = false; return go({name:'quad', q:+ds.quad}); }
  if (ds.tick){ const x = tasks.find(y => y.id === ds.tick); if (x) complete(x); return; }
  if (ds.edit){ const x = tasks.find(y => y.id === ds.edit); if (x) editSheet(x); paint(); return; }
  if (ds.moveto){ const x = tasks.find(y => y.id === ds.mid); if (!x) return; x.q = +ds.moveto; await saveTask(x); resolveSheet(null); setTimeout(() => { render(); toast(`Movida a «${Q[x.q].n}»`); }, 50); return; }
  if (ds.qpick){ draft.q = +ds.qpick; document.querySelectorAll('[data-qpick]').forEach(b => b.classList.toggle('on', b === t)); return; }
  if (ds.imp){ draft.imp = ds.imp === '1'; document.querySelectorAll('[data-imp]').forEach(b => b.classList.toggle('on', b === t)); $('#dest').innerHTML = destText(draft); $('#dest').classList.remove('err-t'); paint(); return; }
  if (ds.urg){ draft.urg = ds.urg === '1'; document.querySelectorAll('[data-urg]').forEach(b => b.classList.toggle('on', b === t)); $('#dest').innerHTML = destText(draft); $('#dest').classList.remove('err-t'); paint(); return; }
  if (ds.act && A[ds.act]) A[ds.act](t);
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'qa'){ e.preventDefault(); A.quickAdd(); } if (e.key === 'Escape' && ovState) resolveSheet(null); });
document.addEventListener('input', e => { if (e.target.id === 'e_text') $('#e_err').textContent = ''; });
document.addEventListener('change', e => { const t = e.target; if (t.id === 'f_import'){ const f = t.files && t.files[0]; t.value = ''; if (f) importBk(f); } });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (['home','settings'].includes(view.name) && !ovState) render(); });
window.addEventListener('appinstalled', () => { installEvt = null; toast('Prioridades instalada'); if (!ovState) render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !ovState) render(); });

/* ---------- Inicio ---------- */
(async () => {
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js', {scope:'./'}).catch(() => {});
  if (!window.indexedDB || !await DB.open()){ main.innerHTML = '<div class="empty"><h2>No se puede guardar</h2><p>Este navegador no permite guardar datos. Si estás en modo incógnito, abre la app en una pestaña normal.</p></div>'; return; }
  try { tasks = (await DB.all('tasks')).map(clean).filter(Boolean); } catch(e){ tasks = []; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  history.replaceState({root:1}, ''); render();
})();
})();
