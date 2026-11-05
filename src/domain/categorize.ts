import type { Category, Nature } from './types';

/** Remove acentos e põe em minúsculas para comparar palavras. */
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Regras por PALAVRA INTEIRA (o app antigo comparava pedaços: "depósito" virava Educação por conter "pos").
 * Chave = nome da categoria padrão. Termos com espaço são comparados como expressão.
 */
export const RULES: { cat: string; nature: Nature; words: string[] }[] = [
  { cat: 'Moradia & Contas', nature: 'fixed', words: ['aluguel', 'condominio', 'iptu', 'luz', 'energia', 'copel', 'agua', 'sanepar', 'internet', 'fibra', 'ifibra', 'gas', 'celular', 'telefone', 'claro', 'vivo', 'tim'] },
  { cat: 'Mercado', nature: 'variable', words: ['mercado', 'supermercado', 'atacadao', 'assai', 'padaria', 'acougue', 'feira', 'hortifruti', 'condor', 'muffato', 'compras'] },
  { cat: 'Restaurantes & Delivery', nature: 'variable', words: ['ifood', 'restaurante', 'lanche', 'pizza', 'burger', 'hamburguer', 'jantar', 'almoco', 'cafe', 'acai', 'sushi', 'churrascaria', 'pastel', 'sorvete', 'delivery', 'mcdonalds', 'bk'] },
  { cat: 'Transporte', nature: 'variable', words: ['uber', '99', 'gasolina', 'etanol', 'posto', 'combustivel', 'estacionamento', 'pedagio', 'oficina', 'pneu', 'oleo', 'ipva', 'onibus', 'seguro do carro', 'mecanico'] },
  { cat: 'Saúde', nature: 'variable', words: ['farmacia', 'drogaria', 'panvel', 'raia', 'nissei', 'medico', 'consulta', 'exame', 'dentista', 'psicologo', 'terapia', 'remedio', 'plano de saude', 'unimed'] },
  { cat: 'Roupas', nature: 'variable', words: ['roupa', 'roupas', 'tenis', 'sapato', 'camisa', 'camiseta', 'calca', 'vestido', 'jaqueta', 'blusa', 'renner', 'riachuelo', 'zara', 'shein', 'nike', 'adidas', 'centauro', 'c&a'] },
  { cat: 'Beleza & Academia', nature: 'variable', words: ['salao', 'barbeiro', 'barbearia', 'cabelo', 'corte', 'unha', 'manicure', 'maquiagem', 'perfume', 'boticario', 'natura', 'academia', 'smartfit', 'whey', 'creatina', 'suplemento'] },
  { cat: 'Educação', nature: 'fixed', words: ['faculdade', 'campo real', 'unicentro', 'curso', 'livro', 'apostila', 'udemy', 'alura', 'mensalidade', 'pos graduacao'] },
  { cat: 'Assinaturas', nature: 'fixed', words: ['netflix', 'spotify', 'prime', 'amazon prime', 'disney', 'hbo', 'max', 'youtube', 'icloud', 'google one', 'chatgpt', 'claude', 'psn', 'playstation', 'xbox', 'gamepass', 'steam', 'deezer', 'globoplay'] },
  { cat: 'Lazer & Viagens', nature: 'variable', words: ['cinema', 'ingresso', 'bar', 'chopp', 'cerveja', 'show', 'viagem', 'hotel', 'airbnb', 'passagem', 'presente', 'passeio', 'churrasco', 'festa'] },
  { cat: 'Pets & Casa', nature: 'variable', words: ['pet', 'petshop', 'racao', 'veterinario', 'banho e tosa', 'moveis', 'decoracao', 'eletro', 'ferramenta', 'limpeza', 'leroy'] },
  { cat: 'Investimentos', nature: 'variable', words: ['reserva', 'cdi', 'cdb', 'investimento', 'aporte', 'caixinha', 'tesouro', 'acoes', 'fii', 'poupanca'] },
  { cat: 'Salário', nature: 'fixed', words: ['salario', 'pagamento', 'holerite', 'adiantamento', 'vale'] },
  { cat: 'Renda extra', nature: 'variable', words: ['freela', 'freelance', 'bonus', 'venda', 'vendi', 'pix recebido', 'reembolso', 'cashback', 'recebi'] }
];

const hasWord = (text: string, w: string) => {
  const esc = norm(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(text);
};

/** Escolhe a categoria: primeiro o nome de uma categoria do casal (inclui as personalizadas), depois as regras. */
export function categorize(text: string, cats: Category[]): { category: Category | null; nature: Nature | null } {
  const t = norm(text);
  const active = cats.filter(c => !c.archived);
  const byName = active.find(c => norm(c.name).split(/[^a-z0-9]+/).filter(w => w.length > 3).some(w => hasWord(t, w)));
  for (const r of RULES) {
    if (r.words.some(w => hasWord(t, w))) {
      const c = active.find(c => c.name === r.cat);
      if (c) return { category: c, nature: c.kind === 'expense' ? r.nature : null };
    }
  }
  if (byName) return { category: byName, nature: byName.kind === 'expense' ? 'variable' : null };
  return { category: null, nature: null };
}
