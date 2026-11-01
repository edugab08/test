// ===== Extras 3: backup/restore, categorias editáveis, recorrentes editáveis, comprometido, relatório do ano =====
const BASE_CATS = CATEGORIES_LIST.map(c => ({ ...c }));
const CAT_ICONS = ['home', 'cart', 'utensils', 'car', 'pill', 'shirt', 'book', 'film', 'gamepad', 'paw', 'box', 'trend', 'wallet', 'bulb', 'bolt', 'target'];
const CAT_PALETTE = ['#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#22d3ee', '#fb923c', '#84cc16'];
const clone = o => JSON.parse(JSON.stringify(o));
const shortBRL = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1).replace('.', ',') + 'k' : String(Math.round(v));

/* ---------- Categorias editáveis ---------- */
function applyCategories() {
  const cf = state.categories || { custom: [], over: {} };
  const list = BASE_CATS.map(c => { const o = (cf.over || {})[c.value] || {}; return { ...c, label: o.label || c.label, color: o.color || c.color }; });
  const outros = list.pop();
  (cf.custom || []).forEach(c => list.push({ value: c.value, label: c.label, color: c.color, icon: c.icon || 'box', custom: true }));
  list.push(outros);
  CATEGORIES_LIST.length = 0; list.forEach(c => CATEGORIES_LIST.push(c));
}
function fillCatFilter() {
  const el = $('filter-cat'), v = el.value;
  el.innerHTML = '<option value="">Todas as categorias</option>' + CATEGORIES_LIST.map(c => `<option value="${escapeHtml(c.value)}">${escapeHtml(c.label)}</option>`).join('');
  el.value = CATEGORIES_LIST.some(c => c.value === v) ? v : '';
}
function renderCatModal() {
  let m = $('cat-modal');
  if (!m) { m = document.createElement('div'); m.id = 'cat-modal'; m.className = 'fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 hidden'; m.style.zIndex = 60; document.body.appendChild(m); }
  m.innerHTML = `<div class="glass-card max-w-lg w-full max-h-[90vh] flex flex-col p-5 no-lift"><div class="flex justify-between items-center mb-1"><h2 class="text-lg font-bold text-white">Categorias</h2><button type="button" onclick="$('cat-modal').classList.add('hidden')" class="text-slate-400" aria-label="Fechar">✕</button></div>
    <p class="text-[11px] text-slate-400 mb-3">Mude nome e cor, ou crie as suas. Os lançamentos existentes são mantidos.</p>
    <div class="overflow-auto flex-1 space-y-2 pr-1">${CATEGORIES_LIST.map(c => `<div class="flex items-center gap-2" data-v="${escapeHtml(c.value)}">
      <input type="color" value="${c.color}" onchange="saveCat(this)" aria-label="Cor">
      <input value="${escapeHtml(c.label)}" onchange="saveCat(this)" class="flex-1 px-2.5 py-2 rounded-lg border text-sm" aria-label="Nome">
      ${c.custom ? '<button type="button" class="ib" onclick="deleteCategory(this)" aria-label="Excluir categoria">✕</button>' : '<span style="width:28px"></span>'}</div>`).join('')}</div>
    <div class="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800"><input id="nc-color" type="color" value="${CAT_PALETTE[CATEGORIES_LIST.length % 8]}" aria-label="Cor da nova categoria">
      <input id="nc-name" placeholder="Nova categoria" class="flex-1 px-2.5 py-2 rounded-lg border text-sm"><select id="nc-icon" class="px-2 py-2 rounded-lg border text-xs" aria-label="Ícone">${CAT_ICONS.map(i => `<option>${i}</option>`).join('')}</select>
      <button type="button" class="settle-btn" style="margin:0" onclick="addCustomCategory($('nc-name').value,$('nc-color').value,$('nc-icon').value)">Adicionar</button></div></div>`;
}
function openCatModal() { renderCatModal(); $('cat-modal').classList.remove('hidden'); }
async function saveCat(el) {
  const row = el.closest('[data-v]'), value = row.dataset.v, color = row.querySelector('input[type=color]').value, label = row.querySelector('input:not([type=color])').value.trim();
  if (!label) return renderCatModal();
  await mutateCloudState(s => {
    s.categories = s.categories || { custom: [], over: {} };
    const cu = s.categories.custom.find(c => c.value === value);
    if (cu) Object.assign(cu, { label, color }); else s.categories.over[value] = { label, color };
  });
  applyCategories(); renderCatModal();
}
async function addCustomCategory(name, color, icon) {
  name = (name || '').trim(); if (!name) return;
  if (CATEGORIES_LIST.some(c => c.value.toLowerCase() === name.toLowerCase() || c.label.toLowerCase() === name.toLowerCase())) return toast('Já existe uma categoria com esse nome.');
  await mutateCloudState(s => { s.categories = s.categories || { custom: [], over: {} }; s.categories.custom.push({ value: name, label: name, color, icon }); });
  applyCategories(); renderCatModal(); toast(`Categoria “${escapeHtml(name)}” criada`);
}
async function deleteCategory(el) {
  const value = el.closest('[data-v]').dataset.v, cu = (state.categories?.custom || []).find(c => c.value === value); if (!cu) return;
  const ids = state.transactions.filter(t => t.category === value).map(t => t.id), bud = (state.budgets || {})[value];
  await mutateCloudState(s => {
    s.categories.custom = s.categories.custom.filter(c => c.value !== value);
    s.transactions.forEach(t => { if (t.category === value) t.category = 'Outros'; });
    if (s.budgets) delete s.budgets[value];
  });
  applyCategories(); renderCatModal();
  toast(`“${escapeHtml(cu.label)}” excluída${ids.length ? ` (${ids.length} lançamentos foram para Outros)` : ''}`, 'Desfazer', async () => {
    await mutateCloudState(s => {
      if (!s.categories.custom.some(c => c.value === value)) s.categories.custom.push(cu);
      s.transactions.forEach(t => { if (ids.includes(t.id)) t.category = value; });
      if (bud) { s.budgets = s.budgets || {}; s.budgets[value] = bud; }
    });
    applyCategories(); renderCatModal();
  });
}

/* ---------- Backup: aviso, restauração (mesclar ou substituir) ---------- */
const __exportBackup = exportBackupJSON;
exportBackupJSON = function () { __exportBackup(); localStorage.setItem('fc_last_backup', String(Date.now())); };
function handleRestoreFile(ev) {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    ev.target.value = ''; let d;
    try { d = JSON.parse(r.result); d = d.state || d; } catch (e) { return toast('Arquivo inválido: não é um JSON.'); }
    if (!d || !Array.isArray(d.transactions)) return toast('Este arquivo não parece um backup do Finanças a Dois.');
    const all = d.transactions.length;
    d.transactions = d.transactions.filter(t => t && /^\d{4}-\d{2}$/.test(t.monthKey) && Number.isFinite(Number(t.amount)) && t.id != null).map(t => ({ ...t, amount: Number(t.amount) }));
    openRestore(d, all - d.transactions.length);
  };
  r.readAsText(f);
}
function openRestore(d, dropped) {
  const keys = d.transactions.map(t => t.monthKey).sort(), n = k => (Array.isArray(d[k]) ? d[k].length : 0);
  const cur = state.transactions.length;
  openForm('Restaurar backup', [
    { note: `<b>O arquivo tem:</b> ${d.transactions.length} lançamentos${keys.length ? ` (de ${keys[0]} a ${keys[keys.length - 1]})` : ''}, ${n('cards')} cartões, ${n('wallets')} carteiras, ${n('goals')} metas, ${n('recurring')} recorrentes.<br><b>Hoje no app:</b> ${cur} lançamentos.${dropped ? `<br><span class="text-amber-300">${dropped} linhas inválidas foram ignoradas.</span>` : ''}` },
    { k: 'mode', label: 'Como restaurar?', value: 'merge', options: [['merge', 'Mesclar: adiciona o que falta e mantém o que já existe'], ['replace', 'Substituir tudo pelo conteúdo do backup (baixa uma cópia do atual antes)']] }
  ], async f => {
    if (f.mode === 'replace') { try { localStorage.setItem('fc_prerestore', JSON.stringify(state)); } catch (e) {} exportBackupJSON(); }
    await mutateCloudState(s => applyBackup(s, d, f.mode));
    applyCategories(); toast(f.mode === 'replace' ? 'Backup restaurado (o app anterior foi baixado como cópia).' : 'Backup mesclado com os dados atuais.');
  }, 'Restaurar');
}
function applyBackup(s, d, mode) {
  const arr = ['transactions', 'cards', 'wallets', 'goals', 'recurring', 'settlements'], obj = ['salariesP1', 'salariesP2', 'budgets'];
  if (mode === 'replace') {
    // "Substituir" de verdade: o que o backup não tem (ex.: backups antigos) fica vazio. Só os cartões são mantidos se faltarem.
    arr.forEach(k => { s[k] = Array.isArray(d[k]) ? clone(d[k]) : (k === 'cards' ? s[k] : []); });
    obj.forEach(k => { s[k] = d[k] && typeof d[k] === 'object' ? { ...d[k] } : {}; });
    if (d.splitMode) s.splitMode = d.splitMode;
    s.categories = { custom: clone(d.categories?.custom || []), over: clone(d.categories?.over || {}) };
  } else {
    arr.forEach(k => { if (!Array.isArray(d[k])) return; s[k] = s[k] || []; const have = new Set(s[k].map(x => x.id)); d[k].forEach(x => { if (!have.has(x.id)) s[k].push(clone(x)); }); });
    obj.forEach(k => { s[k] = s[k] || {}; Object.entries(d[k] || {}).forEach(([a, b]) => { if (!(a in s[k])) s[k][a] = b; }); });
    if (d.categories) {
      s.categories = s.categories || { custom: [], over: {} }; const hv = new Set(s.categories.custom.map(c => c.value));
      (d.categories.custom || []).forEach(c => { if (!hv.has(c.value)) s.categories.custom.push(clone(c)); });
      Object.entries(d.categories.over || {}).forEach(([a, b]) => { if (!(a in s.categories.over)) s.categories.over[a] = b; });
    }
  }
}

/* ---------- Recorrentes: editar valor, dia, nome e categoria ---------- */
function editRecurring(id) {
  const r = (state.recurring || []).find(x => x.id === id); if (!r) return;
  openForm('Editar recorrente', [
    { k: 'desc', label: 'Descrição', value: r.desc },
    { k: 'amount', label: 'Valor (R$)', type: 'number', value: r.amount },
    { k: 'day', label: 'Dia do mês', type: 'number', value: r.day },
    { k: 'category', label: 'Categoria', value: r.category, options: CATEGORIES_LIST.map(c => [c.value, c.label]) }
  ], async d => {
    const o = { desc: d.desc.trim() || r.desc, amount: Math.round((parseFloat(d.amount) || r.amount) * 100) / 100, day: Math.min(31, Math.max(1, parseInt(d.day, 10) || r.day)), category: d.category };
    const n = new Date(), thisMk = getMonthKey(n.getFullYear(), n.getMonth());
    await mutateCloudState(s => {
      const x = (s.recurring || []).find(y => y.id === id); if (x) Object.assign(x, o);
      s.transactions.forEach(t => { if (t.recurId === id && t.status === 'pending' && t.monthKey >= thisMk) Object.assign(t, o); });
    });
    toast('Recorrente atualizada (lançamentos futuros pendentes também)');
  });
}

/* ---------- Carteira para aportes antigos ---------- */
function assignUnallocated() {
  const W = state.wallets || []; if (!W.length) return;
  openForm('Atribuir aportes sem carteira', [
    { note: 'Todos os aportes que ainda não têm carteira serão atribuídos à carteira escolhida.' },
    { k: 'w', label: 'Carteira', value: W[0].id, options: W.map(w => [w.id, w.name]) }
  ], async d => {
    const wid = Number(d.w);
    await mutateCloudState(s => { const ids = new Set((s.wallets || []).map(w => w.id)); s.transactions.forEach(t => { if (t.type === 'investment' && !ids.has(t.walletId)) t.walletId = wid; }); });
    toast('Aportes atribuídos');
  });
}

/* ---------- Comprometido nos próximos meses + relatório do ano ---------- */
(function () { ['committed-card', 'year-card'].forEach(id => { const c = document.createElement('div'); c.id = id; c.className = 'glass-card p-4 sm:p-5'; $('view-stats').appendChild(c); }); })();
function renderCommitted() {
  const n = new Date(), rows = [];
  for (let o = 0; o < 6; o++) {
    const mk = addMonthsToYearMonth(n.getFullYear(), n.getMonth(), o), T = state.transactions.filter(t => t.monthKey === mk && t.type !== 'income' && t.type !== 'investment' && t.status === 'pending'), card = sumBy(T.filter(t => t.method === 'Cartão de Crédito'));
    rows.push({ mk, card, other: sumBy(T) - card, n: T.filter(t => /\(\d+\/\d+\)\s*$/.test(t.desc)).length });
  }
  const tot = rows.reduce((s, r) => s + r.card + r.other, 0), mx = Math.max(1, ...rows.map(r => r.card + r.other));
  $('committed-card').innerHTML = `<div class="flex flex-wrap items-end justify-between gap-2 mb-3"><div><h3 class="text-base font-semibold text-white">Já comprometido nos próximos 6 meses</h3><p class="text-[11px] text-slate-400">Contas e faturas pendentes já lançadas, incluindo parcelas.</p></div><div class="text-2xl font-extrabold text-glow-rose">${formatBRL(tot)}</div></div>
    ${rows.map(r => { const [y, m] = r.mk.split('-'), t = r.card + r.other; return `<div class="grid items-center gap-3 py-1.5 text-xs" style="grid-template-columns:54px 1fr 92px"><span class="text-slate-300 font-semibold">${MONTH_SHORT[m - 1]}/${y.slice(2)}</span>
      <div class="cbar"><i style="width:${r.card / mx * 100}%;background:#a78bfa"></i><i style="width:${r.other / mx * 100}%;background:#22d3ee"></i></div><span class="text-right text-slate-200">${t ? formatBRL(t) : '—'}${r.n ? `<span class="block text-[10px] text-slate-400">${r.n} parcela${r.n > 1 ? 's' : ''}</span>` : ''}</span></div>`; }).join('')}
    <div class="flex gap-4 mt-2 text-[10px] text-slate-400"><span><i class="cdot" style="background:#a78bfa"></i>Cartão</span><span><i class="cdot" style="background:#22d3ee"></i>Outras contas</span></div>`;
}
function renderYear() {
  const cats = {};
  state.transactions.forEach(t => { if (!t.monthKey.startsWith(currentYear + '-') || t.type === 'income' || t.type === 'investment') return; (cats[t.category] = cats[t.category] || Array(12).fill(0))[+t.monthKey.split('-')[1] - 1] += t.amount; });
  const names = Object.keys(cats).sort((a, b) => sumBy(cats[b], x => x) - sumBy(cats[a], x => x));
  const M = Array.from({ length: 12 }, (_, m) => monthMetrics(currentYear, m)), hex = n => Math.round(n).toString(16).padStart(2, '0');
  const cell = (v, col, mx) => v ? `<td style="background:${col}${hex(28 + v / mx * 100)}">${shortBRL(v)}</td>` : '<td class="text-slate-500">·</td>';
  $('year-card').innerHTML = `<h3 class="text-base font-semibold text-white mb-1">Relatório de ${currentYear}</h3><p class="text-[11px] text-slate-400 mb-3">Gastos por categoria em cada mês (sem aportes). Quanto mais forte a cor, maior o gasto.</p>` + (names.length ? `<div class="overflow-x-auto"><table class="yr"><thead><tr><th></th>${MONTH_SHORT.map(m => `<th>${m}</th>`).join('')}<th>Total</th></tr></thead><tbody>
    ${names.map(n => { const r = cats[n], mx = Math.max(...r); return `<tr><td><i class="cdot" style="background:${catColor(n)}"></i>${escapeHtml(catLabel(n))}</td>${r.map(v => cell(v, catColor(n), mx)).join('')}<td class="font-bold text-white">${shortBRL(sumBy(r, x => x))}</td></tr>`; }).join('')}
    <tr class="tot"><td>Saídas</td>${M.map(x => `<td>${x.exp ? shortBRL(x.exp) : '·'}</td>`).join('')}<td>${shortBRL(sumBy(M, x => x.exp))}</td></tr>
    <tr class="tot"><td>Renda</td>${M.map(x => `<td class="text-emerald-300">${x.income ? shortBRL(x.income) : '·'}</td>`).join('')}<td class="text-emerald-300">${shortBRL(sumBy(M, x => x.income))}</td></tr>
    <tr class="tot"><td>Sobrou</td>${M.map(x => `<td style="color:${x.net >= 0 ? '#34d399' : '#fb7185'}">${x.income || x.exp ? shortBRL(x.net) : '·'}</td>`).join('')}<td style="color:#fff">${shortBRL(sumBy(M, x => x.net))}</td></tr></tbody></table></div>` : '<p class="text-xs text-slate-500">Sem gastos em ' + currentYear + '.</p>');
}

/* ---------- Menu Ferramentas, atualização do app, gancho final ---------- */
(function () {
  const menu = document.querySelector('#tools .menu');
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.id = 'restore-input'; inp.className = 'hidden'; inp.onchange = handleRestoreFile; menu.appendChild(inp);
  [['📂 Restaurar backup', () => inp.click()], ['✨ Categorias', openCatModal]].forEach(([t, fn]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => { $('tools').open = false; fn(); }; menu.appendChild(b); });
  if ('serviceWorker' in navigator) { const had = !!navigator.serviceWorker.controller; navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('Nova versão instalada.', 'Recarregar', () => location.reload()); }); }
})();
const __renderAll3 = renderAll;
renderAll = function () {
  applyCategories(); fillCatFilter(); __renderAll3();
  try { renderCommitted(); renderYear(); if (!$('cat-modal')?.classList.contains('hidden') && $('cat-modal') && !$('cat-modal').contains(document.activeElement)) renderCatModal(); } catch (e) { console.error(e); }
};
renderAll();
