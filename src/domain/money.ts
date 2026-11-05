/** Dinheiro sempre arredondado a centavos para não acumular erro de ponto flutuante. */
export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const sum = <T>(arr: T[], f: (x: T) => number) => round2(arr.reduce((s, x) => s + f(x), 0));

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmt = (v: number) => brl.format(round2(v || 0));
export const fmtShort = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + 'mi';
  if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace('.', ',') + 'k';
  return String(Math.round(v));
};

/** Divide um total em n parcelas sem perder centavos: a 1ª parcela absorve a diferença. 100/3 → 33,34 + 33,33 + 33,33 */
export function splitInstallments(total: number, n: number): number[] {
  const cents = Math.round(total * 100), base = Math.floor(cents / n), rest = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i === 0 ? rest : 0)) / 100);
}

/** Lê valores digitados no padrão brasileiro ou americano: "1.234,56", "1234.56", "85,9", "R$ 40" */
export function parseAmount(s: string): number | null {
  let t = s.replace(/[R$\s]/gi, '');
  if (!/\d/.test(t)) return null;
  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.');
  if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma) {
    // "1.234" (milhar) vs "12.5" (decimal): 3 dígitos após o ponto e sem vírgula = milhar
    const after = t.length - lastDot - 1;
    t = lastComma === -1 && after === 3 ? t.replace(/\./g, '') : t.replace(/,/g, '');
  }
  const v = parseFloat(t);
  return isFinite(v) ? round2(v) : null;
}
