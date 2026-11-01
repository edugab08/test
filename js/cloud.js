let cloudCfg = loadCloudCfg();

function loadCloudCfg() {
  const saved = localStorage.getItem(LOCAL_CFG_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) {}
  }
  return { p1Name: 'Eduardo', p2Name: 'Namorada', scriptUrl: '', pin: '' };
}

function hasValidCloudConfig() {
  return Boolean(cloudCfg && cloudCfg.scriptUrl && cloudCfg.pin);
}

function ensureConnected() {
  if (!hasValidCloudConfig()) {
    openAuthModal();
    return false;
  }
  return true;
}

function normalizeState(raw) {
  const cards = Array.isArray(raw?.cards)
    ? raw.cards
    : [{ id: 1, name: 'Cartão Principal', limit: 4000, dueDay: 10, closingDay: 1 }];
  const res = {
    splitMode: raw?.splitMode || '50_50',
    salariesP1: raw?.salariesP1 || {},
    salariesP2: raw?.salariesP2 || {},
    cards,
    transactions: (Array.isArray(raw?.transactions) ? raw.transactions : []).map(t => ({ ...t, amount: Math.round((Number(t.amount) || 0) * 100) / 100 })),
    settlements: Array.isArray(raw?.settlements) ? raw.settlements : [],
    categories: { custom: Array.isArray(raw?.categories?.custom) ? raw.categories.custom : [], over: raw?.categories?.over || {} },
    _wids: Array.isArray(raw?._wids) ? raw._wids : [],
    budgets: raw?.budgets || {},
    wallets: Array.isArray(raw?.wallets) ? raw.wallets : [],
    goals: Array.isArray(raw?.goals) ? raw.goals : [],
    recurring: Array.isArray(raw?.recurring) ? raw.recurring : []
  };
  try { localStorage.setItem('fc_cache', JSON.stringify(res)); } catch (e) {}
  return res;
}

// Puxa a versão mais recente da planilha, aplica a alteração e salva de volta (evita conflitos entre o casal)
// Detecta o script v2 (senha por POST, trava e controle de versão no servidor)
let _srvV2 = null, _srvUrl = '';
async function isServerV2() {
  if (_srvUrl !== cloudCfg.scriptUrl) { _srvV2 = null; _srvUrl = cloudCfg.scriptUrl; }
  if (_srvV2 !== null) return _srvV2;
  try { const j = await (await fetch(cloudCfg.scriptUrl, { cache: 'no-store' })).json(); _srvV2 = !!(j && j.version === 2); } catch (e) { return false; }
  return _srvV2;
}
async function fetchCloudState() {
  if (await isServerV2()) {
    const res = await fetch(cloudCfg.scriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ pin: cloudCfg.pin, action: 'get' }) });
    return res.json();
  }
  return (await fetch(`${cloudCfg.scriptUrl}?pin=${encodeURIComponent(cloudCfg.pin)}&t=${Date.now()}`, { cache: 'no-store' })).json();
}

let _mq = Promise.resolve();
function mutateCloudState(fn) {
  const run = _mq.then(() => _mutate(fn));
  _mq = run.catch(() => {});
  return run;
}

async function _mutate(mutatorFn) {
  if (!ensureConnected()) return;
  while (isSyncing) await new Promise(r => setTimeout(r, 120));
  isSyncing = true;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  setSyncIndicator('syncing', 'Sincronizando com a planilha do casal...');
  try {
    const v2 = await isServerV2();
    // Até 3 tentativas: se outra pessoa gravar ao mesmo tempo e sobrescrever a nossa,
    // buscamos o estado novo e refazemos a alteração (nada se perde).
    for (let attempt = 0; attempt < 3; attempt++) {
      const getJson = await fetchCloudState();
      if (getJson.error) {
        setSyncIndicator('err', getJson.error);
        alert(getJson.error);
        openAuthModal();
        return;
      }
      if (getJson.data) state = normalizeState(getJson.data);

      const base = getJson.data ? ((getJson.data._wids || []).slice(-1)[0] || null) : null;
      mutatorFn(state);
      const wid = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      state._wids = [...(state._wids || []).slice(-19), wid];
      renderAll();

      const postRes = await fetch(cloudCfg.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ pin: cloudCfg.pin, data: state, ...(v2 ? { base } : {}) })
      });
      const postJson = await postRes.json();
      if (postJson.conflict) { setSyncIndicator('syncing', 'Edição simultânea: refazendo...'); continue; }
      if (postJson.status !== 'salvo') {
        setSyncIndicator('err', postJson.error || 'Erro ao gravar na planilha');
        return;
      }

      if (!v2) await sleep(450);
      const chk = v2 ? null : await fetchCloudState();
      const ok = v2 || !chk.data || !Array.isArray(chk.data._wids) || chk.data._wids.includes(wid);
      if (ok) {
        const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        setSyncIndicator('ok', `Salvo na nuvem às ${hora} • Sincronizado para ambos`);
        return;
      }
    }
    setSyncIndicator('err', 'Conflito de edição. Tente de novo.');
    if (typeof toast === 'function') toast('Edição simultânea detectada: tente de novo.');
  } catch (err) {
    setSyncIndicator('err', 'Falha de conexão. Verifique a internet.');
    if (typeof toast === 'function') toast('Sem conexão: a alteração não foi salva.');
  } finally {
    isSyncing = false;
  }
}

async function pullFromCloud(showAlertOnError = false) {
  if (!hasValidCloudConfig()) {
    openAuthModal();
    return false;
  }
  if (isSyncing) return false;
  isSyncing = true;

  setSyncIndicator('syncing', 'Buscando atualizações na nuvem...');
  try {
    const json = await fetchCloudState();

    if (json.error) {
      setSyncIndicator('err', json.error);
      if (showAlertOnError) alert(json.error);
      openAuthModal();
      isSyncing = false;
      return false;
    }

    if (json.data) {
      state = normalizeState(json.data);
      renderAll();
    }
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setSyncIndicator('ok', `Sincronizado em tempo real (${hora})`);
    isSyncing = false;
    return true;
  } catch (err) {
    setSyncIndicator('err', 'Erro de conexão com a planilha');
    if (showAlertOnError) alert('Não foi possível conectar ao Google Apps Script. Verifique a URL e sua internet.');
    isSyncing = false;
    return false;
  }
}

function setSyncIndicator(status, text) {
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-status-text');
  if (!dot || !label) return;
  label.textContent = text;
  if (status !== 'syncing') document.body.classList.remove('loading');
  if (status === 'ok') dot.className = 'w-3 h-3 rounded-full bg-emerald-400';
  else if (status === 'syncing') dot.className = 'w-3 h-3 rounded-full bg-blue-400 animate-ping';
  else dot.className = 'w-3 h-3 rounded-full bg-rose-500';
}

function openAuthModal() {
  document.getElementById('cfg-p1').value = cloudCfg.p1Name || 'Eduardo';
  document.getElementById('cfg-p2').value = cloudCfg.p2Name || 'Namorada';
  document.getElementById('cfg-url').value = cloudCfg.scriptUrl || '';
  document.getElementById('cfg-pin').value = cloudCfg.pin || '';
  const closeBtn = document.getElementById('btn-close-auth');
  if (hasValidCloudConfig()) closeBtn.classList.remove('hidden');
  else closeBtn.classList.add('hidden');
  document.getElementById('auth-modal').classList.remove('hidden');
}

function closeAuthModal() {
  if (!hasValidCloudConfig()) return;
  document.getElementById('auth-modal').classList.add('hidden');
}

async function saveCloudConfigAndSync() {
  const p1Name = document.getElementById('cfg-p1').value.trim() || 'Pessoa 1';
  const p2Name = document.getElementById('cfg-p2').value.trim() || 'Pessoa 2';
  const scriptUrl = document.getElementById('cfg-url').value.trim();
  const pin = document.getElementById('cfg-pin').value.trim();
  const errEl = document.getElementById('auth-error-msg');

  if (!scriptUrl || !pin) {
    errEl.textContent = 'Preencha a URL do Script e a Senha do Casal.';
    errEl.classList.remove('hidden');
    return;
  }

  errEl.classList.add('hidden');
  const btn = document.getElementById('btn-connect-cloud');
  btn.textContent = 'Conectando...';
  btn.disabled = true;

  cloudCfg = { p1Name, p2Name, scriptUrl, pin };
  const ok = await pullFromCloud(true);

  btn.textContent = '🔗 Conectar e Sincronizar Agora';
  btn.disabled = false;

  if (ok) {
    localStorage.setItem(LOCAL_CFG_KEY, JSON.stringify(cloudCfg));
    document.getElementById('auth-modal').classList.add('hidden');
    renderAll();
  }
}