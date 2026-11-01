// 1. Lançamento Rápido Inteligente (1 linha)
async function handleSmartAdd(e) {
  e.preventDefault();
  if (!ensureConnected()) return;

  const raw = document.getElementById('smart-input').value.trim();
  const notes = document.getElementById('smart-notes').value.trim();
  const owner = document.getElementById('smart-owner').value;
  const chargeNextMonth = document.getElementById('smart-card-next-month').checked;
  if (!raw) return;

  const parcelMatch = raw.match(/\b(\d{1,2})x\b/i);
  const installments = parcelMatch ? Math.min(24, Math.max(1, parseInt(parcelMatch[1], 10))) : 1;

  const isCard = /\b(cartao|cartão|credito|crédito|nubank|inter|itau|itaú|c6)\b/i.test(raw) || installments > 1;
  let method = isCard ? 'Cartão de Crédito' : 'PIX/Débito';
  if (/\bboleto\b/i.test(raw)) method = 'Boleto';
  const isIncome = raw.includes('+');

  const cleaned = raw.replace(/\b\d{1,2}x\b/gi, '');
  const valMatch = cleaned.match(/[+-]?\d+(?:[.,]\d{1,2})?/);
  if (!valMatch) return alert('Informe o valor numérico! Ex: "Farmácia 85 cartao"');

  const totalVal = Math.abs(parseFloat(valMatch[0].replace(',', '.')));
  const parcelVal = installments > 1 ? +(totalVal / installments).toFixed(2) : totalVal;

  let desc = raw
    .replace(valMatch[0], '')
    .replace(/\b\d{1,2}x\b/gi, '')
    .replace(/\b(pix|cartao|cartão|credito|crédito|debito|débito|boleto)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!desc) desc = 'Lançamento';
  desc = desc.charAt(0).toUpperCase() + desc.slice(1);

  const inf = inferCategory(desc + ' ' + notes);
  const baseId = Date.now();
  const selCard = state.cards.find(c => String(c.id) === document.getElementById('smart-card').value) || state.cards[0] || { id: 1, dueDay: 10 };
  const day = isCard ? (selCard.dueDay || 10) : new Date().getDate();
  const startOffset = (isCard && chargeNextMonth) ? autoInvoiceOffset(selCard) : 0;

  document.getElementById('smart-input').value = '';
  document.getElementById('smart-notes').value = '';

  await mutateCloudState(s => {
    const cardObj = (s.cards || []).find(c => c.id === selCard.id) || (s.cards && s.cards[0]) || { id: selCard.id };
    for (let i = 0; i < installments; i++) {
      const targetMk = addMonthsToYearMonth(currentYear, currentMonth, startOffset + i);
      s.transactions.push({
        id: baseId + i,
        monthKey: targetMk,
        day,
        desc: installments > 1 ? `${desc} (${i + 1}/${installments})` : desc,
        notes: notes || '',
        amount: parcelVal,
        category: isIncome ? 'Renda Extra' : inf.category,
        type: isIncome ? 'income' : inf.type,
        method,
        cardId: isCard ? cardObj.id : null,
        owner,
        status: (isIncome || !isCard) ? 'paid' : 'pending'
      });
    }
  });

  const fb = document.getElementById('smart-feedback');
  if (isCard && startOffset > 0) {
    const nextMonthIdx = (currentMonth + 1) % 12;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    fb.innerHTML = `
      <div class="flex items-center justify-between bg-purple-950/70 border border-purple-700/60 text-purple-200 px-3 py-2 rounded-xl">
        <span>💳 <strong>${escapeHtml(desc)}</strong> lançado na fatura de <strong>${MONTH_NAMES[nextMonthIdx]}/${nextYear}</strong> e abatido do limite!</span>
        <button onclick="jumpToMonth(${nextYear}, ${nextMonthIdx})" class="underline font-semibold text-white ml-2">Ver fatura ➔</button>
      </div>`;
  } else {
    fb.innerHTML = `<div class="text-emerald-400 font-medium">✓ ${escapeHtml(desc)} (${formatBRL(parcelVal)}) adicionado neste mês!</div>`;
  }
  fb.classList.remove('hidden');
  setTimeout(() => fb.classList.add('hidden'), 6000);
}

function jumpToMonth(y, m) {
  currentYear = y;
  currentMonth = m;
  document.getElementById('smart-feedback').classList.add('hidden');
  renderAll();
}

// 2. Cadastro Manual Completo
function toggleDetailedCardOptions() {
  const isCard = document.getElementById('tx-method').value === 'Cartão de Crédito';
  document.getElementById('box-tx-card').classList.toggle('hidden', !isCard);
  document.getElementById('box-tx-billing').classList.toggle('hidden', !isCard);
  if (isCard) {
    document.getElementById('tx-status').value = 'pending';
  }
}

async function handleDetailedAdd(e) {
  e.preventDefault();
  if (!ensureConnected()) return;

  const desc = document.getElementById('tx-desc').value.trim();
  const notes = document.getElementById('tx-notes').value.trim();
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const day = Math.min(31, Math.max(1, parseInt(document.getElementById('tx-day').value, 10) || 10));
  const status = document.getElementById('tx-status').value;
  const type = document.getElementById('tx-type').value;
  const category = document.getElementById('tx-category').value;
  const method = document.getElementById('tx-method').value;
  const isCard = method === 'Cartão de Crédito';
  const cardId = isCard ? Number(document.getElementById('tx-card-id').value) : null;
  const billingOffset = isCard ? (parseInt(document.getElementById('tx-billing-offset').value, 10) || 0) : 0;
  const recurrence = document.getElementById('tx-recurrence').value;
  const owner = document.getElementById('tx-owner').value;

  if (!desc || isNaN(amount) || amount <= 0) return;
  const baseId = Date.now();

  document.getElementById('tx-desc').value = '';
  document.getElementById('tx-notes').value = '';
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-recurrence').value = '1';

  await mutateCloudState(s => {
    if (recurrence === 'fixed_12') {
      for (let i = 0; i < 12; i++) {
        s.transactions.push({
          id: baseId + i,
          monthKey: addMonthsToYearMonth(currentYear, currentMonth, billingOffset + i),
          day, desc, notes, amount, type, category, method, cardId, owner,
          status: i === 0 && !isCard ? status : 'pending'
        });
      }
    } else {
      const installments = parseInt(recurrence, 10) || 1;
      for (let i = 0; i < installments; i++) {
        s.transactions.push({
          id: baseId + i,
          monthKey: addMonthsToYearMonth(currentYear, currentMonth, billingOffset + i),
          day,
          desc: installments > 1 ? `${desc} (${i + 1}/${installments})` : desc,
          notes, amount, type, category, method, cardId, owner,
          status: i === 0 && !isCard ? status : 'pending'
        });
      }
    }
  });
}

async function handleIncomeAdd(e) {
  e.preventDefault();
  if (!ensureConnected()) return;

  const desc = document.getElementById('inc-desc').value.trim();
  const amount = parseFloat(document.getElementById('inc-amount').value);
  const method = document.getElementById('inc-method').value;
  const owner = document.getElementById('inc-owner').value;
  
  if (!desc || isNaN(amount) || amount <= 0) return;

  document.getElementById('inc-desc').value = '';
  document.getElementById('inc-amount').value = '';
  document.getElementById('income-modal').classList.add('hidden');

  await mutateCloudState(s => {
    s.transactions.push({
      id: Date.now(),
      monthKey: getMonthKey(currentYear, currentMonth),
      day: new Date().getDate(),
      desc: desc,
      notes: '',
      amount: amount,
      category: 'Renda',
      type: 'income',
      method: method,
      cardId: null,
      owner: owner,
      status: 'paid' // O dinheiro já entrou na conta
    });
  });
}

// 3. Edição e Duplicação de Lançamentos
function toggleEditCardSelect() {
  const isCard = document.getElementById('edit-method').value === 'Cartão de Crédito';
  document.getElementById('edit-card-id').disabled = !isCard;
}

function openEditModal(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;

  document.getElementById('edit-id').value = tx.id;
  document.getElementById('edit-desc').value = tx.desc || '';
  document.getElementById('edit-notes').value = tx.notes || '';
  document.getElementById('edit-amount').value = tx.amount || 0;
  document.getElementById('edit-day').value = tx.day || 10;
  document.getElementById('edit-month').value = tx.monthKey || getMonthKey(currentYear, currentMonth);
  document.getElementById('edit-status').value = tx.status || 'pending';
  document.getElementById('edit-method').value = tx.method || 'PIX/Débito';
  document.getElementById('edit-card-id').value = tx.cardId || (state.cards[0]?.id || 1);
  document.getElementById('edit-type').value = tx.type || 'expense_variable';
  document.getElementById('edit-category').value = tx.category || 'Outros';
  document.getElementById('edit-owner').value = tx.owner || 'joint';

  toggleEditCardSelect();
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

async function saveEditedTransaction(e) {
  e.preventDefault();
  const id = Number(document.getElementById('edit-id').value);
  const method = document.getElementById('edit-method').value;
  const updated = {
    desc: document.getElementById('edit-desc').value.trim(),
    notes: document.getElementById('edit-notes').value.trim(),
    amount: Math.max(0.01, parseFloat(document.getElementById('edit-amount').value) || 0),
    day: Math.min(31, Math.max(1, parseInt(document.getElementById('edit-day').value, 10) || 1)),
    monthKey: document.getElementById('edit-month').value || getMonthKey(currentYear, currentMonth),
    status: document.getElementById('edit-status').value,
    method,
    cardId: method === 'Cartão de Crédito' ? Number(document.getElementById('edit-card-id').value) : null,
    type: document.getElementById('edit-type').value,
    category: document.getElementById('edit-category').value,
    owner: document.getElementById('edit-owner').value
  };

  closeEditModal();
  await mutateCloudState(s => {
    const tx = s.transactions.find(t => t.id === id);
    if (tx) Object.assign(tx, updated);
  });
}

async function duplicateTransaction(id) {
  const orig = state.transactions.find(t => t.id === id);
  if (!orig) return;
  await mutateCloudState(s => {
    s.transactions.push({
      ...orig,
      id: Date.now(),
      desc: `${orig.desc} (Cópia)`
    });
  });
}

// 4. Importação/Exportação CSV e Funções Auxiliares
function handleBankCSVImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    const lines = e.target.result.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return;
    const newItems = [];
    const baseId = Date.now();
    const defaultCardId = state.cards[0]?.id || 1;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[;,]/).map(c => c.replace(/^"|"$/g, '').trim());
      if (cols.length < 2) continue;

      let day = 10, targetMk = getMonthKey(currentYear, currentMonth), amount = null, descParts = [];
      cols.forEach(col => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(col)) {
          const p = col.split('-'); targetMk = `${p[0]}-${p[1]}`; day = parseInt(p[2], 10);
        } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(col)) {
          const p = col.split('/'); day = parseInt(p[0], 10); targetMk = `${p[2]}-${p[1]}`;
        } else if (/^-?\d+(\.\d{1,2}|,\d{1,2})$/.test(col)) {
          amount = parseFloat(col.replace(',', '.'));
        } else if (col.length > 2) {
          descParts.push(col);
        }
      });

      if (amount === null || isNaN(amount) || amount === 0) continue;
      const desc = descParts[0] || 'Item Importado';
      const notes = descParts.slice(1).join(' • ');
      const inf = inferCategory(desc + ' ' + notes);

      newItems.push({
        id: baseId + i, monthKey: targetMk, day, desc, notes,
        amount: Math.abs(amount), category: inf.category, type: inf.type,
        method: 'Cartão de Crédito', cardId: defaultCardId, owner: 'joint', status: 'pending'
      });
    }

    if (newItems.length > 0) {
      await mutateCloudState(s => { s.transactions.push(...newItems); });
      alert(`${newItems.length} item(ns) importado(s) para a nuvem!`);
    }
    event.target.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}

function exportMonthCSV() {
  const mk = getMonthKey(currentYear, currentMonth);
  const mTxs = state.transactions.filter(t => t.monthKey === mk);
  const rows = [
    ['Data_Mes', 'Dia', 'Titulo', 'Breve_Descricao', 'Categoria', 'Meio_Pagamento', 'Responsavel', 'Status', 'Valor_BRL']
  ];
  mTxs.forEach(t => {
    rows.push([
      t.monthKey,
      t.day || 1,
      `"${(t.desc || '').replace(/"/g, '""')}"`,
      `"${(t.notes || '').replace(/"/g, '""')}"`,
      t.category,
      t.method,
      t.owner,
      t.status,
      t.amount.toFixed(2)
    ]);
  });
  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(r => r.join(';')).join('\n');
  const link = document.createElement('a');
  link.setAttribute('href', encodeURI(csvContent));
  link.setAttribute('download', `financas_casal_${mk}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function copyFixedFromPrevMonth() {
  const prevMk = addMonthsToYearMonth(currentYear, currentMonth, -1);
  const currMk = getMonthKey(currentYear, currentMonth);
  let added = 0;

  await mutateCloudState(s => {
    const fixed = s.transactions.filter(t => t.monthKey === prevMk && t.type === 'expense_fixed');
    fixed.forEach((f, idx) => {
      if (!s.transactions.some(t => t.monthKey === currMk && t.desc === f.desc)) {
        s.transactions.push({ ...f, id: Date.now() + idx, monthKey: currMk, status: 'pending' });
        added++;
      }
    });
  });

  if (added === 0) alert('Nenhuma despesa fixa nova encontrada no mês anterior.');
  else alert(`${added} despesa(s) fixa(s) copiada(s)!`);
}

async function updateSalaries() {
  const mk = getMonthKey(currentYear, currentMonth);
  const val1 = Math.max(0, parseFloat(document.getElementById('sal-p1-input').value) || 0);
  const val2 = Math.max(0, parseFloat(document.getElementById('sal-p2-input').value) || 0);
  await mutateCloudState(s => { s.salariesP1[mk] = val1; s.salariesP2[mk] = val2; });
}

async function changeSplitMode(val) {
  await mutateCloudState(s => { s.splitMode = val; });
}

async function toggleStatus(id) {
  await mutateCloudState(s => {
    const it = s.transactions.find(t => t.id === id);
    if (it) it.status = it.status === 'paid' ? 'pending' : 'paid';
  });
}

async function deleteTransaction(id) {
  if (!confirm('Excluir este lançamento da nuvem?')) return;
  await mutateCloudState(s => {
    s.transactions = s.transactions.filter(t => t.id !== id);
  });
}

function exportBackupJSON() {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
  const link = document.createElement('a');
  link.setAttribute('href', dataStr);
  link.setAttribute('download', `backup_financas_casal_${currentYear}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function changeYear(d) { currentYear += d; renderAll(); }
function selectMonth(m) { currentMonth = m; renderAll(); }

// 5. Renderização da Interface e Gráficos
function populateDropdowns(p1, p2) {
  const ownerHtml = `
    <option value="joint">💑 Conta Conjunta (A dividir)</option>
    <option value="p1">💑 Pago por ${escapeHtml(p1)} (Conjunta)</option>
    <option value="p2">💑 Pago por ${escapeHtml(p2)} (Conjunta)</option>
    <option value="p1_ind">👤 Individual (${escapeHtml(p1)})</option>
    <option value="p2_ind">👤 Individual (${escapeHtml(p2)})</option>
  `;
  ['smart-owner', 'tx-owner', 'edit-owner'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { const v = el.value || 'joint'; el.innerHTML = ownerHtml; el.value = v; }
  });

  const catHtml = CATEGORIES_LIST.map(c => `<option value="${escapeHtml(c.value)}">${escapeHtml(c.label)}</option>`).join('');
  ['tx-category', 'edit-category'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { const v = el.value || 'Moradia & Contas'; el.innerHTML = catHtml; el.value = v; }
  });

  const cardHtml = (state.cards || []).map(c => `<option value="${c.id}">💳 ${escapeHtml(c.name)}</option>`).join('');
  ['tx-card-id', 'edit-card-id', 'smart-card'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { const v = el.value || (state.cards[0]?.id || 1); el.innerHTML = cardHtml; el.value = v; }
  });
}

function renderAll() {
  const p1 = cloudCfg.p1Name || 'Eduardo';
  const p2 = cloudCfg.p2Name || 'Namorada';
  populateDropdowns(p1, p2);

  document.getElementById('label-sal-p1').textContent = `${p1}:`;
  document.getElementById('label-sal-p2').textContent = `${p2}:`;
  document.getElementById('opt-filter-p1').textContent = `Apenas ${p1}`;
  document.getElementById('opt-filter-p2').textContent = `Apenas ${p2}`;
  document.getElementById('current-year-label').textContent = currentYear;
  document.getElementById('chart-year-label').textContent = currentYear;
  document.getElementById('active-month-title').textContent = `${MONTH_NAMES[currentMonth]} de ${currentYear}`;
  document.getElementById('split-mode').value = state.splitMode || '50_50';

  document.getElementById('months-grid').innerHTML = MONTH_SHORT.map((mLabel, idx) => {
    const mk = getMonthKey(currentYear, idx);
    const mTxs = state.transactions.filter(t => t.monthKey === mk && t.type !== 'income');
    const hasPend = mTxs.some(t => t.status === 'pending');
    const dot = mTxs.length ? `<span class="w-1.5 h-1.5 rounded-full ${hasPend ? 'bg-amber-400' : 'bg-emerald-400'}"></span>` : '';
    return `<button onclick="selectMonth(${idx})" class="month-btn ${idx === currentMonth ? 'active' : 'bg-slate-900/90 text-slate-300 border-slate-800'} border rounded-xl py-2 px-1 flex items-center justify-center gap-1 text-xs font-semibold transition"><span>${mLabel}</span>${dot}</button>`;
  }).join('');

  const mk = getMonthKey(currentYear, currentMonth);
  const mTxs = state.transactions.filter(t => t.monthKey === mk);

  // Calcula rendas antigas + novas transações de renda
  const legacySal1 = state.salariesP1[mk] || 0;
  const legacySal2 = state.salariesP2[mk] || 0;
  
  const p1IncomeTxs = mTxs.filter(t => t.type === 'income' && t.owner === 'p1').reduce((s, t) => s + t.amount, 0);
  const p2IncomeTxs = mTxs.filter(t => t.type === 'income' && t.owner === 'p2').reduce((s, t) => s + t.amount, 0);
  const jointIncomeTxs = mTxs.filter(t => t.type === 'income' && t.owner === 'joint').reduce((s, t) => s + t.amount, 0);
  
  const sal1 = legacySal1 + p1IncomeTxs + (jointIncomeTxs / 2);
  const sal2 = legacySal2 + p2IncomeTxs + (jointIncomeTxs / 2);
  const totalIncome = sal1 + sal2;

  // Atualiza os textos de resumo na Renda
  const p1Label = document.getElementById('kpi-inc-p1');
  const p2Label = document.getElementById('kpi-inc-p2');
  if(p1Label) p1Label.textContent = formatBRL(sal1);
  if(p2Label) p2Label.textContent = formatBRL(sal2);

  const outflows = mTxs.filter(t => t.type !== 'income');
  const totalExp = outflows.filter(t => t.type !== 'investment').reduce((s, t) => s + t.amount, 0);
  const totalInvMonth = outflows.filter(t => t.type === 'investment').reduce((s, t) => s + t.amount, 0);
  const pendingExp = outflows.filter(t => t.status === 'pending').reduce((s, t) => s + t.amount, 0);
  const cardMonthExp = outflows.filter(t => t.method === 'Cartão de Crédito').reduce((s, t) => s + t.amount, 0);
  const cardMonthPending = outflows.filter(t => t.method === 'Cartão de Crédito' && t.status === 'pending').reduce((s, t) => s + t.amount, 0);

  
  const payInvBtn = document.getElementById('btn-pay-invoice');
  if (cardMonthPending > 0) {
    payInvBtn.textContent = `✅ Quitar Fatura (${formatBRL(cardMonthPending)})`;
    payInvBtn.classList.remove('hidden');
  } else {
    payInvBtn.classList.add('hidden');
  }

  // Cálculo de limite global de todos os cartões
  const totalLimitSum = (state.cards || []).reduce((s, c) => s + (c.limit || 0), 0);
  const totalUsedLimitGlobal = state.transactions
    .filter(t => t.method === 'Cartão de Crédito' && t.status === 'pending')
    .reduce((s, t) => s + t.amount, 0);
  const limitAvailableGlobal = Math.max(0, totalLimitSum - totalUsedLimitGlobal);
  const limitUsedPct = totalLimitSum > 0 ? Math.min(100, (totalUsedLimitGlobal / totalLimitSum) * 100) : 0;

// 1. Calcula o Rollover (Saldo Acumulado de TODOS os meses anteriores)
  let previousBalance = 0;
  
  // Soma os salários antigos (legacy) de meses anteriores
  Object.keys(state.salariesP1 || {}).forEach(iterMk => {
    const [tY, tM] = iterMk.split('-').map(Number);
    const iterDate = new Date(tY, tM - 1);
    const currentDate = new Date(currentYear, currentMonth);
    if (iterDate < currentDate) {
      previousBalance += (state.salariesP1[iterMk] || 0) + (state.salariesP2[iterMk] || 0);
    }
  });

  // Soma transações de meses anteriores (Rendas - Despesas)
  state.transactions.forEach(t => {
    const [tY, tM] = t.monthKey.split('-').map(Number);
    const iterDate = new Date(tY, tM - 1);
    const currentDate = new Date(currentYear, currentMonth);
    
    if (iterDate < currentDate) {
      if (t.type === 'income') {
        previousBalance += t.amount;
      } else {
        // Subtrai todas as despesas (fixas, variáveis, investimentos/caixinha)
        previousBalance -= t.amount;
      }
    }
  });

  // 2. Calcula o saldo final real do mês atual
  const netBalanceMonth = totalIncome - totalExp - totalInvMonth;
  const netBalanceTotal = netBalanceMonth + previousBalance;

  // 3. Atualiza os KPIs no ecrã
  document.getElementById('kpi-income').textContent = formatBRL(totalIncome);
  document.getElementById('kpi-expenses').textContent = formatBRL(totalExp);
  document.getElementById('kpi-card-badge').textContent = `💳 Fatura: ${formatBRL(cardMonthExp)}`;
  document.getElementById('kpi-pending').textContent = formatBRL(pendingExp);
  
  // Atualiza o Saldo Total e o texto de Rollover
  document.getElementById('kpi-balance').textContent = formatBRL(netBalanceTotal);
  
  const rolloverEl = document.getElementById('kpi-rollover');
  if (rolloverEl) {
    if (previousBalance >= 0) {
      rolloverEl.textContent = `+ ${formatBRL(previousBalance)}`;
      rolloverEl.className = "text-emerald-400 ml-1";
    } else {
      rolloverEl.textContent = `- ${formatBRL(Math.abs(previousBalance))} (Dívida)`;
      rolloverEl.className = "text-rose-400 ml-1";
    }
  }

  // 4. MANTÉM AS LINHAS DO CARTÃO QUE TINHA SELECIONADO
  document.getElementById('kpi-card-limit-disp').textContent = formatBRL(limitAvailableGlobal);
  document.getElementById('kpi-card-limit-bar').style.width = `${limitUsedPct}%`;
  document.getElementById('kpi-card-limit-sub').textContent = `Ocupado: ${formatBRL(totalUsedLimitGlobal)} de ${formatBRL(totalLimitSum)}`;

  // Divisão do Casal
  const jointTxs = outflows.filter(t => t.owner === 'joint' || t.owner === 'p1' || t.owner === 'p2');
  const jointTotal = jointTxs.reduce((s, t) => s + t.amount, 0);
  const paidByP1 = jointTxs.filter(t => t.owner === 'p1').reduce((s, t) => s + t.amount, 0);
  const paidByP2 = jointTxs.filter(t => t.owner === 'p2').reduce((s, t) => s + t.amount, 0);

  const totalSal = sal1 + sal2;
  let p1SharePct = 0.5, p2SharePct = 0.5;
  if (state.splitMode === 'prop' && totalSal > 0) {
    p1SharePct = sal1 / totalSal;
    p2SharePct = sal2 / totalSal;
  }

  document.getElementById('split-summary-box').innerHTML = `
    <div class="flex justify-between"><span>Conjuntas do Mês:</span> <strong class="text-indigo-300">${formatBRL(jointTotal)}</strong></div>
    <div class="flex justify-between"><span>Quota ${escapeHtml(p1)} (${(p1SharePct * 100).toFixed(0)}%):</span> <strong class="text-white">${formatBRL(jointTotal * p1SharePct)}</strong></div>
    <div class="flex justify-between"><span>Quota ${escapeHtml(p2)} (${(p2SharePct * 100).toFixed(0)}%):</span> <strong class="text-white">${formatBRL(jointTotal * p2SharePct)}</strong></div>
  `;

  const settlementEl = document.getElementById('settlement-badge');
  if (paidByP1 > 0 || paidByP2 > 0) {
    const p1Net = paidByP1 - (paidByP1 + paidByP2) * p1SharePct;
    if (Math.abs(p1Net) < 1) settlementEl.textContent = '✨ Contas pagas equilibradas!';
    else if (p1Net > 0) settlementEl.textContent = `🔄 Acerto: ${p2} transfere ${formatBRL(p1Net)} para ${p1}`;
    else settlementEl.textContent = `🔄 Acerto: ${p1} transfere ${formatBRL(Math.abs(p1Net))} para ${p2}`;
  } else {
    settlementEl.textContent = '💡 Marque quem pagou cada conta para calcular o acerto.';
  }

  // Termômetro 50-30-20
  const fixedSum = outflows.filter(t => t.type === 'expense_fixed').reduce((s, t) => s + t.amount, 0);
  const varSum = outflows.filter(t => t.type === 'expense_variable').reduce((s, t) => s + t.amount, 0);
 const saveSum = totalInvMonth + Math.max(0, netBalanceTotal);

  const fPct = totalIncome > 0 ? (fixedSum / totalIncome) * 100 : 0;
  const vPct = totalIncome > 0 ? (varSum / totalIncome) * 100 : 0;
  const sPct = totalIncome > 0 ? (saveSum / totalIncome) * 100 : 0;

  document.getElementById('rule-fixed-label').textContent = `${fPct.toFixed(0)}% (${formatBRL(fixedSum)})`;
  document.getElementById('rule-fixed-bar').style.width = `${Math.min(100, fPct)}%`;
  document.getElementById('rule-var-label').textContent = `${vPct.toFixed(0)}% (${formatBRL(varSum)})`;
  document.getElementById('rule-var-bar').style.width = `${Math.min(100, vPct)}%`;
  document.getElementById('rule-save-label').textContent = `${sPct.toFixed(0)}% (${formatBRL(saveSum)})`;
  document.getElementById('rule-save-bar').style.width = `${Math.min(100, sPct)}%`;

  renderTable(mTxs, p1, p2);
  renderCharts(outflows);
}

function renderTable(mTxs, p1, p2) {
  const tbody = document.getElementById('tx-table-body');
  const filterOwner = document.getElementById('filter-owner').value;
  const search = document.getElementById('filter-search').value.toLowerCase();

  const filtered = mTxs.filter(t => {
    const matchSearch = (t.desc || '').toLowerCase().includes(search) ||
                        (t.notes || '').toLowerCase().includes(search) ||
                        (t.category || '').toLowerCase().includes(search);
    if (!matchSearch) return false;
    if (filterOwner === 'ALL') return true;
    if (filterOwner === 'joint') return t.owner === 'joint' || t.owner === 'p1' || t.owner === 'p2';
    if (filterOwner === 'p1') return t.owner === 'p1' || t.owner === 'p1_ind';
    if (filterOwner === 'p2') return t.owner === 'p2' || t.owner === 'p2_ind';
    return true;
  }).sort((a, b) => (a.day || 1) - (b.day || 1));

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-slate-400 text-xs">💡<div class="mt-2">Nenhum lançamento encontrado.</div><div class="text-slate-500 mt-1">Toque no botão + para lançar ou ajuste os filtros.</div></td></tr>`;
    return;
  }

  const ownerLabels = {
    joint: `<span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px]">💑 Casal</span>`,
    p1: `<span class="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px]">💑 ${escapeHtml(p1)} pagou</span>`,
    p2: `<span class="px-2 py-0.5 rounded bg-pink-500/20 text-pink-300 text-[10px]">💑 ${escapeHtml(p2)} pagou</span>`,
    p1_ind: `<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">👤 Só ${escapeHtml(p1)}</span>`,
    p2_ind: `<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">👤 Só ${escapeHtml(p2)}</span>`
  };

  tbody.innerHTML = filtered.map(t => {
    const isInc = t.type === 'income';
    const statusBtn = t.status === 'paid'
      ? `<button onclick="toggleStatus(${t.id})" class="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25">Pago</button>`
      : `<button onclick="toggleStatus(${t.id})" class="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25">Pend.</button>`;

    const notesHtml = t.notes
      ? `<div class="text-[11px] text-slate-300/90 italic mt-0.5 bg-slate-800/60 px-2 py-0.5 rounded border-l-2 border-blue-500/60">💬 ${escapeHtml(t.notes)}</div>`
      : '';

    const cardObj = t.method === 'Cartão de Crédito' ? (state.cards.find(c => c.id === t.cardId) || state.cards[0]) : null;
    const methodText = cardObj ? `💳 ${escapeHtml(cardObj.name)}` : escapeHtml(t.method || 'PIX/Débito');

    return `
      <tr class="hover:bg-slate-800/40 transition" data-id="${t.id}">
        <td class="py-2.5 px-1.5 text-xs font-mono text-slate-400">${String(t.day || 1).padStart(2, '0')}</td>
        <td class="py-2.5 px-1.5">${statusBtn}</td>
        <td class="py-2.5 px-1.5">
          <div class="font-medium text-slate-200">${escapeHtml(t.desc)}</div>
          ${notesHtml}
          <div class="text-[10px] text-slate-400 mt-0.5"><i class="cdot" style="background:${catColor(t.category)}"></i>${escapeHtml(catLabel(t.category))} • ${methodText}</div>
        </td>
        <td class="py-2.5 px-1.5">${ownerLabels[t.owner] || ownerLabels.joint}</td>
        <td class="py-2.5 px-1.5 text-right font-semibold whitespace-nowrap ${isInc ? 'text-emerald-400' : 'text-slate-200'}">
          ${isInc ? '+' : '-'} ${formatBRL(t.amount)}
        </td>
        <td class="py-2.5 px-1.5 text-center whitespace-nowrap">
          <button onclick="openEditModal(${t.id})" class="text-slate-400 hover:text-blue-400 px-1 py-1 transition" title="Editar lançamento">✏️</button>
          <button onclick="duplicateTransaction(${t.id})" class="text-slate-400 hover:text-indigo-400 px-1 py-1 transition" title="Duplicar lançamento">📄</button>
          <button onclick="makeRecurring(${t.id})" class="text-slate-400 hover:text-cyan-400 px-1 py-1 transition" title="Repetir todo mês">🔁</button>
          <button onclick="deleteTransaction(${t.id})" class="text-slate-500 hover:text-rose-400 px-1 py-1 transition" title="Excluir">✕</button>
        </td>
      </tr>`;
  }).join('');
}

function renderCharts(outflows) {
  const ctxCat = document.getElementById('categoryChart').getContext('2d');
  const grouped = {};
  outflows.forEach(t => { grouped[t.category] = (grouped[t.category] || 0) + t.amount; });

  if (categoryChartInstance) categoryChartInstance.destroy();
  const labels = Object.keys(grouped);
  const palette = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#fb7185', '#2dd4bf', '#f97316', '#c084fc', '#84cc16', '#38bdf8', '#e879f9', '#facc15'];

  categoryChartInstance = new Chart(ctxCat, {
    type: 'doughnut',
    data: {
      labels: labels.length ? labels : ['Sem gastos'],
      datasets: [{
        data: labels.length ? Object.values(grouped) : [1],
        backgroundColor: labels.length ? palette.slice(0, labels.length) : ['#1e293b'],
        borderWidth: 2,
        borderColor: '#030510'
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right', labels: { color: '#cbd5e1', font: { size: 10 }, boxWidth: 10 } } } }
  });

  const ctxAnn = document.getElementById('annualChart').getContext('2d');
  const incArr = [], expArr = [];
  for (let m = 0; m < 12; m++) {
    const mk = getMonthKey(currentYear, m);
    const mTxs = state.transactions.filter(t => t.monthKey === mk);
    const s1 = state.salariesP1[mk] || 0;
    const s2 = state.salariesP2[mk] || 0;
    const ext = mTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const out = mTxs.filter(t => t.type !== 'income').reduce((s, t) => s + t.amount, 0);
    incArr.push(s1 + s2 + ext);
    expArr.push(out);
  }

  if (annualChartInstance) annualChartInstance.destroy();
  annualChartInstance = new Chart(ctxAnn, {
    type: 'bar',
    data: {
      labels: MONTH_SHORT,
      datasets: [
        { label: 'Renda Casal', data: incArr, backgroundColor: 'rgba(52, 211, 153, 0.8)', borderRadius: 4 },
        { label: 'Saídas / Faturas', data: expArr, backgroundColor: 'rgba(244, 114, 182, 0.8)', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(51,65,85,0.25)' } }
      },
      plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 10 }, boxWidth: 10 } } }
    }
  });
}

// Auto-sincronização ao voltar para o app no celular ou a cada 30 segundos
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && hasValidCloudConfig()) pullFromCloud(false);
});

setInterval(() => {
  if (document.visibilityState === 'visible' && hasValidCloudConfig()) pullFromCloud(false);
}, 30000);

function openAIModal() {
  const mk = getMonthKey(currentYear, currentMonth);
  const mTxs = state.transactions.filter(t => t.monthKey === mk);
  
  const totalInc = mTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0) + (state.salariesP1[mk] || 0) + (state.salariesP2[mk] || 0);
  const fixed = mTxs.filter(t => t.type === 'expense_fixed').reduce((s, t) => s + t.amount, 0);
  const variable = mTxs.filter(t => t.type === 'expense_variable').reduce((s, t) => s + t.amount, 0);
  const inv = mTxs.filter(t => t.type === 'investment').reduce((s, t) => s + t.amount, 0);
  
  const fPct = totalInc ? ((fixed / totalInc) * 100).toFixed(1) : 0;
  const vPct = totalInc ? ((variable / totalInc) * 100).toFixed(1) : 0;

  // Encontra a categoria onde mais gastaram (variável)
  const catSums = {};
  mTxs.filter(t => t.type === 'expense_variable').forEach(t => { catSums[t.category] = (catSums[t.category] || 0) + t.amount; });
  const topCat = Object.keys(catSums).sort((a,b) => catSums[b] - catSums[a])[0] || 'Nenhuma';

  let alertHtml = `<strong class="text-emerald-400">✓ Renda Total: ${formatBRL(totalInc)}</strong><br><br>`;
  
  if (fPct > 50) alertHtml += `⚠️ <strong>Custos Fixos Altos (${fPct}%):</strong> Vocês ultrapassaram o limite ideal de 50%. Cuidado com o peso das contas de casa.<br>`;
  else alertHtml += `✅ <strong>Custos Fixos Controlados (${fPct}%):</strong> Estão dentro do limite de 50%.<br>`;

  if (vPct > 30) alertHtml += `🔥 <strong>Estilo de Vida Caro (${vPct}%):</strong> Estão a gastar demasiado em lazer/variáveis. O ralo principal este mês é <strong>${topCat}</strong> (${formatBRL(catSums[topCat] || 0)}).<br>`;
  else alertHtml += `✅ <strong>Gastos Variáveis Seguros (${vPct}%).</strong><br>`;

  document.getElementById('ai-local-diagnosis').innerHTML = alertHtml;
  document.getElementById('ai-modal').classList.remove('hidden');
}

function copyPromptForAI() {
  const p1 = cloudCfg.p1Name || 'Eduardo';
  const p2 = cloudCfg.p2Name || 'Namorada';
  const mk = getMonthKey(currentYear, currentMonth);
  const mTxs = state.transactions.filter(t => t.monthKey === mk);
  
  const totalInc = mTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0) + (state.salariesP1[mk] || 0) + (state.salariesP2[mk] || 0);
  
  let prompt = `Aja como um consultor financeiro implacável e analítico. Estou a analisar as finanças deste mês do casal ${p1} e ${p2}.\n\n`;
  prompt += `📍 RESUMO DO MÊS:\n- Renda Total do Casal: R$ ${totalInc.toFixed(2)}\n`;
  prompt += `- Meta: Seguir a regra 50 (Fixos) - 30 (Variáveis) - 20 (Investimentos).\n\n`;
  prompt += `📍 LISTA DE GASTOS:\n`;
  
  mTxs.filter(t => t.type !== 'income').forEach(t => {
    prompt += `- ${t.category} | ${t.desc} | R$ ${t.amount.toFixed(2)} | Tipo: ${t.type.replace('expense_', '')}\n`;
  });

  prompt += `\nCom base nestes dados:\n1. Onde está o maior risco financeiro deles?\n2. Quais as categorias que precisam de cortes urgentes?\n3. Dê uma sugestão prática de gestão de orçamento para o casal.`;

  navigator.clipboard.writeText(prompt);
  
  const btn = document.getElementById('btn-copy-ai');
  const originalText = btn.innerHTML;
  btn.innerHTML = '✅ Prompt Copiado! Cole na IA.';
  btn.classList.add('bg-emerald-800', 'border-emerald-500', 'text-white');
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.classList.remove('bg-emerald-800', 'border-emerald-500', 'text-white');
  }, 4000);
}

// Inicialização da Aplicação
renderAll();
if (!hasValidCloudConfig()) openAuthModal();
else pullFromCloud(false);