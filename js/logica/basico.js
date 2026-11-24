/* Lógica pura: texto, números, datas, códigos, chave de acesso, referência da MB51, tipo de operação e nomes de pasta. */

// ---------------------------------------------------------------- texto
const ICON_RE = /@[0-9A-Z]{2}(?:\\Q([^@]*))?@/g; // ícones do SAP: @5C@ ou @5C\QTexto@

export function cleanText(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  s = s.replace(ICON_RE, (m, info) => (info ? info : ''));
  s = s.replace(/[\u00a0\s]+/g, ' ').trim();
  return s;
}

export function norm(s) {
  return String(s == null ? '' : s)
    .replace(/[º°ª]/g, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function stripZeros(s) {
  const t = String(s || '').replace(/^0+/, '');
  return t === '' && String(s || '') !== '' ? '0' : t;
}

export function colLetter(i) {
  let s = '';
  i += 1;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

// ---------------------------------------------------------------- números
export function parseNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = cleanText(v).replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) return null;
  let neg = false;
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) {
    s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lc >= 0) {
    s = (s.match(/,/g).length > 1) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (ld >= 0) {
    if (s.match(/\./g).length > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

// ---------------------------------------------------------------- datas
function pad2(n) { return String(n).padStart(2, '0'); }

function ymd(y, m, d) {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function serialToISO(n) {
  const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function isoToSerial(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

// Aceita: número serial do Excel, AAAAMMDD (texto ou número), AAAA-MM-DD, dd/mm/aaaa, dd.mm.aaaa, dd/mm/aa.
// Devolve 'AAAA-MM-DD' ou null. Data zerada do SAP (ex.: 693595-, 00.00.0000) vira null.
export function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return null;
    if (Number.isInteger(v) && v >= 19000101 && v <= 21001231) {
      const r = ymd(Math.floor(v / 10000), Math.floor(v / 100) % 100, v % 100);
      if (r) return r;
    }
    if (v >= 18264 && v <= 73050) return serialToISO(v); // 1950 a 2099
    return null;
  }
  const s = cleanText(v);
  if (!s) return null;
  if (s.endsWith('-')) return null;
  if (/^0+([./-]0+)*(\s.*)?$/.test(s)) return null;
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ymd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?!\d)/))) {
    if (m[3].length === 3) return null;
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return ymd(y, +m[2], +m[1]);
  }
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    return ymd(+m[1], +m[2], +m[3]) || ymd(+s.slice(4, 8), +s.slice(2, 4), +s.slice(0, 2));
  }
  if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s));
  return null;
}

// ---------------------------------------------------------------- códigos e chave
export function parseCodigo(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    v = Number.isInteger(v) ? v.toFixed(0) : String(v);
  }
  const s = cleanText(v);
  if (/^\d+$/.test(s)) return stripZeros(s);
  return s;
}

export function parseCnpj(v) {
  if (v === null || v === undefined || v === '') return '';
  let s = typeof v === 'number' ? v.toFixed(0) : String(v);
  s = s.replace(/\D/g, '');
  if (s.length >= 11 && s.length < 14) s = s.padStart(14, '0');
  return s;
}

export function parseChave(v) {
  if (v === null || v === undefined || v === '') return { chave: '', problema: null };
  if (typeof v === 'number') return { chave: '', problema: 'chave gravada como número no Excel (dígitos perdidos)' };
  const s = String(v).replace(/\s+/g, '');
  const m = s.match(/\d{44}/);
  if (m) return { chave: m[0], problema: null };
  if (/\d[.,]\d+E\+?\d+/i.test(s)) return { chave: '', problema: 'chave gravada como número no Excel (dígitos perdidos)' };
  return { chave: '', problema: /\d/.test(s) ? 'chave sem 44 dígitos' : null };
}

export function dvChave(base43) {
  let w = 2, sum = 0;
  for (let i = 42; i >= 0; i--) { sum += Number(base43[i]) * w; w = w === 9 ? 2 : w + 1; }
  const r = sum % 11;
  return (r === 0 || r === 1) ? 0 : 11 - r;
}

export function chaveValida(ch) {
  return /^\d{44}$/.test(ch) && dvChave(ch.slice(0, 43)) === Number(ch[43]);
}

export function decomporChave(ch) {
  if (!/^\d{44}$/.test(ch || '')) return null;
  return {
    uf: ch.slice(0, 2), aamm: ch.slice(2, 6), cnpj: ch.slice(6, 20), modelo: ch.slice(20, 22),
    serie: ch.slice(22, 25), numero: ch.slice(25, 34), tpEmis: ch.slice(34, 35), codigo: ch.slice(35, 43), dv: ch.slice(43)
  };
}

export const UFS = { '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO', '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF' };

// Referência da MB51: "000128443-001" -> número 128443, série 1
export function parseReferencia(ref) {
  const s = cleanText(ref);
  if (!s) return { numero: '', serie: '' };
  let m = s.match(/^0*(\d{1,9})\s*[-/]\s*0*(\d{1,3})$/);
  if (m) return { numero: m[1], serie: m[2] };
  m = s.match(/^0*(\d{1,9})$/);
  if (m) return { numero: m[1], serie: '' };
  m = s.match(/(\d{1,12})\s*-\s*(\d{1,3})\s*$/);
  if (m) return { numero: stripZeros(m[1]), serie: stripZeros(m[2]) };
  return { numero: '', serie: '' };
}

// Primeiro número de um código: "03 - Recusa" -> "3"; "101" -> "101"; "00" -> "0"
export function codigoInicial(v) {
  const m = cleanText(v).match(/^0*(\d+)/);
  return m ? m[1] : '';
}

// Tipo de operação sugerido pela natureza da operação (a ordem das regras importa).
// A mesma regra existe em SQL (SQL.tipoOperacaoSQL); o autoteste compara as duas.
export const REGRAS_OPERACAO = [
  ['conserto|reparo', 'Conserto'], ['devolu', 'Devolução'], ['contaeordem', 'Remessa por conta e ordem'], ['entregafutura', 'Entrega futura'],
  ['retorno', 'Retorno'], ['transfer', 'Transferência'], ['comodato', 'Comodato'], ['bonifica|brinde|amostra', 'Bonificação ou amostra'],
  ['remessa', 'Remessa'], ['transporte|frete', 'Frete'], ['compra|venda|aquisicao', 'Compra']
];
export function tipoOperacao(natureza) {
  const n = norm(natureza);
  if (!n) return '';
  for (const [re, tipo] of REGRAS_OPERACAO) if (new RegExp(re).test(n)) return tipo;
  return 'Outra';
}
export const TIPOS_OPERACAO = ['Compra', 'Devolução', 'Retorno', 'Remessa', 'Conserto', 'Remessa por conta e ordem', 'Entrega futura', 'Transferência', 'Comodato', 'Bonificação ou amostra', 'Frete', 'Solicitado cancelamento', 'Outra'];

// Códigos de manifestação do VT IN (inferidos dos dados em 14/11/2026, a confirmar)
export const MANIFESTACAO = { '5': 'Confirmação da operação', '1': 'Ciência da operação', '3': 'Recusa (desconhecimento ou operação não realizada)', '4': 'Código 04 (significado a confirmar)', '0': 'Sem manifestação', '20': 'Prestação de serviço em desacordo' };

// ---------------------------------------------------------------- pasta de digitalizadas
export function dataDePasta(seg, ano, dataModISO) {
  const s = String(seg).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?!\d)/))) return ymd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[._-](\d{1,2})[._-](\d{4})(?!\d)/))) return ymd(+m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})[._-](\d{1,2})[._-](\d{2})(?!\d)/))) return ymd(2000 + Number(m[3]), +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})[._-](\d{1,2})(?![\d._-])/))) {
    const y = ano ? Number(ano) : (dataModISO ? Number(dataModISO.slice(0, 4)) : null);
    return y ? ymd(y, +m[2], +m[1]) : null;
  }
  return null;
}

export function parsePasta(caminho, nome, dataModISO) {
  const path = String(caminho || '').replace(/\//g, '\\');
  const partes = path.split('\\').filter(Boolean);
  let arquivo = cleanText(nome);
  let pastas;
  if (!arquivo) { arquivo = partes[partes.length - 1] || ''; pastas = partes.slice(0, -1); }
  else pastas = (partes.length && partes[partes.length - 1] === arquivo) ? partes.slice(0, -1) : partes;
  const ext = ((arquivo.match(/\.([A-Za-z0-9]{1,5})$/) || [])[1] || '').toLowerCase();
  const pn = norm(pastas.join(' '));
  const classificacao = /debitodireto|debdireto/.test(pn) ? 'Débito direto' : (/estoque/.test(pn) ? 'Estoque' : '');
  const anoCaminho = (pastas.join('\\').match(/(?:^|\D)(20\d{2})(?:\D|$)/) || [])[1] || '';
  let data = null;
  for (let i = pastas.length - 1; i >= 0 && !data; i--) data = dataDePasta(pastas[i], anoCaminho, dataModISO);
  const base = arquivo.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const chave = (base.match(/\d{44}/) || [])[0] || '';
  let resto = chave ? base.replace(chave, ' ') : base;
  const ped = (resto.match(/(?:^|\D)(45\d{8})(?!\d)/) || [])[1] || '';
  if (ped) resto = resto.replace(ped, ' ');
  const num = (resto.match(/(?:^|\D)(\d{1,9})(?!\d)/) || [])[1] || '';
  const tipo = /^\s*ct-?e\b/i.test(base) ? 'CT-e' : 'NF-e';
  return {
    nome_arquivo: arquivo, extensao: ext, tipo_doc: tipo, classificacao_pasta: classificacao,
    data_pasta: data || '', chave, numero_nf: num ? stripZeros(num) : '', pedido: ped
  };
}
