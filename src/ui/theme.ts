import type { Member } from '../domain/types';

export type ThemeId = 'aurora' | 'vidro' | 'holo' | 'riso' | 'reserva';
export interface Theme { id: ThemeId; name: string; blurb: string; couple: [string, string] | null; meta: string }

/** couple: quando o estilo define as cores das duas pessoas (senão, vale a cor que cada um escolheu). */
export const THEMES: Theme[] = [
  { id: 'aurora', name: 'Aurora', blurb: 'O atual: vidro escuro e neon nas cores de vocês.', couple: null, meta: '#060912' },
  { id: 'vidro', name: 'Vidro', blurb: 'Inspirado no vidro líquido da Apple: painéis translúcidos sobre um fundo vivo, barra flutuante e modo claro/escuro junto com o celular.', couple: ['#0A84FF', '#FF375F'], meta: '#D9E3F4' },
  { id: 'holo', name: 'Holográfico', blurb: 'Claro e perolado. O resumo do mês é um cartão de folha iridescente que muda de cor quando você mexe.', couple: ['#2F7BFF', '#FF5CA8'], meta: '#ECEFF6' },
  { id: 'riso', name: 'Risografia', blurb: 'Parece impresso: papel com grão, duas tintas — uma de cada um — que se misturam onde as contas são do casal.', couple: ['#2D5BE3', '#FF4FA3'], meta: '#E7EAEE' },
  { id: 'reserva', name: 'Reserva', blurb: 'Noite de vinho e ouro, números com serifa. Elegante como um banco privado.', couple: ['#E3BC72', '#E58FA6'], meta: '#12080F' }
];

const KEY = 'fad_theme';
export function initialTheme(): ThemeId {
  const q = new URLSearchParams(location.search).get('visual');
  if (q && THEMES.some(t => t.id === q)) return q as ThemeId;
  try { const s = localStorage.getItem(KEY); if (s && THEMES.some(t => t.id === s)) return s as ThemeId; } catch { /* sem storage */ }
  return 'aurora';
}

let current: ThemeId = initialTheme();
export const currentTheme = () => current;
export function applyTheme(id: ThemeId) {
  current = id;
  document.documentElement.dataset.theme = id;
  try { localStorage.setItem(KEY, id); } catch { /* sem storage */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES.find(t => t.id === id)!.meta);
}

/** Cor de uma pessoa no estilo atual. A ordem no casal decide qual tinta cada um recebe. */
export function memberColor(m: Member | null | undefined, members: Member[]): string {
  if (!m) return 'var(--duo)';
  const t = THEMES.find(x => x.id === current)!;
  if (!t.couple) return m.color;
  const i = Math.max(0, members.findIndex(x => x.id === m.id));
  return t.couple[i % 2];
}

/** Cor de categoria/pessoa usada como texto: em fundo claro, puxa para a cor do texto para continuar legível. */
export const tint = (c: string) => `color-mix(in oklab, ${c} var(--tint), rgb(var(--c-mist1)))`;

/* Cores de categoria: cada estilo tem a sua paleta (tintas de riso, pedras preciosas...). */
const SEED = ['#60A5FA', '#4BE3A6', '#FB923C', '#FFC861', '#FB7185', '#F472B6', '#C084FC', '#2DD4BF', '#A78BFA', '#22D3EE', '#84CC16', '#94A3B8', '#FACC15', '#38BDF8'];
const PALETTES: Partial<Record<ThemeId, string[]>> = {
  riso: ['#2D5BE3', '#00A95C', '#FF6C2F', '#FFB511', '#E3242B', '#FF4FA3', '#765BA7', '#00838A', '#5E6AD2', '#0078BF', '#7A9A01', '#88898A', '#F7B500', '#3D9BE9'],
  reserva: ['#7FA7D9', '#6FBF97', '#D08B5B', '#E3BC72', '#C0506A', '#E58FA6', '#A98BD1', '#5FB3A7', '#B79BE0', '#8CC4D8', '#A8A85C', '#9C8A80', '#E8CF7A', '#86B7D6'],
  vidro: ['#0A84FF', '#30D158', '#FF9F0A', '#FFD60A', '#FF453A', '#FF375F', '#BF5AF2', '#40C8E0', '#5E5CE6', '#64D2FF', '#63E6BE', '#8E8E93', '#FFCC00', '#007AFF'],
  holo: ['#3B82F6', '#10B981', '#F97316', '#EAB308', '#F43F5E', '#EC4899', '#A855F7', '#14B8A6', '#8B5CF6', '#06B6D4', '#65A30D', '#64748B', '#CA8A04', '#0EA5E9']
};
export function catColor(hex: string | null | undefined): string {
  const c = (hex ?? '#94A3B8').toUpperCase();
  const pal = PALETTES[current];
  if (!pal) return c;
  let i = SEED.indexOf(c);
  if (i < 0) { let h = 0; for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) >>> 0; i = h; }
  return pal[i % pal.length];
}
