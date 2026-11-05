/** Meses são guardados como 'YYYY-MM-01'. Datas como 'YYYY-MM-DD'. Tudo em horário local, sem fuso. */
export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MONTHS_SHORT = MONTHS.map(m => m.slice(0, 3));

const pad = (n: number) => String(n).padStart(2, '0');
export const monthOf = (y: number, m0: number) => {
  const t = y * 12 + m0;
  return `${Math.floor(t / 12)}-${pad((t % 12 + 12) % 12 + 1)}-01`;
};
export const parts = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return { y, m0: m - 1, d: dd || 1 }; };
export const addMonths = (month: string, n: number) => { const p = parts(month); return monthOf(p.y, p.m0 + n); };
export const monthStart = (date: string) => date.slice(0, 7) + '-01';
export const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();
export const isoDate = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
export const today = () => isoDate(new Date());
export const thisMonth = () => monthStart(today());
export const dateIn = (month: string, day: number) => { const p = parts(month); return `${month.slice(0, 8)}${pad(Math.min(day, daysInMonth(p.y, p.m0)))}`; };
export const monthLabel = (month: string) => { const p = parts(month); return `${MONTHS[p.m0]} ${p.y}`; };
export const monthShortLabel = (month: string) => { const p = parts(month); return `${MONTHS_SHORT[p.m0]}/${String(p.y).slice(2)}`; };
export const dayLabel = (date: string) => {
  const t = today(), y = isoDate(new Date(Date.now() - 864e5));
  if (date === t) return 'Hoje';
  if (date === y) return 'Ontem';
  const dt = new Date(date + 'T12:00');
  const l = dt.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '');
  return l[0].toUpperCase() + l.slice(1);
};
