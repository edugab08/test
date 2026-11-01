// ===== Extras 2: privacidade, acerto de contas, importação com prévia, filtros, lembretes, comparativo =====
const sumBy = (arr, f) => arr.reduce((s, t) => s + (f ? f(t) : t.amount), 0);
const _fmt0 = formatBRL;
let PRIV = localStorage.getItem('fc_priv') === '1';
formatBRL = function (v) { return PRIV ? 'R$ ••••' : _fmt0(v); };

/* ---------- Métricas do mês (mesma regra do app.js) ---------- */
function monthMetrics(y, m) {
  const mk = getMonthKey(y, m), T = state.transactions.filter(t => t.monthKey === mk);
  const inc = o => sumBy(T.filter(t => t.type === 'income' && t.owner === o));
  const sal1 = (state.salariesP1[mk] || 0) + inc('p1') + inc('joint') / 2, sal2 = (state.salariesP2[mk] || 0) + inc('p2') + inc('joint') / 2;
  const out = T.filter(t => t.type !== 'income'), exp = sumBy(out.filter(t => t.type !== 'investment')), inv = sumBy(out.filter(t => t.type === 'investment'));
  let prev = 0; const cur = new Date(y, m);
  Object.keys(state.salariesP1 || {}).forEach(k => { const [a, b] = k.split('-').map(Number); if (new Date(a, b - 1) < cur) prev += (state.salariesP1[k] || 0) + (state.salariesP2[k] || 0); });
  state.transactions.forEach(t => { const [a, b] = t.monthKey.split('-').map(Number); if (new Date(a, b - 1) < cur) prev += t.type === 'income' ? t.amount : -t.amount; });
  const net = sal1 + sal2 - exp - inv;
  return { mk, T, out, sal1, sal2, income: sal1 + sal2, exp, inv, prev, net, total: net + prev };
}

/* ---------- Modo privacidade ---------- */
(function () {
  const b = document.createElement('button');
  b.id = 'priv-btn'; b.type = 'button'; b.className = 'px-3 py-2 rounded-xl border border-slate-700 text-slate-200';
  const paint = () => { b.innerHTML = svgIcon(PRIV ? 'eyeoff' : 'eye', 16); b.setAttribute('aria-label', PRIV ? 'Mostrar valores' : 'Ocultar valores'); b.title = b.getAttribute('aria-label'); };
  b.onclick = () => { PRIV = !PRIV; localStorage.setItem('fc_priv', PRIV ? '1' : '0'); paint(); renderAll(); };
  paint(); $('tools').before(b);
})();

/* ---------- Acerto de contas com histórico ---------- */
function settleCalc() {
  const mk = getMonthKey(currentYear, currentMonth), M = monthMetrics(currentYear, currentMonth);
  const j = M.out.filter(t => ['joint', 'p1', 'p2'].includes(t.owner));
  const a = sumBy(j.filter(t => t.owner === 'p1')), b = sumBy(j.filter(t => t.owner === 'p2'));
  const share = state.splitMode === 'prop' && M.income > 0 ? M.sal1 / M.income : 0.5;
  const S = (state.settlements || []).filter(x => x.monthKey === mk);
  let net = a - (a + b) * share; S.forEach(x => { net += x.from === 'p1' ? x.amount : -x.amount; });
  return { mk, a, b, net, S };
}
function renderSettlement() {
  const { a, b, net, S } = settleCalc(), el = $('settlement-badge'), p1 = cloudCfg.p1Name || 'Eduardo', p2 = cloudCfg.p2Name || 'Namorada';
  if (!(a > 0 || b > 0) && !S.length) return;
  window._settleNet = net;
  el.innerHTML = Math.abs(net) < 1
    ? (S.length ? '✨ Tudo acertado neste mês' : '✨ Contas pagas equilibradas!')
    : `🔄 Acerto: ${escapeHtml(net > 0 ? p2 : p1)} transfere ${formatBRL(Math.abs(net))} para ${escapeHtml(net > 0 ? p1 : p2)} <button type="button" class="settle-btn" onclick="settleUp()">Acertamos</button>`;
}
function settleUp() {
  const net = window._settleNet || 0, p1 = cloudCfg.p1Name || 'Eduardo', p2 = cloudCfg.p2Name || 'Namorada';
  if (Math.abs(net) < 0.01) return;
  const from = net > 0 ? 'p2' : 'p1';
  openForm('Registrar acerto', [
    { k: 'amount', label: `Valor que ${from === 'p1' ? p1 : p2} transferiu para ${from === 'p1' ? p2 : p1} (R$)`, type: 'number', value: Math.abs(net).toFixed(2) },
    { k: 'note', label: 'Observação (opcional)', value: '', req: false }
  ], async d => {
    const amount = Math.round((parseFloat(d.amount) || 0) * 100) / 100; if (amount <= 0) return;
    await mutateCloudState(s => { s.settlements = s.settlements || []; s.settlements.push({ id: uid(), monthKey: getMonthKey(currentYear, currentMonth), from, to: from === 'p1' ? 'p2' : 'p1', amount, note: d.note.trim(), date: new Date().toISOString().slice(0, 10) }); });
    toast('Acerto registrado');
  }, 'Registrar acerto');
}
async function deleteSettlement(id) {
  const x = state.settlements.find(s => s.id === id); if (!x) return;
  await mutateCloudState(s => { s.settlements = s.settlements.filter(y => y.id !== id); });
  toast('Acerto removido', 'Desfazer', () => mutateCloudState(s => { s.settlements.push(x); }));
}
function renderSettleCard() {
  const S = (state.settlements || []).filter(x => x.monthKey === getMonthKey(currentYear, currentMonth)), p = { p1: cloudCfg.p1Name || 'Eduardo', p2: cloudCfg.p2Name || 'Namorada' };
  $('settle-card').innerHTML = S.length ? `<h3 class="text-sm font-semibold text-white mb-2">🔄 Acertos de ${MONTH_NAMES[currentMonth]}</h3>` + S.sort((a, b) => b.date.localeCompare(a.date)).map(x => `<div class="flex items-center justify-between py-2 border-b border-slate-800/60 text-xs">
    <div><div class="text-slate-200">${escapeHtml(p[x.from])} ➔ ${escapeHtml(p[x.to])}</div><div class="text-[10px] text-slate-400">${x.date.split('-').reverse().join('/')}${x.note ? ' • ' + escapeHtml(x.note) : ''}</div></div>
    <div class="flex items-center gap-3"><strong>${formatBRL(x.amount)}</strong><button type="button" class="ib" aria-label="Remover acerto" onclick="deleteSettlement(${x.id})">✕</button></div></div>`).join('') : '';
  $('settle-card').className = S.length ? 'glass-card p-4 no-lift' : 'hidden';
}

/* ---------- Importação de extrato com prévia ---------- */
function parseCSVLine(line, d) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === d && !q) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim()); return out;
}
const normDesc = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 14);
function handleBankCSVImport(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.split(/\r?\n/).filter(l => l.trim()); event.target.value = '';
    if (lines.length < 2) return toast('Arquivo vazio ou sem linhas de dados.');
    const delim = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i], delim); if (cols.length < 2) continue;
      let day = 10, mk = getMonthKey(currentYear, currentMonth), amount = null; const parts = [];
      cols.forEach(col => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(col)) { const p = col.split('-'); mk = `${p[0]}-${p[1]}`; day = +p[2]; }
        else if (/^\d{2}\/\d{2}\/\d{4}$/.test(col)) { const p = col.split('/'); day = +p[0]; mk = `${p[2]}-${p[1]}`; }
        else if (/^-?\d{1,3}(\.\d{3})+,\d{2}$/.test(col)) amount = parseFloat(col.replace(/\./g, '').replace(',', '.'));
        else if (/^-?\d+(\.\d{1,2}|,\d{1,2})$/.test(col)) amount = parseFloat(col.replace(',', '.'));
        else if (col.length > 2) parts.push(col);
      });
      if (amount === null || isNaN(amount) || amount === 0) continue;
      const desc = parts[0] || 'Item importado', notes = parts.slice(1).join(' • '), inf = inferCategory(desc + ' ' + notes);
      const amt = Math.round(Math.abs(amount) * 100) / 100;
      const dup = state.transactions.some(t => t.monthKey === mk && Math.abs(t.amount - amt) < 0.01 && t.day === day && normDesc(t.desc) === normDesc(desc));
      rows.push({ day, mk, desc, notes, amount: amt, category: inf.category, type: inf.type, dup });
    }
    if (!rows.length) return toast('Nenhuma linha válida encontrada (precisa de data, descrição e valor).');
    openImportPreview(rows);
  };
  reader.readAsText(file, 'UTF-8');
}
function openImportPreview(rows) {
  let m = $('imp');
  if (!m) { m = document.createElement('div'); m.id = 'imp'; m.className = 'fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3'; m.style.zIndex = 60; document.body.appendChild(m); }
  const opt = (arr, sel) => arr.map(o => `<option value="${escapeHtml(o[0])}" ${o[0] === sel ? 'selected' : ''}>${escapeHtml(o[1])}</option>`).join('');
  const cards = (state.cards || []).map(c => [c.id, c.name]);
  m.innerHTML = `<div class="glass-card max-w-3xl w-full max-h-[90vh] flex flex-col p-5 no-lift"><div class="flex justify-between items-center mb-3"><h2 class="text-lg font-bold text-white">Conferir importação</h2><button type="button" data-x class="text-slate-400" aria-label="Fechar">✕</button></div>
    <div class="flex flex-wrap gap-2 mb-3 text-xs"><select id="imp-method" class="px-2.5 py-2 rounded-lg border"><option value="Cartão de Crédito">Cartão de crédito</option><option value="PIX/Débito">PIX/Débito</option></select>
    <select id="imp-card" class="px-2.5 py-2 rounded-lg border">${opt(cards.map(c => [String(c[0]), c[1]]), '')}</select>
    <select id="imp-status" class="px-2.5 py-2 rounded-lg border"><option value="pending">Pendente</option><option value="paid">Já pago</option></select>
    <button type="button" id="imp-all" class="px-3 py-2 rounded-lg border border-slate-600 text-slate-200">Marcar/desmarcar todos</button></div>
    <div id="imp-sum" class="text-[11px] text-slate-400 mb-2"></div>
    <div class="overflow-auto flex-1 border border-slate-800 rounded-xl"><table class="w-full text-xs"><tbody>${rows.map((r, i) => `<tr class="${r.dup ? 'opacity-60' : ''}"><td class="p-2"><input type="checkbox" data-i="${i}" ${r.dup ? '' : 'checked'} aria-label="Incluir"></td>
      <td class="p-2 font-mono text-slate-400 whitespace-nowrap">${String(r.day).padStart(2, '0')}/${r.mk.split('-')[1]}</td>
      <td class="p-2"><input data-d="${i}" value="${escapeHtml(r.desc)}" class="w-full px-2 py-1 rounded border">${r.dup ? '<div class="text-[10px] text-amber-300 mt-0.5">Parece duplicado</div>' : ''}</td>
      <td class="p-2"><select data-c="${i}" class="px-1.5 py-1 rounded border">${opt(CATEGORIES_LIST.map(c => [c.value, c.label]), r.category)}</select></td>
      <td class="p-2 text-right font-semibold whitespace-nowrap">${formatBRL(r.amount)}</td></tr>`).join('')}</tbody></table></div>
    <button type="button" id="imp-ok" class="w-full mt-3 py-3 bg-blue-600 text-white rounded-xl font-bold"></button></div>`;
  m.classList.remove('hidden');
  const close = () => m.classList.add('hidden'), boxes = () => [...m.querySelectorAll('[data-i]')];
  const upd = () => { const n = boxes().filter(b => b.checked).length; $('imp-sum').textContent = `${rows.length} linhas • ${rows.filter(r => r.dup).length} possíveis duplicadas (desmarcadas)`; $('imp-ok').textContent = `Importar ${n} lançamento${n === 1 ? '' : 's'}`; $('imp-ok').disabled = !n; $('imp-card').style.display = $('imp-method').value === 'Cartão de Crédito' ? '' : 'none'; };
  m.addEventListener('change', upd); upd();
  m.querySelector('[data-x]').onclick = close;
  $('imp-all').onclick = () => { const all = boxes().every(b => b.checked); boxes().forEach(b => b.checked = !all); upd(); };
  $('imp-ok').onclick = async () => {
    const method = $('imp-method').value, cardId = Number($('imp-card').value) || null, status = $('imp-status').value, base = Date.now();
    const items = boxes().filter(b => b.checked).map(b => { const i = +b.dataset.i, r = rows[i]; return { id: base + i, monthKey: r.mk, day: r.day, desc: m.querySelector(`[data-d="${i}"]`).value.trim() || r.desc, notes: r.notes, amount: r.amount, category: m.querySelector(`[data-c="${i}"]`).value, type: (CATEGORIES_LIST.find(c => c.value === m.querySelector(`[data-c="${i}"]`).value)?.value === 'Investimentos') ? 'investment' : r.type, method, cardId: method === 'Cartão de Crédito' ? cardId : null, owner: 'joint', status }; });
    close();
    await mutateCloudState(s => { const key = t => `${t.monthKey}|${t.day}|${t.amount.toFixed(2)}|${normDesc(t.desc)}`; const have = new Set(s.transactions.map(key)); items.forEach(t => { if (!have.has(key(t))) s.transactions.push(t); }); });
    toast(`${items.length} lançamento(s) importado(s)`);
  };
}

/* ---------- Filtros extras + resumo da lista ---------- */
(function () {
  const row = $('filter-owner').parentNode, mk = (id, html) => { const s = document.createElement('select'); s.id = id; s.className = 'px-2.5 py-1.5 rounded-lg border text-xs'; s.setAttribute('onchange', 'renderAll()'); s.innerHTML = html; row.appendChild(s); };
  mk('filter-cat', '<option value="">Todas as categorias</option>' + CATEGORIES_LIST.map(c => `<option value="${escapeHtml(c.value)}">${escapeHtml(c.label)}</option>`).join(''));
  mk('filter-status', '<option value="">Qualquer status</option><option value="paid">Pagos</option><option value="pending">Pendentes</option>');
  mk('filter-period', '<option value="">Mês todo</option><option value="1">Dias 1–10</option><option value="2">Dias 11–20</option><option value="3">Dias 21–31</option>');
  const ft = document.createElement('div'); ft.id = 'filter-total'; ft.className = 'text-[11px] text-slate-400 mb-2'; $('tx-table-body').closest('table').parentNode.before(ft);
})();
const __renderTable = renderTable;
renderTable = function (mTxs, p1, p2) {
  const cat = $('filter-cat').value, st = $('filter-status').value, per = $('filter-period').value;
  __renderTable(mTxs.filter(t => (!cat || t.category === cat) && (!st || t.status === st) && (!per || (per === '1' ? t.day <= 10 : per === '2' ? t.day > 10 && t.day <= 20 : t.day > 20))), p1, p2);
  const ids = new Set([...document.querySelectorAll('#tx-table-body tr[data-id]')].map(r => +r.dataset.id)), L = state.transactions.filter(t => ids.has(t.id));
  $('filter-total').textContent = L.length ? `${L.length} itens • entradas ${formatBRL(sumBy(L.filter(t => t.type === 'income')))} • saídas ${formatBRL(sumBy(L.filter(t => t.type !== 'income')))}` : '';
};

/* ---------- Deslizar para editar (→) ou excluir (←) ---------- */
(function () {
  const tb = $('tx-table-body'); let sx, sy, row, dx, lock;
  tb.addEventListener('touchstart', e => { row = e.target.closest('tr[data-id]'); if (!row || e.target.closest('button')) { row = null; return; } sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; lock = null; }, { passive: true });
  tb.addEventListener('touchmove', e => {
    if (!row) return; dx = e.touches[0].clientX - sx; const dy = e.touches[0].clientY - sy;
    if (lock === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) lock = Math.abs(dx) > Math.abs(dy) * 1.5;
    if (lock) { row.style.transition = 'none'; row.style.transform = `translateX(${Math.max(-120, Math.min(120, dx))}px)`; row.dataset.sw = dx < 0 ? 'del' : 'edit'; }
  }, { passive: true });
  tb.addEventListener('touchend', () => {
    if (!row) return; const id = +row.dataset.id; row.style.transition = 'transform .3s'; row.style.transform = ''; delete row.dataset.sw;
    if (lock && Math.abs(dx) > 90) { dx < 0 ? deleteTransaction(id) : openEditModal(id); } row = null;
  }, { passive: true });
})();

/* ---------- Botão flutuante "+" ---------- */
(function () {
  const f = document.createElement('button'); f.id = 'fab'; f.type = 'button'; f.setAttribute('aria-label', 'Novo lançamento'); f.innerHTML = svgIcon('plus', 26);
  f.onclick = () => openForm('Lançamento rápido', [{ k: 't', label: "Ex: 'mercado 120' · 'tênis 300 3x cartao' · 'salario 3000'", value: '' }], async d => {
    $('smart-input').value = d.t; await handleSmartAdd({ preventDefault() {} });
  }, 'Lançar');
  document.body.appendChild(f);
})();

/* ---------- Lembretes de vencimento ---------- */
(function () { const r = document.createElement('div'); r.id = 'reminders'; $('budget-alert').after(r); const s = document.createElement('div'); s.id = 'settle-card'; s.className = 'hidden'; s.style.order = 4; $('view-home').appendChild(s); })();
function renderReminders() {
  const n = new Date(), mk = getMonthKey(n.getFullYear(), n.getMonth()), today = n.getDate(), items = [];
  const when = d => d < 0 ? `atrasada há ${-d} d` : d === 0 ? 'vence hoje' : `vence em ${d} d`;
  (state.cards || []).forEach(c => {
    const pend = sumBy(state.transactions.filter(t => t.method === 'Cartão de Crédito' && t.monthKey === mk && t.status === 'pending' && (t.cardId === c.id || (!t.cardId && state.cards[0]?.id === c.id))));
    const d = (c.dueDay || 10) - today; if (pend > 0 && d <= 5) items.push({ u: d, ic: 'card', t: `Fatura ${c.name}: ${formatBRL(pend)} ${when(d)}` });
  });
  state.transactions.filter(t => t.monthKey === mk && t.type !== 'income' && t.type !== 'investment' && t.status === 'pending' && t.method !== 'Cartão de Crédito' && (t.day || 1) - today <= 3)
    .forEach(t => { const d = (t.day || 1) - today; items.push({ u: d, ic: 'calendar', t: `${t.desc}: ${formatBRL(t.amount)} ${when(d)}` }); });
  const lb = +localStorage.getItem('fc_last_backup') || 0, bd = lb ? Math.floor((Date.now() - lb) / 864e5) : null;
  if (state.transactions.length >= 10 && (bd === null || bd >= 30)) items.push({ u: 99, ic: 'save', t: bd === null ? 'Você ainda não fez backup. Baixe um em Ferramentas.' : `Último backup há ${bd} dias.` });
  items.sort((a, b) => a.u - b.u);
  const canAsk = 'Notification' in window && Notification.permission === 'default';
  $('reminders').innerHTML = items.length ? `<div class="glass-card p-4 no-lift" style="border-color:rgba(34,211,238,.28)"><div class="flex items-center justify-between mb-2"><div class="text-xs font-bold text-cyan-300">🔔 Lembretes</div>${canAsk ? '<button type="button" class="text-[11px] text-slate-300 underline" onclick="Notification.requestPermission().then(renderReminders)">Avisar ao abrir o app</button>' : ''}</div>
    ${items.slice(0, 5).map(i => `<div class="flex items-center gap-2 text-xs py-1 ${i.u < 0 ? 'text-rose-300' : 'text-slate-200'}">${svgIcon(i.ic, 14)}<span>${escapeHtml(i.t)}</span></div>`).join('')}${items.length > 5 ? `<div class="text-[10px] text-slate-400 mt-1">e mais ${items.length - 5}</div>` : ''}</div>` : '';
  if (items.length && 'Notification' in window && Notification.permission === 'granted' && localStorage.getItem('fc_notif_day') !== mk + today) {
    localStorage.setItem('fc_notif_day', mk + today); try { new Notification('Finanças a Dois', { body: items[0].t + (items.length > 1 ? ` e mais ${items.length - 1}` : '') }); } catch (e) {}
  }
}

/* ---------- Comparativo com o mês anterior, previsão e resumo ---------- */
(function () { const c = document.createElement('div'); c.id = 'compare-card'; c.className = 'glass-card p-4 sm:p-5'; $('view-stats').appendChild(c); })();
function renderCompare() {
  const M = monthMetrics(currentYear, currentMonth), pk = addMonthsToYearMonth(currentYear, currentMonth, -1), g = monthSpent(M.mk), pg = monthSpent(pk);
  const cats = [...new Set([...Object.keys(g), ...Object.keys(pg)])].sort((a, b) => Math.max(g[b] || 0, pg[b] || 0) - Math.max(g[a] || 0, pg[a] || 0)).slice(0, 6);
  const n = new Date(), real = n.getFullYear() === currentYear && n.getMonth() === currentMonth, dim = new Date(currentYear, currentMonth + 1, 0).getDate(), left = dim - n.getDate();
  const varPaid = sumBy(M.T.filter(t => t.type === 'expense_variable' && t.status === 'paid')), daily = real && n.getDate() > 0 ? varPaid / n.getDate() : 0, forecast = M.total - daily * left;
  $('compare-card').innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2 mb-3"><h3 class="text-base font-semibold text-white">Comparativo com ${MONTH_NAMES[+pk.split('-')[1] - 1]}</h3>
    <button type="button" onclick="shareSummary()" class="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-600 text-slate-200 flex items-center gap-1.5">${svgIcon('share', 14)} Compartilhar resumo</button></div>
    <div class="grid lg:grid-cols-2 gap-5"><div>${cats.length ? cats.map(c => { const a = g[c] || 0, b = pg[c] || 0, d = b > 0 ? (a - b) / b * 100 : null; return `<div class="flex items-center justify-between py-2 border-b border-slate-800/60 text-xs"><span class="flex items-center gap-2 text-slate-200"><i class="cdot" style="background:${catColor(c)}"></i>${escapeHtml(catLabel(c))}</span><span class="flex items-center gap-3"><span class="text-slate-400">${formatBRL(b)} ➔ <strong class="text-white">${formatBRL(a)}</strong></span><b style="color:${d === null ? '#94a3b8' : d > 5 ? '#fb7185' : d < -5 ? '#34d399' : '#94a3b8'};min-width:46px;text-align:right">${d === null ? 'novo' : (d > 0 ? '+' : '') + d.toFixed(0) + '%'}</b></span></div>`; }).join('') : '<p class="text-xs text-slate-500">Sem gastos para comparar.</p>'}</div>
    <div class="ins" style="align-self:start"><small>Previsão de saldo no fim do mês</small>${real ? `<b style="color:${forecast >= 0 ? '#34d399' : '#fb7185'}">${formatBRL(forecast)}</b><span>Se os gastos variáveis seguirem a média de ${formatBRL(daily)}/dia pelos próximos ${left} dias.</span>` : `<b>${formatBRL(M.total)}</b><span>Saldo final deste mês (a previsão só vale para o mês atual).</span>`}</div></div>`;
}
async function shareSummary() {
  const M = monthMetrics(currentYear, currentMonth), g = Object.entries(monthSpent(M.mk)).sort((a, b) => b[1] - a[1]).slice(0, 3), s = settleCalc(), p1 = cloudCfg.p1Name || 'Eduardo', p2 = cloudCfg.p2Name || 'Namorada';
  const text = [`Resumo de ${MONTH_NAMES[currentMonth]}/${currentYear} • Finanças a Dois`, `Renda: ${_fmt0(M.income)}`, `Saídas: ${_fmt0(M.exp)}`, `Investido: ${_fmt0(M.inv)}`, `Sobrou no mês: ${_fmt0(M.net)}`, g.length ? 'Maiores gastos: ' + g.map(x => `${catLabel(x[0])} (${_fmt0(x[1])})`).join(', ') : '', Math.abs(s.net) >= 1 ? `Acerto pendente: ${s.net > 0 ? p2 : p1} transfere ${_fmt0(Math.abs(s.net))} para ${s.net > 0 ? p1 : p2}` : ''].filter(Boolean).join('\n');
  try { if (navigator.share) { await navigator.share({ text }); return; } await navigator.clipboard.writeText(text); toast('Resumo copiado. É só colar na conversa.'); } catch (e) { if (e.name !== 'AbortError') toast('Não foi possível compartilhar neste aparelho.'); }
}

/* ---------- Acessibilidade ---------- */
function a11y() {
  document.querySelectorAll('button[title]:not([aria-label])').forEach(b => b.setAttribute('aria-label', b.title));
  document.querySelectorAll('[id$="-modal"],#fm,#imp').forEach(m => { m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); });
  const t = $('toast'); if (t) { t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); }
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.fixed.inset-0:not(.hidden)').forEach(m => m.classList.add('hidden'));
  const t = $('tools'); if (t) t.open = false;
});

/* ---------- Gancho no renderAll + esqueleto de carregamento ---------- */
const __renderAll2 = renderAll;
renderAll = function () {
  __renderAll2();
  try { renderSettlement(); renderSettleCard(); renderReminders(); renderCompare(); a11y(); } catch (e) { console.error(e); }
};
if (hasValidCloudConfig() && !localStorage.getItem('fc_cache')) { document.body.classList.add('loading'); setTimeout(() => document.body.classList.remove('loading'), 8000); }
renderAll();
