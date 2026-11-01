const LOCAL_CFG_KEY = 'financas_casal_cfg_cloud_v5';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MONTH_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

// 14 Categorias Completas
const CATEGORIES_LIST = [
  { value: 'Moradia & Contas', label: 'Moradia & Contas', color: '#60a5fa', icon: 'home' },
  { value: 'Alimentação & Mercado', label: 'Alimentação & Mercado', color: '#34d399', icon: 'cart' },
  { value: 'Delivery & Restaurantes', label: 'Delivery & Restaurantes', color: '#fb923c', icon: 'utensils' },
  { value: 'Transporte & Combustível', label: 'Transporte & Combustível', color: '#fbbf24', icon: 'car' },
  { value: 'Saúde & Farmácia', label: 'Saúde & Farmácia', color: '#fb7185', icon: 'pill' },
  { value: 'Roupas & Acessórios', label: 'Roupas & Acessórios', color: '#f472b6', icon: 'shirt' },
  { value: 'Beleza & Cuidados', label: 'Beleza, Cabelo & Academia', color: '#c084fc', icon: 'sparkles' },
  { value: 'Educação & Cursos', label: 'Educação & Faculdade', color: '#2dd4bf', icon: 'book' },
  { value: 'Assinaturas & Streaming', label: 'Assinaturas & Streaming', color: '#a78bfa', icon: 'film' },
  { value: 'Lazer & Casal', label: 'Lazer, Viagens & Casal', color: '#22d3ee', icon: 'gamepad' },
  { value: 'Pets & Casa', label: 'Pets, Móveis & Manutenção', color: '#84cc16', icon: 'paw' },
  { value: 'Investimentos', label: 'Investimentos & Caixinha', color: '#38bdf8', icon: 'trend' },
  { value: 'Renda Extra', label: 'Renda Extra', color: '#facc15', icon: 'wallet' },
  { value: 'Outros', label: 'Outros', color: '#94a3b8', icon: 'box' }
];
const catMeta = n => CATEGORIES_LIST.find(c => c.value === n) || CATEGORIES_LIST[CATEGORIES_LIST.length - 1];
const catColor = n => catMeta(n).color;

// Dicionário de Auto-Categorização Inteligente
const RULES = [
  { k: ['aluguel', 'condominio', 'condomínio', 'iptu', 'luz', 'energia', 'copel', 'agua', 'sanepar', 'internet', 'fibra', 'gas', 'gás'], cat: 'Moradia & Contas', type: 'expense_fixed' },
  { k: ['mercado', 'supermercado', 'atacadao', 'atacadão', 'assai', 'padaria', 'acougue', 'açougue', 'feira', 'hortifruti'], cat: 'Alimentação & Mercado', type: 'expense_fixed' },
  { k: ['ifood', 'restaurante', 'lanche', 'pizza', 'burger', 'hamburguer', 'jantar', 'almoco', 'almoço', 'cafe', 'café', 'acai', 'açaí', 'sushi', 'churrascaria'], cat: 'Delivery & Restaurantes', type: 'expense_variable' },
  { k: ['uber', '99', 'gasolina', 'etanol', 'posto', 'combustivel', 'combustível', 'estacionamento', 'pedagio', 'pedágio', 'oficina', 'pneu', 'oleo', 'ipva', 'onibus'], cat: 'Transporte & Combustível', type: 'expense_fixed' },
  { k: ['farmacia', 'farmácia', 'drogaria', 'panvel', 'raia', 'nissei', 'medico', 'médico', 'consulta', 'exame', 'dentista', 'psicologo', 'terapia', 'remedio', 'remédio', 'saude', 'saúde', 'plano de saude'], cat: 'Saúde & Farmácia', type: 'expense_fixed' },
  { k: ['roupa', 'tenis', 'tênis', 'sapato', 'calcado', 'calçado', 'camisa', 'camiseta', 'calca', 'calça', 'vestido', 'jaqueta', 'blusa', 'renner', 'c&a', 'riachuelo', 'zara', 'shein', 'nike', 'adidas', 'centauro'], cat: 'Roupas & Acessórios', type: 'expense_variable' },
  { k: ['salao', 'salão', 'barbeiro', 'barbearia', 'cabelo', 'corte', 'unha', 'manicure', 'maquiagem', 'perfume', 'cosmetico', 'boticario', 'natura', 'academia', 'smartfit', 'whey', 'creatina', 'suplemento'], cat: 'Beleza & Cuidados', type: 'expense_variable' },
  { k: ['faculdade', 'campo real', 'unicentro', 'curso', 'livro', 'apostila', 'udemy', 'alura', 'mensalidade', 'pos'], cat: 'Educação & Cursos', type: 'expense_fixed' },
  { k: ['netflix', 'spotify', 'prime', 'amazon prime', 'disney', 'hbo', 'max', 'youtube', 'icloud', 'google one', 'chatgpt', 'psn', 'playstation', 'xbox', 'gamepass', 'steam'], cat: 'Assinaturas & Streaming', type: 'expense_variable' },
  { k: ['cinema', 'ingresso', 'bar', 'chopp', 'cerveja', 'show', 'viagem', 'hotel', 'airbnb', 'passagem', 'presente', 'passeio', 'churrasco'], cat: 'Lazer & Casal', type: 'expense_variable' },
  { k: ['pet', 'racao', 'ração', 'veterinario', 'veterinário', 'banho e tosa', 'moveis', 'móveis', 'decoracao', 'eletro', 'ferramenta', 'limpeza'], cat: 'Pets & Casa', type: 'expense_variable' },
  { k: ['reserva', 'cdi', 'cdb', 'investimento', 'caixinha', 'tesouro', 'meta', 'acoes', 'fii', 'poupanca'], cat: 'Investimentos', type: 'investment' }
];

// Estado Global
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let categoryChartInstance = null;
let annualChartInstance = null;
let isSyncing = false;

let state = {
  splitMode: '50_50',
  salariesP1: {},
  salariesP2: {},
  cards: [{ id: 1, name: 'Cartão Principal', limit: 4000, dueDay: 10 }],
  transactions: []
};

// Utilitários de Segurança e Formatação
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function getMonthKey(y, m) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function addMonthsToYearMonth(year, monthIdx, offset) {
  const total = year * 12 + monthIdx + offset;
  return getMonthKey(Math.floor(total / 12), total % 12);
}

function inferCategory(desc) {
  const l = desc.toLowerCase();
  for (const r of RULES) {
    if (r.k.some(w => l.includes(w))) return { category: r.cat, type: r.type };
  }
  return { category: 'Outros', type: 'expense_variable' };
}
const catLabel = n => (CATEGORIES_LIST.find(c => c.value === n) || {}).label || n;
