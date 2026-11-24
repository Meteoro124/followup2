/* Lógica pura: leitura de texto delimitado (CSV, TXT, "xls" em texto do SAP) e dos XML de NF-e e CT-e. */
import { cleanText, stripZeros } from './basico.js';

// ---------------------------------------------------------------- texto delimitado (CSV, TXT, "xls" texto do SAP)
export function decodeBytes(bytes) {
  let u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^\uFEFF/, ''); }
  catch (e) { return new TextDecoder('windows-1252').decode(u8).replace(/^\uFEFF/, ''); }
}

export function looksLikeText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4B && u8[2] === 0x03 && u8[3] === 0x04) return false; // xlsx (zip)
  if (u8.length >= 4 && u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) return false; // xls binário
  const head = decodeBytes(u8.slice(0, 2048)).trimStart().toLowerCase();
  if (head.startsWith('<') || head.startsWith('mime-version')) return false; // HTML/MHTML: deixa para o SheetJS
  let ctrl = 0;
  for (let i = 0; i < Math.min(u8.length, 4096); i++) { const c = u8[i]; if (c < 9 || (c > 13 && c < 32)) ctrl++; }
  return ctrl < 5;
}

function splitLine(line, delim) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"' && cur === '') q = true;
    else if (c === delim) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function guessDelimiter(lines) {
  const cands = ['\t', ';', ',', '|'];
  let best = ',', bestScore = -1;
  for (const d of cands) {
    const counts = lines.slice(0, 10).map(l => splitLine(l, d).length - 1).filter(n => n > 0);
    if (!counts.length) continue;
    const max = Math.max(...counts);
    const score = counts.filter(n => n === max).length * 100 + max;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

export function parseDelimited(text) {
  const t = String(text).replace(/^\uFEFF/, '');
  // junta linhas com aspas abertas (campo com quebra de linha)
  const raw = t.split(/\r\n|\n|\r/);
  const lines = [];
  let buf = null;
  for (const l of raw) {
    if (buf !== null) { buf += '\n' + l; if ((buf.match(/"/g) || []).length % 2 === 0) { lines.push(buf); buf = null; } continue; }
    if ((l.match(/"/g) || []).length % 2 === 1) { buf = l; continue; }
    lines.push(l);
  }
  if (buf !== null) lines.push(buf);
  const nonEmpty = lines.filter(l => l.trim() !== '');
  const delim = guessDelimiter(nonEmpty);
  const aoa = [];
  for (const l of lines) {
    if (l.trim() === '') continue;
    if (delim === '|' && /^[\s|-]+$/.test(l)) continue; // linhas de traços da lista do SAP
    let cells = splitLine(l, delim);
    if (delim === '|') { if (cells[0].trim() === '') cells = cells.slice(1); if (cells.length && cells[cells.length - 1].trim() === '') cells = cells.slice(0, -1); }
    aoa.push(cells.map(c => c.trim()));
  }
  return { aoa, delim };
}

function csvField(v) {
  if (v === null || v === undefined || v === '') return '';
  return '"' + String(v).replace(/"/g, '""') + '"';
}

export function toCSV(columns, rows) {
  const out = [columns.map(csvField).join(',')];
  for (const r of rows) out.push(columns.map(c => csvField(r[c])).join(','));
  return out.join('\n');
}

// ---------------------------------------------------------------- XML de NF-e e CT-e (exportados do VT IN)
// Leitura por expressões regulares, sem DOM: funciona no navegador e em testes fora dele.
// Só os campos usados no follow-up são extraídos; CPF de pessoa física nunca é guardado.
const XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function xmlTexto(s) {
  const t = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
      if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
      return XML_ENT[e.toLowerCase()] || m;
    });
  return cleanText(t);
}
function xmlBlocos(xml, tag) {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'g');
  const out = []; let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}
const xmlBloco = (xml, tag) => xmlBlocos(xml, tag)[0] || '';
const xmlValor = (xml, tag) => xmlTexto(xmlBloco(xml, tag));
const xmlNumero = (s) => { const n = Number(String(s || '').trim()); return s !== '' && Number.isFinite(n) ? n : ''; };
const distintos = (arr) => Array.from(new Set(arr.filter(Boolean)));

// Pedido de compra escrito pelo fornecedor: prefere o número de pedido SAP (45 + 8 dígitos).
export function pedidoDeTexto(s) {
  const t = cleanText(s);
  if (!t) return '';
  const m = t.match(/(?:^|\D)(45\d{8})(?!\d)/);
  if (m) return m[1];
  if (/^\d+$/.test(t)) return stripZeros(t);
  return t.slice(0, 30);
}
// Na observação (texto livre) só vale o número no formato de pedido SAP.
export function pedidoNaObservacao(s) { const m = cleanText(s).match(/(?:^|\D)(45\d{8})(?!\d)/); return m ? m[1] : ''; }

export const MOD_FRETE = { '0': 'Emitente (CIF)', '1': 'Destinatário (FOB)', '2': 'Terceiros', '3': 'Próprio do remetente', '4': 'Próprio do destinatário', '9': 'Sem transporte' };

// Devolve um objeto com os campos de XML_COLS, ou { tipo_doc: '' } quando o arquivo não é NF-e nem CT-e.
export function lerXmlFiscal(texto) {
  const xml = String(texto || '').replace(/^﻿/, '');
  if (/<(?:[\w-]+:)?infCte\b/.test(xml)) {
    const chave = (xml.match(/<(?:[\w-]+:)?infCte\b[^>]*\bId="CTe(\d{44})"/) || [])[1] || (xml.match(/<(?:[\w-]+:)?chCTe>\s*(\d{44})/) || [])[1] || '';
    const ide = xmlBloco(xml, 'ide'), emit = xmlBloco(xml, 'emit');
    const chaves = distintos(xmlBlocos(xml, 'infDoc').join(' ').match(/\d{44}/g) || []);
    return {
      chave, tipo_doc: 'CT-e', data_emissao: (xmlValor(ide, 'dhEmi') || xmlValor(ide, 'dEmi')).slice(0, 10),
      cnpj_emitente: xmlValor(emit, 'CNPJ'), emitente: xmlValor(emit, 'xNome'), natureza: xmlValor(ide, 'natOp'), cfops: xmlValor(ide, 'CFOP'),
      valor: xmlNumero(xmlValor(xmlBloco(xml, 'vPrest'), 'vTPrest')), chaves_nfe: chaves.join(' ')
    };
  }
  if (/<(?:[\w-]+:)?infNFe\b/.test(xml)) {
    const chave = (xml.match(/<(?:[\w-]+:)?infNFe\b[^>]*\bId="NFe(\d{44})"/) || [])[1] || (xml.match(/<(?:[\w-]+:)?chNFe>\s*(\d{44})/) || [])[1] || '';
    const ide = xmlBloco(xml, 'ide'), emit = xmlBloco(xml, 'emit'), dest = xmlBloco(xml, 'dest');
    const transp = xmlBloco(xml, 'transp'), transporta = xmlBloco(transp, 'transporta');
    const compra = xmlBloco(xml, 'compra'), infAdic = xmlBloco(xml, 'infAdic');
    const itens = xmlBlocos(xml, 'det').map(d => { const p = xmlBloco(d, 'prod'); return { cfop: xmlValor(p, 'CFOP'), ped: pedidoDeTexto(xmlValor(p, 'xPed')), item: stripZeros(xmlValor(p, 'nItemPed')) }; });
    const tNome = xmlValor(transporta, 'xNome'), tCnpj = xmlValor(transporta, 'CNPJ'), tCpf = xmlValor(transporta, 'CPF');
    return {
      chave, tipo_doc: 'NF-e', data_emissao: (xmlValor(ide, 'dhEmi') || xmlValor(ide, 'dEmi')).slice(0, 10),
      cnpj_emitente: xmlValor(emit, 'CNPJ'), emitente: xmlValor(emit, 'xNome'), cnpj_destinatario: xmlValor(dest, 'CNPJ'),
      natureza: xmlValor(ide, 'natOp'), cfops: distintos(itens.map(i => i.cfop)).join(' '),
      valor: xmlNumero(xmlValor(xmlBloco(xml, 'ICMSTot'), 'vNF')),
      mod_frete: xmlValor(transp, 'modFrete'),
      tem_transportadora: (tNome || tCnpj || tCpf) ? 'S' : 'N',
      transportadora: tNome || (tCnpj ? 'CNPJ ' + tCnpj : (tCpf ? '(pessoa física)' : '')), cnpj_transportadora: tCnpj,
      pedidos_itens: distintos(itens.map(i => i.ped)).join(' '),
      itens_pedido: distintos(itens.filter(i => i.ped).map(i => `${i.ped}/${i.item || '?'}`)).join(' '),
      pedido_compra: pedidoDeTexto(xmlValor(compra, 'xPed')),
      pedido_obs: pedidoNaObservacao(xmlValor(infAdic, 'infCpl'))
    };
  }
  return { tipo_doc: '' };
}

// Colunas da "planilha" montada a partir dos XML (campo → cabeçalho). Os mesmos nomes são os sinônimos da fonte 'xml'.
export const XML_COLS = [
  ['chave', 'Chave de acesso'], ['tipo_doc', 'Tipo de documento'], ['data_emissao', 'Data de emissão'],
  ['cnpj_emitente', 'CNPJ do emitente'], ['emitente', 'Emitente'], ['cnpj_destinatario', 'CNPJ do destinatário'],
  ['natureza', 'Natureza da operação'], ['cfops', 'CFOP'], ['valor', 'Valor total'], ['mod_frete', 'Modalidade do frete'],
  ['tem_transportadora', 'Transportadora informada'], ['transportadora', 'Transportadora'], ['cnpj_transportadora', 'CNPJ da transportadora'],
  ['pedidos_itens', 'Pedido nos itens (xPed)'], ['itens_pedido', 'Pedido e item (xPed/nItemPed)'], ['pedido_compra', 'Pedido da nota (compra/xPed)'],
  ['pedido_obs', 'Pedido na observação (infCpl)'], ['chaves_nfe', 'NF-e transportadas (CT-e)'], ['arquivo_xml', 'Arquivo']
];

// Um XML → uma linha na ordem de XML_COLS (o texto do arquivo pode ser descartado logo depois).
export function linhaXml(texto, nome) {
  const r = lerXmlFiscal(texto);
  r.arquivo_xml = nome;
  return XML_COLS.map(([k]) => (r[k] === undefined ? '' : r[k]));
}
// arquivos: [{ nome, texto }] → aoa com cabeçalho, pronto para o importador.
export function xmlParaAoa(arquivos) {
  const aoa = [XML_COLS.map(c => c[1])];
  for (const a of arquivos) aoa.push(linhaXml(a.texto, a.nome));
  return aoa;
}
