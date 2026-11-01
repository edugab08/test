// ===== Extras: orçamento, patrimônio/metas, recorrentes, salários, desfazer e offline =====
const $ = id => document.getElementById(id);
const uid = () => Date.now() + Math.floor(Math.random() * 1000);
const WPAL = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#fb7185', '#2dd4bf'];
const expCats = () => CATEGORIES_LIST.filter(c => !['Investimentos', 'Renda Extra'].includes(c.value));
let wealthChartInstance = null;

/* ---------- Toast com "Desfazer" ---------- */
function toast(msg, label, fn) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.innerHTML = `<span>${msg}</span>${label ? `<button type="button">${label}</button>` : ''}`;
  t.classList.add('show');
  if (label) t.querySelector('button').onclick = () => { t.classList.remove('show'); fn(); };
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 7000);
}

/* ---------- Modal de formulário genérico ---------- */
function openForm(title, fields, onSubmit, submitLabel = 'Salvar') {
  let m = $('fm');
  if (!m) {
    m = document.createElement('div'); m.id = 'fm';
    m.className = 'fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4';
    m.style.zIndex = 60; document.body.appendChild(m);
  }
  const fld = f => f.note ? `<p class="text-xs text-slate-300 bg-slate-900/60 rounded-xl p-3 leading-relaxed">${f.note}</p>` : `<div><label class="block text-[11px] text-slate-400 mb-1">${escapeHtml(f.label)}</label>${f.options
    ? `<select name="${f.k}" class="w-full px-3 py-2.5 rounded-xl border text-sm">${f.options.map(o => `<option value="${escapeHtml(o[0])}" ${String(o[0]) === String(f.value) ? 'selected' : ''}>${escapeHtml(o[1])}</option>`).join('')}</select>`
    : `<input name="${f.k}" type="${f.type || 'text'}" step="any" value="${escapeHtml(f.value ?? '')}" ${f.req === false ? '' : 'required'} class="w-full px-3 py-2.5 rounded-xl border text-sm" />`}</div>`;
  m.innerHTML = `<form class="glass-card max-w-md w-full p-6 space-y-3"><div class="flex justify-between items-center"><h2 class="text-lg font-bold text-white">${escapeHtml(title)}</h2><button type="button" data-x class="text-slate-400 hover:text-white">✕</button></div>${fields.map(fld).join('')}<button class="w-full py-3 bg-blue-600 text-white rounded-xl font-bold mt-2">${submitLabel}</button></form>`;
  m.classList.remove('hidden');
  const close = () => m.classList.add('hidden');
  m.querySelector('[data-x]').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };
  m.querySelector('form').onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); close(); await onSubmit(d); };
}

/* ---------- Estrutura das telas novas ---------- */
(function () {
  const host = document.querySelector('.max-w-7xl');
  ['budget', 'wealth'].forEach(v => { const d = document.createElement('div'); d.id = 'view-' + v; d.className = 'view col'; host.appendChild(d); });
  const rc = document.createElement('div'); rc.id = 'recurring-card'; rc.className = 'glass-card p-4 sm:p-5'; $('view-tx').appendChild(rc);
  const ba = document.createElement('div'); ba.id = 'budget-alert'; $('view-home').prepend(ba);
})();

/* ---------- Salários base do mês ---------- */
function openSalaryModal() {
  const mk = getMonthKey(currentYear, currentMonth), p1 = cloudCfg.p1Name || 'Pessoa 1', p2 = cloudCfg.p2Name || 'Pessoa 2';
  openForm(`Salários de ${MONTH_NAMES[currentMonth]}`, [
    { k: 'v1', label: `Salário de ${p1} (R$)`, type: 'number', value: state.salariesP1[mk] || 0 },
    { k: 'v2', label: `Salário de ${p2} (R$)`, type: 'number', value: state.salariesP2[mk] || 0 },
    { k: 'rep', label: 'Aplicar em', value: '1', options: [['0', 'Só neste mês'], ['1', `Deste mês até dezembro de ${currentYear}`]] }
  ], async d => {
    const v1 = Math.max(0, parseFloat(d.v1) || 0), v2 = Math.max(0, parseFloat(d.v2) || 0), to = d.rep === '1' ? 11 : currentMonth;
    await mutateCloudState(s => { for (let m = currentMonth; m <= to; m++) { const k = getMonthKey(currentYear, m); s.salariesP1[k] = v1; s.salariesP2[k] = v2; } });
    toast('Salários salvos');
  });
}

/* ---------- Excluir com desfazer ---------- */
async function deleteTransaction(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  await mutateCloudState(s => {
    s.transactions = s.transactions.filter(t => t.id !== id);
    const r = (s.recurring || []).find(x => x.id === tx.recurId);
    if (r) { r.skipped = r.skipped || []; if (!r.skipped.includes(tx.monthKey)) r.skipped.push(tx.monthKey); }
  });
  toast(`“${escapeHtml(tx.desc)}” excluído`, 'Desfazer', () => mutateCloudState(s => {
    if (!s.transactions.some(t => t.id === tx.id)) s.transactions.push(tx);
    const r = (s.recurring || []).find(x => x.id === tx.recurId);
    if (r) r.skipped = (r.skipped || []).filter(k => k !== tx.monthKey);
  }));
}

/* ---------- Recorrentes automáticas ---------- */
async function makeRecurring(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;
  const desc = t.desc.replace(/\s*\(\d+\/\d+\)$/, '').replace(/ \(Cópia\)$/, '');
  if ((state.recurring || []).some(r => r.desc === desc && r.method === t.method)) return toast('Já existe uma recorrente com esse nome');
  const rid = uid();
  await mutateCloudState(s => {
    s.recurring = s.recurring || [];
    s.recurring.push({ id: rid, desc, notes: t.notes || '', amount: t.amount, day: t.day || 1, category: t.category, type: t.type, method: t.method, cardId: t.cardId || null, owner: t.owner, start: t.monthKey, skipped: [] });
    const o = s.transactions.find(x => x.id === id); if (o) o.recurId = rid;
  });
  toast(`“${escapeHtml(desc)}” agora se repete todo mês`);
}
async function stopRecurring(id) {
  const r = (state.recurring || []).find(x => x.id === id);
  if (!r) return;
  const now = new Date(), thisMk = getMonthKey(now.getFullYear(), now.getMonth());
  await mutateCloudState(s => {
    s.recurring = s.recurring.filter(x => x.id !== id);
    s.transactions = s.transactions.filter(t => !(t.recurId === id && t.monthKey > thisMk && t.status === 'pending'));
  });
  toast(`“${escapeHtml(r.desc)}” não se repete mais`, 'Desfazer', () => mutateCloudState(s => { s.recurring.push(r); }));
}
function missingRec(S) {
  const n = new Date(), out = [];
  (S.recurring || []).forEach(r => [0, 1, 2].forEach(o => {
    const mk = addMonthsToYearMonth(n.getFullYear(), n.getMonth(), o);
    if (mk >= r.start && !(r.skipped || []).includes(mk) && !S.transactions.some(t => t.recurId === r.id && t.monthKey === mk)) out.push([r, mk]);
  }));
  return out;
}
async function ensureRecurring() {
  if (!hasValidCloudConfig() || isSyncing || !missingRec(state).length) return;
  await mutateCloudState(s => missingRec(s).forEach(([r, mk]) => s.transactions.push({
    id: r.id + Number(mk.replace('-', '')), monthKey: mk, day: r.day, desc: r.desc, notes: r.notes || '', amount: r.amount,
    category: r.category, type: r.type, method: r.method, cardId: r.cardId || null, owner: r.owner, status: 'pending', recurId: r.id, walletId: r.walletId || null
  })));
}
function renderRecurring() {
  const R = state.recurring || [];
  $('recurring-card').innerHTML = `<h3 class="text-base font-semibold text-white">🔁 Despesas recorrentes</h3>
    <p class="text-[11px] text-slate-400 mb-3">Lançadas sozinhas todo mês. Toque em 🔁 em qualquer lançamento para torná-lo recorrente.</p>` +
    (R.length ? R.map(r => `<div class="flex items-center justify-between py-2.5 border-b border-slate-800/60 text-sm">
      <div><div class="text-slate-200">${escapeHtml(r.desc)}</div><div class="text-[10px] text-slate-400">todo dia ${r.day} • ${escapeHtml(r.category)}</div></div>
      <div class="flex items-center gap-3"><strong>${formatBRL(r.amount)}</strong><button type="button" class="ib" aria-label="Editar" onclick="editRecurring(${r.id})">✏️</button><button type="button" onclick="stopRecurring(${r.id})" class="text-xs text-rose-400">Parar</button></div></div>`).join('')
      : '<p class="text-xs text-slate-500">Nenhuma ainda.</p>');
}

/* ---------- Orçamento por categoria ---------- */
function monthSpent(mk) {
  const g = {};
  state.transactions.filter(t => t.monthKey === mk && t.type !== 'income' && t.type !== 'investment').forEach(t => g[t.category] = (g[t.category] || 0) + t.amount);
  return g;
}
const pcol = p => p >= 100 ? '#fb7185' : p >= 80 ? '#fbbf24' : '#22d3ee';
function renderBudget() {
  const el = $('view-budget');
  if (el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const b = state.budgets || {}, sp = monthSpent(getMonthKey(currentYear, currentMonth));
  const totB = expCats().reduce((s, c) => s + (b[c.value] || 0), 0);
  const totS = expCats().reduce((s, c) => b[c.value] ? s + (sp[c.value] || 0) : s, 0);
  const tp = totB > 0 ? totS / totB * 100 : 0;
  el.innerHTML = `<div class="glass-card p-5 no-lift">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h2 class="text-xl font-extrabold brand">Orçamento de ${MONTH_NAMES[currentMonth]}</h2>
        <p class="text-[11px] text-slate-400">Defina um limite por categoria. Avisamos a partir de 80%.</p></div>
        <button type="button" onclick="suggestBudgets()" class="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white">✨ Sugerir limites</button>
      </div>
      <div class="flex justify-between text-xs mt-4"><span class="text-slate-300">Gasto nas categorias com limite: <strong>${formatBRL(totS)}</strong></span><span class="text-slate-400">Orçado: <strong class="text-white">${formatBRL(totB)}</strong></span></div>
      <div class="w-full bg-slate-800/80 h-2.5 rounded-full overflow-hidden mt-2"><div class="h-full transition-all duration-700" style="width:${Math.min(100, tp)}%;background:${pcol(tp)};box-shadow:0 0 12px ${pcol(tp)}"></div></div>
    </div>
    <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">${expCats().map((c, i) => {
      const lim = b[c.value] || 0, s = sp[c.value] || 0, p = lim ? s / lim * 100 : 0;
      return `<div class="glass-card p-4 no-lift">
        <div class="flex items-center justify-between gap-2"><span class="text-sm font-semibold text-slate-100 flex items-center gap-2"><span class="cico" style="background:${c.color}22;color:${c.color}">${svgIcon(c.icon, 14)}</span>${escapeHtml(c.label)}</span>
        <input type="number" min="0" step="10" placeholder="Sem limite" value="${lim || ''}" onchange="setBudget(${i}, this.value)" class="w-28 px-2.5 py-1.5 text-right rounded-lg border text-xs font-semibold" /></div>
        ${lim ? `<div class="w-full bg-slate-800/80 h-2 rounded-full overflow-hidden mt-3"><div class="h-full transition-all duration-700" style="width:${Math.min(100, p)}%;background:${pcol(p)};box-shadow:0 0 10px ${pcol(p)}"></div></div>
        <div class="flex justify-between text-[11px] mt-2"><span style="color:${pcol(p)}">${p.toFixed(0)}% • ${formatBRL(s)}</span><span class="text-slate-400">${s > lim ? 'Estourou ' + formatBRL(s - lim) : 'Restam ' + formatBRL(lim - s)}</span></div>`
        : `<div class="text-[11px] text-slate-500 mt-3">Gasto no mês: ${formatBRL(s)}</div>`}</div>`;
    }).join('')}</div>`;
}
async function setBudget(i, v) {
  const cat = expCats()[i].value, val = Math.max(0, parseFloat(v) || 0);
  await mutateCloudState(s => { s.budgets = s.budgets || {}; if (val > 0) s.budgets[cat] = val; else delete s.budgets[cat]; });
}
async function suggestBudgets() {
  const avg = {};
  [1, 2, 3].forEach(n => { const g = monthSpent(addMonthsToYearMonth(currentYear, currentMonth, -n)); for (const c in g) avg[c] = (avg[c] || 0) + g[c] / 3; });
  const cats = Object.keys(avg).filter(c => expCats().some(x => x.value === c));
  if (!cats.length) return toast('Ainda não há histórico nos 3 meses anteriores para sugerir.');
  await mutateCloudState(s => { s.budgets = s.budgets || {}; cats.forEach(c => s.budgets[c] = Math.ceil(avg[c] * 1.05 / 10) * 10); });
  toast(`Limites sugeridos para ${cats.length} categorias (média de 3 meses + 5%)`);
}
function renderBudgetAlert() {
  const b = state.budgets || {}, sp = monthSpent(getMonthKey(currentYear, currentMonth));
  const hot = expCats().filter(c => b[c.value] && (sp[c.value] || 0) / b[c.value] >= 0.8)
    .map(c => ({ c, p: (sp[c.value] || 0) / b[c.value] * 100 })).sort((a, z) => z.p - a.p).slice(0, 4);
  $('budget-alert').innerHTML = hot.length ? `<div class="glass-card p-4 no-lift cursor-pointer" style="border-color:rgba(251,191,36,.35)" onclick="showView(3)">
    <div class="text-xs font-bold text-amber-300 mb-2">⚠️ Atenção ao orçamento deste mês</div>
    <div class="flex flex-wrap gap-2">${hot.map(h => `<span class="text-[11px] px-2.5 py-1 rounded-full" style="background:${pcol(h.p)}22;color:${pcol(h.p)}">${escapeHtml(h.c.label)} • ${h.p.toFixed(0)}%</span>`).join('')}</div></div>` : '';
}

/* ---------- Patrimônio, carteiras e metas ---------- */
const paidInv = () => state.transactions.filter(t => t.type === 'investment' && t.status === 'paid');
const walletBal = w => (w.balance || 0) + paidInv().filter(t => t.walletId === w.id).reduce((s, t) => s + t.amount, 0);
const unallocated = () => { const ids = new Set((state.wallets || []).map(w => w.id)); return paidInv().filter(t => !ids.has(t.walletId)).reduce((s, t) => s + t.amount, 0); };

function walletForm(id) {
  const w = (state.wallets || []).find(x => x.id === id);
  const aportes = w ? walletBal(w) - (w.balance || 0) : 0;
  openForm(w ? 'Editar carteira' : 'Nova carteira', [
    { k: 'name', label: 'Nome (ex: Reserva de emergência)', value: w?.name || '' },
    { k: 'bal', label: 'Saldo atual (R$)', type: 'number', value: w ? walletBal(w) : 0 },
    { k: 'rate', label: 'Rendimento em % ao ano (ex: 100% do CDI ≈ 14)', type: 'number', value: w?.rate ?? 0 }
  ], async d => {
    const name = d.name.trim(), bal = parseFloat(d.bal) || 0, rate = Math.max(0, parseFloat(d.rate) || 0);
    await mutateCloudState(s => {
      s.wallets = s.wallets || [];
      if (w) { const x = s.wallets.find(y => y.id === w.id); if (x) Object.assign(x, { name, rate, balance: bal - aportes }); }
      else s.wallets.push({ id: uid(), name, balance: bal, rate });
    });
  });
}
async function deleteWallet(id) {
  const w = state.wallets.find(x => x.id === id);
  if (!w) return;
  await mutateCloudState(s => { s.wallets = s.wallets.filter(x => x.id !== id); });
  toast(`Carteira “${escapeHtml(w.name)}” removida`, 'Desfazer', () => mutateCloudState(s => { s.wallets.push(w); }));
}
function aporteForm(wid) {
  const W = state.wallets || [];
  openForm('Novo aporte', [
    { k: 'w', label: 'Carteira', value: wid ?? W[0]?.id ?? '', options: W.length ? W.map(w => [w.id, w.name]) : [['', 'Sem carteira']] },
    { k: 'amount', label: 'Valor (R$)', type: 'number', value: '' },
    { k: 'desc', label: 'Descrição (opcional)', value: '', req: false }
  ], async d => {
    const amount = parseFloat(d.amount); if (!(amount > 0)) return;
    const w = W.find(x => String(x.id) === d.w);
    await mutateCloudState(s => s.transactions.push({
      id: uid(), monthKey: getMonthKey(currentYear, currentMonth), day: new Date().getDate(), desc: d.desc.trim() || `Aporte${w ? ' — ' + w.name : ''}`,
      notes: '', amount, category: 'Investimentos', type: 'investment', method: 'PIX/Débito', cardId: null, owner: 'joint', status: 'paid', walletId: w ? w.id : null
    }));
    toast('Aporte registrado e abatido do saldo livre');
  }, 'Registrar aporte');
}
function goalForm(id) {
  const g = (state.goals || []).find(x => x.id === id), W = state.wallets || [];
  openForm(g ? 'Editar meta' : 'Nova meta', [
    { k: 'name', label: 'Nome da meta (ex: Viagem, Entrada do apê)', value: g?.name || '' },
    { k: 'target', label: 'Valor alvo (R$)', type: 'number', value: g?.target || '' },
    { k: 'deadline', label: 'Prazo', type: 'month', value: g?.deadline || addMonthsToYearMonth(new Date().getFullYear(), new Date().getMonth(), 12) },
    { k: 'wallet', label: 'Acompanhar qual carteira?', value: g?.walletId ?? '', options: [['', 'Patrimônio total'], ...W.map(w => [w.id, w.name])] },
    { k: 'auto', label: 'Aporte mensal automático (R$, 0 = desligado)', type: 'number', value: g ? ((state.recurring || []).find(r => r.goalId === g.id)?.amount || 0) : 0, req: false }
  ], async d => {
    const o = { name: d.name.trim(), target: parseFloat(d.target) || 0, deadline: d.deadline, walletId: d.wallet ? Number(d.wallet) : null };
    const gid = g ? g.id : uid(), auto = Math.max(0, parseFloat(d.auto) || 0), n = new Date();
    await mutateCloudState(s => {
      s.goals = s.goals || [];
      if (g) { const x = s.goals.find(y => y.id === g.id); if (x) Object.assign(x, o); } else s.goals.push({ id: gid, ...o });
      s.recurring = (s.recurring || []).filter(r => r.goalId !== gid);
      if (auto > 0) s.recurring.push({ id: uid(), goalId: gid, walletId: o.walletId, desc: `Aporte — ${o.name}`, notes: '', amount: auto, day: 5, category: 'Investimentos', type: 'investment', method: 'PIX/Débito', cardId: null, owner: 'joint', start: getMonthKey(n.getFullYear(), n.getMonth()), skipped: [] });
    });
    if (auto > 0) toast('Aporte automático criado: confirme como “Pago” quando fizer o depósito.');
  });
}
async function deleteGoal(id) {
  const g = state.goals.find(x => x.id === id);
  if (!g) return;
  await mutateCloudState(s => { s.goals = s.goals.filter(x => x.id !== id); s.recurring = (s.recurring || []).filter(r => r.goalId !== id); });
  toast(`Meta “${escapeHtml(g.name)}” removida`, 'Desfazer', () => mutateCloudState(s => { s.goals.push(g); }));
}

function renderWealth() {
  const el = $('view-wealth');
  if (el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const W = state.wallets || [], G = state.goals || [], now = new Date();
  const bal = W.map(walletBal), un = unallocated(), wsum = bal.reduce((a, b) => a + b, 0), total = wsum + un;
  const mRate = w => Math.pow(1 + (w.rate || 0) / 100, 1 / 12) - 1;
  const yieldM = W.reduce((s, w, i) => s + bal[i] * mRate(w), 0);
  const wr = wsum > 0 ? W.reduce((s, w, i) => s + bal[i] * (w.rate || 0), 0) / wsum : 0, rm = Math.pow(1 + wr / 100, 1 / 12) - 1;
  const off = n => addMonthsToYearMonth(now.getFullYear(), now.getMonth(), n);
  const invBy = mk => paidInv().filter(t => t.monthKey === mk).reduce((s, t) => s + t.amount, 0);
  const avg = [0, -1, -2].reduce((s, n) => s + invBy(off(n)), 0) / 3;
  const viewed = invBy(getMonthKey(currentYear, currentMonth));
  const baseSum = W.reduce((s, w) => s + (w.balance || 0), 0);
  const cum = mk => baseSum + paidInv().filter(t => t.monthKey <= mk).reduce((s, t) => s + t.amount, 0);
  let v = total; const proj = []; for (let n = 1; n <= 12; n++) { v = v * (1 + rm) + avg; proj.push(v); }
  const lbl = n => { const k = off(n).split('-'); return `${MONTH_SHORT[k[1] - 1]}/${k[0].slice(2)}`; };
  const labels = [], hist = [], pr = [];
  for (let n = -5; n <= 12; n++) { labels.push(lbl(n)); hist.push(n < 0 ? cum(off(n)) : n === 0 ? total : null); pr.push(n < 0 ? null : n === 0 ? total : proj[n - 1]); }
  const chip = (l, val, sub, c) => `<div class="ins"><small>${l}</small><b style="color:${c}">${val}</b><span>${sub}</span></div>`;
  const goalsHtml = G.length ? G.map(g => {
    const w = W.find(x => x.id === g.walletId), cur = w ? walletBal(w) : total, p = g.target > 0 ? Math.min(100, cur / g.target * 100) : 0;
    const [dy, dm] = (g.deadline || '').split('-').map(Number), left = dy ? Math.max(1, dy * 12 + dm - (now.getFullYear() * 12 + now.getMonth() + 1)) : 1;
    const need = Math.max(0, g.target - cur) / left;
    return `<div class="glass-card p-4 no-lift"><div class="flex justify-between items-start gap-2"><div><div class="font-semibold text-white">🎯 ${escapeHtml(g.name)}</div>
      <div class="text-[10px] text-slate-400">${w ? escapeHtml(w.name) : 'Patrimônio total'} • prazo ${dm ? MONTH_SHORT[dm - 1] + '/' + dy : '—'}</div></div>
      <div class="flex gap-1"><button type="button" class="ib" onclick="goalForm(${g.id})">✏️</button><button type="button" class="ib" onclick="deleteGoal(${g.id})">✕</button></div></div>
      <div class="w-full bg-slate-800/80 h-2.5 rounded-full overflow-hidden mt-3"><div class="h-full transition-all duration-700" style="width:${p}%;background:linear-gradient(90deg,#22d3ee,#a78bfa);box-shadow:0 0 12px rgba(34,211,238,.6)"></div></div>
      <div class="flex justify-between text-[11px] mt-2"><span class="text-slate-200">${formatBRL(cur)} de ${formatBRL(g.target)} (${p.toFixed(0)}%)</span>
      <span class="text-cyan-300">${cur >= g.target ? '✓ Meta atingida!' : `${formatBRL(need)}/mês`}</span></div></div>`;
  }).join('') : '<p class="text-xs text-slate-500">Nenhuma meta ainda. Crie uma para acompanhar o progresso e quanto aportar por mês.</p>';
  el.innerHTML = `<div class="glass-card p-5 sm:p-6 no-lift" style="background:linear-gradient(135deg,rgba(34,211,238,.14),rgba(139,92,246,.12) 55%,rgba(255,255,255,.02))">
      <div class="flex flex-wrap items-start justify-between gap-3"><div><div class="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Patrimônio do casal</div>
      <div class="text-4xl sm:text-5xl font-extrabold text-glow-blue mt-1">${formatBRL(total)}</div>
      <div class="text-xs text-slate-400 mt-1">Projeção em 12 meses: <strong class="text-violet-300">${formatBRL(proj[11])}</strong></div></div>
      <div class="flex gap-2 flex-wrap"><button type="button" onclick="aporteForm()" class="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white">＋ Aporte</button>
      <button type="button" onclick="walletForm()" class="px-4 py-2 text-xs font-bold rounded-xl border border-slate-600 text-slate-200">＋ Carteira</button>
      <button type="button" onclick="goalForm()" class="px-4 py-2 text-xs font-bold rounded-xl border border-slate-600 text-slate-200">＋ Meta</button></div></div></div>
    <div id="w-ins" class="grid grid-cols-2 lg:grid-cols-4 gap-3">${chip('Aportes em ' + MONTH_SHORT[currentMonth], formatBRL(viewed), 'neste mês', '#22d3ee')}${chip('Aporte médio', formatBRL(avg), 'últimos 3 meses', '#a78bfa')}${chip('Rendimento estimado', formatBRL(yieldM), 'por mês', '#34d399')}${chip('Taxa média', wr.toFixed(1) + '%', 'ao ano', '#fbbf24')}</div>
    <div class="glass-card p-4 sm:p-5 no-lift"><h3 class="text-sm font-semibold text-white mb-1">Evolução e projeção</h3><p class="text-[11px] text-slate-400 mb-3">Histórico dos aportes e projeção mantendo o aporte médio, com o rendimento das carteiras.</p><div class="relative h-60"><canvas id="wealthChart"></canvas></div></div>
    <div><h3 class="text-sm font-semibold text-white mb-2">Carteiras</h3><div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">${W.map((w, i) => `<div class="glass-card p-4 no-lift">
      <div class="flex justify-between items-start"><div><div class="text-[11px] font-semibold uppercase" style="color:${WPAL[i % 8]}">● ${escapeHtml(w.name)}</div><div class="text-xl font-extrabold mt-1">${formatBRL(bal[i])}</div></div>
      <div class="flex gap-1"><button type="button" class="ib" onclick="aporteForm(${w.id})">＋</button><button type="button" class="ib" onclick="walletForm(${w.id})">✏️</button><button type="button" class="ib" onclick="deleteWallet(${w.id})">✕</button></div></div>
      <div class="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden mt-3"><div class="h-full" style="width:${total ? bal[i] / total * 100 : 0}%;background:${WPAL[i % 8]}"></div></div>
      <div class="text-[11px] text-slate-400 mt-2">${w.rate || 0}% a.a. • rende ~${formatBRL(bal[i] * mRate(w))}/mês</div></div>`).join('')}
      ${un > 0 ? `<div class="glass-card p-4 no-lift"><div class="text-[11px] font-semibold uppercase text-slate-400">● Sem carteira</div><div class="text-xl font-extrabold mt-1">${formatBRL(un)}</div><div class="text-[11px] text-slate-400 mt-2">Aportes lançados sem escolher carteira.</div>${W.length ? '<button type="button" class="settle-btn" style="margin:8px 0 0" onclick="assignUnallocated()">Atribuir a uma carteira</button>' : ''}</div>` : ''}
      ${!W.length && !un ? '<p class="text-xs text-slate-500">Crie sua primeira carteira (ex: Reserva de emergência) com “＋ Carteira”.</p>' : ''}</div></div>
    <div><h3 class="text-sm font-semibold text-white mb-2">Metas</h3><div class="grid sm:grid-cols-2 gap-3">${goalsHtml}</div></div>`;
  if (wealthChartInstance) wealthChartInstance.destroy();
  wealthChartInstance = new Chart($('wealthChart').getContext('2d'), { type: 'line', data: { labels, datasets: [
    { label: 'Histórico', data: hist, borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,.15)', fill: true, tension: .35, borderWidth: 2.5, pointRadius: 3 },
    { label: 'Projeção', data: pr, borderColor: '#a78bfa', borderDash: [6, 5], tension: .35, borderWidth: 2.5, pointRadius: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, spanGaps: false,
      scales: { x: { ticks: { color: '#8b97b8', font: { size: 10 } }, grid: { display: false }, border: { display: false } }, y: { ticks: { color: '#64748b', font: { size: 10 }, callback: v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : v }, grid: { color: 'rgba(255,255,255,.05)' }, border: { display: false } } },
      plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 10 }, boxWidth: 8, usePointStyle: true } }, tooltip: { backgroundColor: 'rgba(6,9,24,.92)', borderColor: 'rgba(255,255,255,.14)', borderWidth: 1, padding: 12, cornerRadius: 14, callbacks: { label: c => ` ${c.dataset.label}: ${formatBRL(c.parsed.y)}` } } } } });
}

/* ---------- Gancho no renderAll + cache offline ---------- */
const __renderAll = renderAll;
renderAll = function () { __renderAll(); try { renderBudget(); renderBudgetAlert(); renderWealth(); renderRecurring(); } catch (e) { console.error(e); } clearTimeout(window._recT); window._recT = setTimeout(ensureRecurring, 900); };
try { const c = localStorage.getItem('fc_cache'); if (c && hasValidCloudConfig()) state = normalizeState(JSON.parse(c)); } catch (e) {}
window.addEventListener('offline', () => toast('Sem internet: você está vendo a última versão salva.'));
window.addEventListener('online', () => { toast('Conexão restabelecida'); if (hasValidCloudConfig()) pullFromCloud(false); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
renderAll();
