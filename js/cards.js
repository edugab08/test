// Soma todas as parcelas pendentes do cartão (limite real do banco)
function getCardUsedLimit(cardId) {
  return state.transactions
    .filter(t => t.method === 'Cartão de Crédito' && t.status === 'pending' && (t.cardId === cardId || (!t.cardId && state.cards[0]?.id === cardId)))
    .reduce((sum, t) => sum + t.amount, 0);
}

function cardInvoice(cardId, mk) {
  return state.transactions
    .filter(t => t.method === 'Cartão de Crédito' && t.monthKey === mk && (t.cardId === cardId || (!t.cardId && state.cards[0]?.id === cardId)))
    .reduce((s, t) => s + t.amount, 0);
}

// Compra a partir do dia de fechamento cai na fatura seguinte
function autoInvoiceOffset(card) {
  const n = new Date();
  const real = n.getFullYear() === currentYear && n.getMonth() === currentMonth;
  return real ? (n.getDate() >= (card?.closingDay || 1) ? 1 : 0) : 1;
}

function openCardsModal() {
  renderCardsModalList();
  document.getElementById('cards-modal').classList.remove('hidden');
}
function closeCardsModal() { document.getElementById('cards-modal').classList.add('hidden'); }

function renderCardsModalList() {
  const box = document.getElementById('cards-list-container');
  const cards = state.cards || [];
  const mk = getMonthKey(currentYear, currentMonth);
  if (!cards.length) { box.innerHTML = '<p class="text-xs text-slate-500">Nenhum cartão cadastrado.</p>'; return; }
  box.innerHTML = cards.map(c => {
    const used = getCardUsedLimit(c.id), avail = Math.max(0, c.limit - used);
    const pct = c.limit > 0 ? Math.min(100, used / c.limit * 100) : 0;
    const inv = cardInvoice(c.id, mk);
    return `
    <div class="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-700/60 space-y-2.5">
      <div class="flex items-start justify-between gap-2">
        <div>
          <div class="font-bold text-sm text-white">💳 ${escapeHtml(c.name)}</div>
          <div class="text-[10px] text-slate-400">Fecha dia ${c.closingDay || 1}${c.closingDay == null ? ' <span class="text-amber-300">(confira)</span>' : ''} • Vence dia ${c.dueDay || 10}</div>
        </div>
        <div class="flex gap-1.5">
          <button type="button" onclick="editCard(${c.id})" class="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200">✏️ Editar</button>
          <button type="button" onclick="deleteCard(${c.id})" class="text-[11px] px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 text-rose-300">Excluir</button>
        </div>
      </div>
      <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden"><div class="${pct > 85 ? 'bg-rose-500' : 'bg-cyan-400'} h-full transition-all" style="width:${pct}%"></div></div>
      <div class="flex justify-between text-[11px]">
        <span class="text-slate-400">Ocupado: <strong class="text-rose-300">${formatBRL(used)}</strong></span>
        <span class="text-slate-400">Disponível: <strong class="text-emerald-400">${formatBRL(avail)}</strong></span>
      </div>
      <div class="flex items-center justify-between text-[11px] bg-slate-950/40 rounded-xl px-3 py-2">
        <span class="text-slate-300">Fatura de ${MONTH_NAMES[currentMonth]}: <strong class="text-white">${formatBRL(inv)}</strong></span>
        ${inv > 0 ? `<button type="button" onclick="payCardInvoice(${c.id})" class="text-cyan-300 font-semibold">Quitar</button>` : ''}
      </div>
      <div class="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
        <span class="text-slate-400">Limite total:</span>
        <div class="flex items-center gap-1.5">
          <button type="button" onclick="bumpLimit(${c.id}, -500)" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px]">−500</button>
          <input type="number" step="100" value="${c.limit}" onchange="setLimit(${c.id}, this.value)" class="w-24 px-2 py-1 text-right rounded border text-xs font-semibold" />
          <button type="button" onclick="bumpLimit(${c.id}, 500)" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px]">+500</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// Limite: atualiza na hora (otimista) e grava na nuvem 0,6s após o último clique
const _limitTimers = {}, _limitVals = {};
function applyLimit(id, v) {
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  c.limit = v; _limitVals[id] = v;
  renderCardsModalList(); renderAll();
  clearTimeout(_limitTimers[id]);
  _limitTimers[id] = setTimeout(async () => {
    const val = _limitVals[id];
    await mutateCloudState(s => { const x = s.cards.find(y => y.id === id); if (x) x.limit = val; });
    renderCardsModalList();
  }, 600);
}
function bumpLimit(id, delta) {
  const c = state.cards.find(x => x.id === id);
  if (c) applyLimit(id, Math.max(0, (c.limit || 0) + delta));
}
function setLimit(id, val) { applyLimit(id, Math.max(0, parseFloat(val) || 0)); }

function cardFields(c = {}) {
  return [
    { k: 'name', label: 'Nome do cartão', value: c.name || '' },
    { k: 'limit', label: 'Limite total (R$)', type: 'number', value: c.limit ?? 1000 },
    { k: 'closingDay', label: 'Dia do fechamento da fatura', type: 'number', value: c.closingDay || 1 },
    { k: 'dueDay', label: 'Dia do vencimento', type: 'number', value: c.dueDay || 10 }
  ];
}
const clampDay = v => Math.min(31, Math.max(1, parseInt(v, 10) || 1));

function editCard(id) {
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  openForm('Editar cartão', cardFields(c), async d => {
    await mutateCloudState(s => {
      const x = s.cards.find(y => y.id === id);
      if (x) Object.assign(x, { name: d.name.trim() || x.name, limit: Math.max(0, parseFloat(d.limit) || 0), closingDay: clampDay(d.closingDay), dueDay: clampDay(d.dueDay) });
    });
    renderCardsModalList();
  });
}

async function handleAddNewCard(e) {
  e.preventDefault();
  const name = document.getElementById('new-card-name').value.trim();
  const limit = Math.max(0, parseFloat(document.getElementById('new-card-limit').value) || 0);
  const dueDay = clampDay(document.getElementById('new-card-due').value || 10);
  if (!name || limit <= 0) return;
  document.getElementById('new-card-name').value = '';
  document.getElementById('new-card-limit').value = '';
  await mutateCloudState(s => { s.cards.push({ id: Date.now(), name, limit, dueDay, closingDay: Math.max(1, dueDay - 7) }); });
  renderCardsModalList();
}

async function deleteCard(cardId) {
  const idx = state.cards.findIndex(x => x.id === cardId);
  const card = state.cards[idx];
  if (!card) return;
  await mutateCloudState(s => { s.cards = s.cards.filter(x => x.id !== cardId); });
  renderCardsModalList();
  toast(`Cartão “${escapeHtml(card.name)}” removido`, 'Desfazer', async () => {
    await mutateCloudState(s => { if (!s.cards.some(x => x.id === card.id)) s.cards.splice(Math.min(idx, s.cards.length), 0, card); });
    renderCardsModalList();
  });
}

async function payCardInvoice(cardId) {
  const mk = getMonthKey(currentYear, currentMonth);
  await mutateCloudState(s => {
    s.transactions.forEach(t => {
      if (t.monthKey === mk && t.method === 'Cartão de Crédito' && t.status === 'pending' && (t.cardId === cardId || (!t.cardId && s.cards[0]?.id === cardId))) t.status = 'paid';
    });
  });
  renderCardsModalList();
  toast('Fatura quitada');
}

async function payCurrentMonthCardInvoice() {
  const mk = getMonthKey(currentYear, currentMonth);
  await mutateCloudState(s => {
    s.transactions.forEach(t => { if (t.monthKey === mk && t.method === 'Cartão de Crédito' && t.status === 'pending') t.status = 'paid'; });
  });
}
