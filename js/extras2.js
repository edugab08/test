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
  const known = new Set([...list.map(c => c.value), outros.value, ...(cf.custom || []).map(c => c.value)]), legacy = new Set();
  const seen = c => { if (c && !known.has(c)) legacy.add(c); };
  state.transactions.forEach(t => { if (t.type !== 'income') seen(t.category); });
  (state.recurring || []).forEach(r => seen(r.category)); Object.keys(state.budgets || {}).forEach(seen);
  (cf.custom || []).forEach(c => list.push({ value: c.value, label: c.label, color: c.color, icon: c.icon || 'box', custom: true }));
  legacy.forEach(n => list.push({ value: n, label: n, color: hashColor(n), icon: 'box', legacy: true }));
  list.push(outros);
  CATEGORIES_LIST.length = 0; list.forEach(c => CATEGORIES_LIST.push(c));
}
function fillCatFilter() {
  const el = $('filter-cat'), v = el.value;
  el.innerHTML = '<option value="">Todas as categorias</option>' + CATEGORIES_LIST.map(c => `<option value="${escapeHtml(c.value)}">${escapeHtml(c.label)}</option>`).join('');
  el.value = CATEGORIES_LIST.some(c => c.value === v) ? v : '';
}
const ICON_PT = { home: 'Casa', cart: 'Mercado', utensils: 'Comida', car: 'Carro', pill: 'Saúde', shirt: 'Roupa', book: 'Estudo', film: 'Filmes', gamepad: 'Jogos', paw: 'Pet', box: 'Outros', trend: 'Investir', wallet: 'Carteira', bulb: 'Ideia', bolt: 'Energia', target: 'Meta' };
function renderCatModal() {
  let m = $('cat-modal');
  if (!m) { m = document.createElement('div'); m.id = 'cat-modal'; m.className = 'fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 hidden'; m.style.zIndex = 60; document.body.appendChild(m); }
  const legacy = CATEGORIES_LIST.filter(c => c.legacy), normal = CATEGORIES_LIST.filter(c => !c.legacy);
  const count = v => state.transactions.filter(t => t.category === v).length;
  const mergeOpts = normal.map(x => `<option value="${escapeHtml(x.value)}">${escapeHtml(x.label)}</option>`).join('');
  m.innerHTML = `<div class="glass-card max-w-lg w-full max-h-[90vh] flex flex-col p-5 no-lift"><div class="flex justify-between items-center mb-1"><h2 class="text-lg font-bold text-white">Categorias</h2><button type="button" onclick="$('cat-modal').classList.add('hidden')" class="text-slate-400" aria-label="Fechar">✕</button></div>
    <div class="overflow-y-auto flex-1 min-h-0 pr-1">
    ${legacy.length ? `<div class="mb-4"><p class="text-[11px] text-amber-300 mb-2">Categorias antigas encontradas nos seus lançamentos. Escolha em qual categoria atual juntar cada uma:</p><div class="space-y-2">${legacy.map(c => `<div class="rounded-xl p-3" style="background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.25)" data-v="${escapeHtml(c.value)}">
      <div class="flex items-center gap-2 mb-2"><i class="cdot" style="background:${c.color};margin:0"></i><span class="text-sm text-slate-100 font-semibold break-words min-w-0">${escapeHtml(c.label)}</span><span class="text-[10px] text-slate-400 ml-auto whitespace-nowrap">${count(c.value)} lançamento${count(c.value) === 1 ? '' : 's'}</span></div>
      <select class="w-full px-2.5 py-2 rounded-lg border text-xs" aria-label="Mesclar ${escapeHtml(c.label)} em" onchange="mergeCategory(this.closest('[data-v]').dataset.v, this.value)"><option value="">Mesclar em…</option>${mergeOpts}</select></div>`).join('')}</div></div>` : ''}
    <p class="text-[11px] text-slate-400 mb-2">Mude nome e cor, ou crie as suas. Os lançamentos existentes são mantidos.</p>
    <div class="space-y-2">${normal.map(c => `<div class="flex items-center gap-2" data-v="${escapeHtml(c.value)}">
      <input type="color" value="${c.color}" onchange="saveCat(this)" aria-label="Cor">
      <input value="${escapeHtml(c.label)}" onchange="saveCat(this)" class="flex-1 min-w-0 px-2.5 py-2 rounded-lg border text-sm" aria-label="Nome">
      ${c.custom ? '<button type="button" class="ib" onclick="deleteCategory(this)" aria-label="Excluir categoria">✕</button>' : '<span style="width:28px;flex:none"></span>'}</div>`).join('')}</div></div>
    <div class="mt-3 pt-3 border-t border-slate-800 space-y-2"><div class="text-[11px] text-slate-400">Nova categoria</div>
      <div class="flex items-center gap-2"><input id="nc-color" type="color" value="${CAT_PALETTE[CATEGORIES_LIST.length % 8]}" aria-label="Cor da nova categoria"><input id="nc-name" placeholder="Nome (ex: Pets Vet)" class="flex-1 min-w-0 px-2.5 py-2 rounded-lg border text-sm"></div>
      <div class="flex items-center gap-2"><select id="nc-icon" class="flex-1 min-w-0 px-2.5 py-2 rounded-lg border text-xs" aria-label="Ícone">${CAT_ICONS.map(i => `<option value="${i}">Ícone: ${ICON_PT[i]}</option>`).join('')}</select>
      <button type="button" class="settle-btn" style="margin:0;padding:10px 20px;font-size:12px;flex:none" onclick="addCustomCategory($('nc-name').value,$('nc-color').value,$('nc-icon').value)">Adicionar</button></div></div></div>`;
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
async function mergeCategory(from, to) {
  if (!to || to === from) return;
  const ids = state.transactions.filter(t => t.category === from).map(t => t.id), rids = (state.recurring || []).filter(r => r.category === from).map(r => r.id), bud = (state.budgets || {})[from] || 0;
  await mutateCloudState(s => {
    s.transactions.forEach(t => { if (t.category === from) t.category = to; });
    (s.recurring || []).forEach(r => { if (r.category === from) r.category = to; });
    if (s.budgets && from in s.budgets) { s.budgets[to] = (s.budgets[to] || 0) + s.budgets[from]; delete s.budgets[from]; }
  });
  applyCategories(); renderCatModal();
  toast(`“${escapeHtml(from)}” mesclada em “${escapeHtml(catLabel(to))}” (${ids.length} lançamentos)`, 'Desfazer', async () => {
    await mutateCloudState(s => {
      s.transactions.forEach(t => { if (ids.includes(t.id)) t.category = from; });
      (s.recurring || []).forEach(r => { if (rids.includes(r.id)) r.category = from; });
      if (bud) { s.budgets = s.budgets || {}; s.budgets[from] = bud; s.budgets[to] = Math.max(0, (s.budgets[to] || 0) - bud) || undefined; if (s.budgets[to] === undefined) delete s.budgets[to]; }
    });
    applyCategories(); renderCatModal();
  });
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
  const lg = CATEGORIES_LIST.filter(c => c.legacy);
  if (lg.length && !window._legacyToast) { window._legacyToast = 1; toast(`Encontrei categorias antigas (${lg.slice(0, 2).map(c => escapeHtml(c.label)).join(', ')}${lg.length > 2 ? '…' : ''}).`, 'Organizar', openCatModal); }
  try { renderCommitted(); renderYear(); if (!$('cat-modal')?.classList.contains('hidden') && $('cat-modal') && !$('cat-modal').contains(document.activeElement)) renderCatModal(); } catch (e) { console.error(e); }
};
renderAll();

/* ---------- Diagnóstico do mês (antigo "Analisar com IA") ---------- */
function monthBreakdown(y, m) {
  const M = monthMetrics(y, m), by = t => sumBy(M.T.filter(x => x.type === t));
  return { M, income: M.income, fixed: by('expense_fixed'), variable: by('expense_variable'), inv: M.inv };
}
const invBy = mk => state.transactions.filter(t => t.type === 'investment' && t.status === 'paid' && t.monthKey === mk).reduce((s, t) => s + t.amount, 0);
function committedNext(months) {
  const n = new Date(); let tot = 0;
  for (let o = 1; o <= months; o++) { const mk = addMonthsToYearMonth(n.getFullYear(), n.getMonth(), o); tot += sumBy(state.transactions.filter(t => t.monthKey === mk && t.type !== 'income' && t.type !== 'investment' && t.status === 'pending')); }
  return tot;
}
function diagnosticItems() {
  const B = monthBreakdown(currentYear, currentMonth), M = B.M, inc = B.income, items = [], add = (tone, title, text) => items.push({ tone, title, text });
  if (!(inc > 0)) return [{ tone: 'info', title: 'Sem renda lançada neste mês', text: 'Lance os salários (botão “Salários” na Visão Geral) para ver o diagnóstico completo.' }];
  const n = new Date(), real = n.getFullYear() === currentYear && n.getMonth() === currentMonth, pct = v => v / inc * 100;
  const f = pct(B.fixed), v = pct(B.variable), i = pct(B.inv), sp = monthSpent(M.mk);
  add(f > 50 ? 'bad' : f > 45 ? 'warn' : 'ok', `Fixos: ${f.toFixed(0)}% da renda`, f > 50 ? `Acima da meta de 50% (${formatBRL(B.fixed)}). Revise contas fixas e assinaturas.` : `Dentro da meta de 50% (${formatBRL(B.fixed)}).`);
  add(v > 30 ? 'bad' : v > 27 ? 'warn' : 'ok', `Variáveis: ${v.toFixed(0)}% da renda`, v > 30 ? `Acima da meta de 30% (${formatBRL(B.variable)}). Veja onde cortar abaixo.` : `Dentro da meta de 30% (${formatBRL(B.variable)}).`);
  const faltaInv = Math.max(0, inc * 0.2 - B.inv);
  add(i >= 20 ? 'ok' : (real && n.getDate() < 20) ? 'info' : i >= 10 ? 'warn' : 'bad', `Investido: ${i.toFixed(0)}% da renda`, i >= 20 ? 'Meta de 20% atingida.' : `Faltam ${formatBRL(faltaInv)} para chegar aos 20%${real && n.getDate() < 20 ? ' (ainda dá tempo neste mês)' : ''}.`);
  const bud = state.budgets || {}, over = [], near = [];
  expCats().forEach(c => { const l = bud[c.value]; if (!l) return; const s = sp[c.value] || 0; if (s > l) over.push(`${catLabel(c.value)} (+${formatBRL(s - l)})`); else if (s / l >= 0.8) near.push(`${catLabel(c.value)} (${(s / l * 100).toFixed(0)}%)`); });
  if (over.length) add('bad', 'Orçamento estourado', over.slice(0, 4).join(', '));
  if (near.length) add('warn', 'Perto do limite do orçamento', near.slice(0, 4).join(', '));
  if (!Object.keys(bud).length) add('info', 'Sem orçamento por categoria', 'Defina limites na aba Orçamento (há o botão “Sugerir limites”).');
  const pg = monthSpent(addMonthsToYearMonth(currentYear, currentMonth, -1));
  if (Object.keys(pg).length) {
    const ups = Object.keys(sp).map(c => ({ c, d: sp[c] - (pg[c] || 0), p: pg[c] ? (sp[c] - pg[c]) / pg[c] * 100 : null })).filter(x => x.d >= 50 && (x.p === null || x.p >= 10)).sort((a, b) => b.d - a.d).slice(0, 3);
    if (ups.length) add('warn', 'O que mais subiu em relação ao mês anterior', ups.map(x => `${catLabel(x.c)} +${formatBRL(x.d)}${x.p === null ? ' (novo)' : ` (+${x.p.toFixed(0)}%)`}`).join(', '));
  }
  const vs = {}; M.T.filter(t => t.type === 'expense_variable').forEach(t => { vs[t.category] = (vs[t.category] || 0) + t.amount; });
  const top = Object.keys(vs).sort((a, b) => vs[b] - vs[a])[0];
  if (top) add('info', 'Maior gasto variável', `${catLabel(top)}: ${formatBRL(vs[top])}.`);
  if (real) {
    const left = new Date(currentYear, currentMonth + 1, 0).getDate() - n.getDate(), daily = sumBy(M.T.filter(t => t.type === 'expense_variable' && t.status === 'paid')) / n.getDate(), fc = M.total - daily * left;
    add(fc < 0 ? 'bad' : 'info', 'Previsão para o fim do mês', `Saldo previsto: ${formatBRL(fc)}, se os gastos variáveis seguirem em ${formatBRL(daily)} por dia nos próximos ${left} dias.`);
  }
  const com = committedNext(3); if (com > 0) add('info', 'Já comprometido nos próximos 3 meses', `${formatBRL(com)} em contas e parcelas pendentes.`);
  const W = state.wallets || [], totalW = W.reduce((s, w) => s + walletBal(w), 0) + unallocated(), avg = [0, -1, -2].reduce((s, k) => s + invBy(addMonthsToYearMonth(n.getFullYear(), n.getMonth(), k)), 0) / 3;
  (state.goals || []).slice(0, 3).forEach(g => {
    const w = W.find(x => x.id === g.walletId), cur = w ? walletBal(w) : totalW, [dy, dm] = (g.deadline || '').split('-').map(Number), left = dy ? Math.max(1, dy * 12 + dm - (n.getFullYear() * 12 + n.getMonth() + 1)) : 1, need = Math.max(0, g.target - cur) / left;
    if (cur >= g.target) add('ok', `Meta “${g.name}”`, 'Atingida!');
    else add(avg >= need ? 'ok' : 'warn', `Meta “${g.name}”: ${(cur / g.target * 100).toFixed(0)}%`, `Precisa de ${formatBRL(need)} por mês; seu aporte médio é ${formatBRL(avg)}.`);
  });
  return items;
}
function renderDiagnosis() {
  const B = monthBreakdown(currentYear, currentMonth), M = B.M, rank = { bad: 0, warn: 1, info: 2, ok: 3 }, T = { bad: ['#fb7185', 'warn'], warn: ['#fbbf24', 'warn'], info: ['#22d3ee', 'bulb'], ok: ['#34d399', 'check'] };
  const items = diagnosticItems().sort((a, b) => rank[a.tone] - rank[b.tone]);
  return `<div class="flex justify-between gap-2 pb-2 mb-1 border-b border-slate-800/70 text-[11px]"><span class="text-slate-400">Renda <b class="text-white">${formatBRL(B.income)}</b></span><span class="text-slate-400">Saídas <b class="text-white">${formatBRL(M.exp)}</b></span><span class="text-slate-400">Sobrou <b style="color:${M.net >= 0 ? '#34d399' : '#fb7185'}">${formatBRL(M.net)}</b></span></div>` +
    items.map(it => `<div class="flex gap-2.5 py-2 border-b border-slate-800/60 last:border-0"><span style="color:${T[it.tone][0]};flex:none;margin-top:1px">${svgIcon(T[it.tone][1], 16)}</span><div class="min-w-0"><div class="font-semibold text-slate-100">${escapeHtml(it.title)}</div><div class="text-slate-400 text-[11px] leading-snug mt-0.5">${escapeHtml(it.text)}</div></div></div>`).join('');
}
function buildAIPrompt(anon) {
  const B = monthBreakdown(currentYear, currentMonth), M = B.M, inc = B.income, p = v => inc > 0 ? (v / inc * 100).toFixed(0) + '%' : '—';
  const sp = monthSpent(M.mk), pg = monthSpent(addMonthsToYearMonth(currentYear, currentMonth, -1)), bud = state.budgets || {}, L = [];
  L.push('Você é um consultor financeiro para casais: direto, respeitoso e prático. Responda em português do Brasil, com valores em reais.', '');
  L.push(`Mês analisado: ${MONTH_NAMES[currentMonth]}/${currentYear}`, `Renda do casal: ${_fmt0(inc)}`, `Fixos: ${_fmt0(B.fixed)} (${p(B.fixed)}) | Variáveis: ${_fmt0(B.variable)} (${p(B.variable)}) | Investido: ${_fmt0(B.inv)} (${p(B.inv)}) | Sobrou: ${_fmt0(M.net)}`, 'Meta do casal: regra 50-30-20 (50% fixos, 30% variáveis, 20% investimentos).', '', 'Gastos por categoria:');
  Object.keys(sp).sort((a, b) => sp[b] - sp[a]).forEach(c => L.push(`- ${catLabel(c)}: ${_fmt0(sp[c])} (${p(sp[c])} da renda)${pg[c] ? `, mês anterior ${_fmt0(pg[c])}` : ''}${bud[c] ? `, limite ${_fmt0(bud[c])}` : ''}`));
  L.push('', 'Maiores gastos individuais:');
  M.out.filter(t => t.type !== 'investment').sort((a, b) => b.amount - a.amount).slice(0, 10).forEach(t => L.push(`- ${anon ? '(descrição oculta)' : t.desc} | ${catLabel(t.category)} | ${_fmt0(t.amount)}`));
  const com = committedNext(3); if (com > 0) L.push('', `Já comprometido nos próximos 3 meses (contas e parcelas pendentes): ${_fmt0(com)}`);
  (state.goals || []).slice(0, 3).forEach((g, k) => L.push(k ? '' : '', `Meta ${anon ? k + 1 : '“' + g.name + '”'}: alvo ${_fmt0(g.target)} até ${g.deadline || 'sem prazo'}`));
  L.push('', 'Responda em tópicos curtos:', '1. Quais são os 2 ou 3 principais riscos deste mês?', '2. Onde cortar, com valores sugeridos por categoria.', '3. Um plano prático para o próximo mês.', '4. Um ponto positivo que eles devem manter.');
  return L.join('\n');
}
function updateAIText() { $('ai-text').value = buildAIPrompt($('ai-anon').checked); }
function openAIModal() {
  $('ai-title').textContent = `Diagnóstico de ${MONTH_NAMES[currentMonth]}`;
  $('ai-local-diagnosis').innerHTML = renderDiagnosis(); updateAIText(); $('ai-modal').classList.remove('hidden');
}
async function copyPromptForAI() {
  const text = buildAIPrompt($('ai-anon').checked); let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { try { updateAIText(); $('ai-text').select(); ok = document.execCommand('copy'); } catch (e2) {} }
  if (!ok) $('ai-details').open = true;
  toast(ok ? 'Resumo copiado. Cole na IA que preferir.' : 'Não consegui copiar sozinho: abri o texto, é só selecionar e copiar.');
}
