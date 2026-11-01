/**
 * Finanças a Dois — backend v2
 *  - Senha enviada por POST (não aparece mais na URL). O GET com senha só funciona se PERMITIR_GET_LEGADO = true.
 *  - Trava de escrita (LockService) + checagem de versão ("base"): duas pessoas gravando ao mesmo tempo não se sobrescrevem.
 *  - Dados em blocos de 40.000 caracteres (a célula do Google Sheets aceita no máximo 50.000).
 *  - Bloqueio de 10 minutos após 10 senhas erradas.
 * @OnlyCurrentDoc
 */
const SENHA_CASAL = "";            // <-- COLOQUE SUA SENHA AQUI (vazio = o script recusa tudo)
const PERMITIR_GET_LEGADO = true;  // depois de atualizar o app nos dois celulares, mude para false
const TAM_BLOCO = 40000;
const ESTADO_PADRAO = { splitMode: "50_50", salariesP1: {}, salariesP2: {}, transactions: [] };

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.pin === undefined) return responderJSON({ status: "ok", version: 2 }); // o app usa isto para saber que o script é novo
    if (!PERMITIR_GET_LEGADO) return responderJSON({ error: "Atualize o app: este script não aceita mais senha na URL." });
    const erro = autenticar(p.pin);
    if (erro) return responderJSON({ error: erro });
    return responderJSON({ status: "ok", data: lerEstado(planilha()) || ESTADO_PADRAO });
  } catch (err) {
    return responderJSON({ error: "Erro ao ler dados: " + err });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const erro = autenticar(body && body.pin);
    if (erro) return responderJSON({ error: erro });

    if (body.action === "get") return responderJSON({ status: "ok", data: lerEstado(planilha()) || ESTADO_PADRAO });

    if (!body.data || !Array.isArray(body.data.transactions)) {
      return responderJSON({ error: "Dados inválidos: gravação recusada para proteger a planilha." });
    }
    return responderJSON(salvarEstado(planilha(), body.data, body.base));
  } catch (err) {
    return responderJSON({ error: "Erro ao salvar: " + err });
  }
}

function planilha() { return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet(); }

function autenticar(pin) {
  if (!SENHA_CASAL) return "Defina SENHA_CASAL no script antes de usar.";
  const cache = CacheService.getScriptCache();
  const falhas = Number(cache.get("falhas") || 0);
  if (falhas >= 10) return "Muitas tentativas incorretas. Aguarde 10 minutos.";
  if (String(pin === undefined || pin === null ? "" : pin) !== SENHA_CASAL) {
    cache.put("falhas", String(falhas + 1), 600);
    return "Acesso negado: Senha incorreta.";
  }
  if (falhas) cache.remove("falhas");
  return null;
}

function lerEstado(sheet) {
  const ultima = sheet.getLastRow();
  if (ultima < 1) return null;
  const texto = sheet.getRange(1, 1, ultima, 1).getValues().map(function (r) { return r[0]; }).join("");
  return texto ? JSON.parse(texto) : null; // funciona também com o formato antigo (tudo em A1)
}

function salvarEstado(sheet, data, base) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (base !== undefined) { // o app informa a versão em que se baseou; se mudou, ele refaz a alteração
      const atual = lerEstado(sheet);
      const w = atual && atual._wids && atual._wids.length ? atual._wids[atual._wids.length - 1] : null;
      if (w !== base) return { conflict: true };
    }
    const texto = JSON.stringify(data), blocos = [];
    for (let i = 0; i < texto.length; i += TAM_BLOCO) blocos.push([texto.substring(i, i + TAM_BLOCO)]);
    const faixa = sheet.getRange(1, 1, blocos.length, 1);
    faixa.setNumberFormat("@"); // texto puro: impede o Sheets de converter blocos em número ou fórmula
    faixa.setValues(blocos);
    const ultima = sheet.getLastRow();
    if (ultima > blocos.length) sheet.getRange(blocos.length + 1, 1, ultima - blocos.length, 1).clearContent();
    sheet.getRange("B1").setValue("Última sincronização: " + new Date().toLocaleString("pt-BR"));
    return { status: "salvo" };
  } finally {
    lock.releaseLock();
  }
}

function responderJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
