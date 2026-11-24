/* Lógica pura: definição das fontes (colunas e sinônimos), detecção do cabeçalho, mapeamento e conversão das linhas. */
import { XML_COLS } from './arquivos.js';
import { chaveValida, cleanText, colLetter, decomporChave, norm, parseChave, parseCnpj, parseCodigo, parseDate, parseNumber, parsePasta, parseReferencia, stripZeros } from './basico.js';

// ---------------------------------------------------------------- definição das fontes
// tipo: chave | codigo | cnpj | texto | data | numero
function F(id, rotulo, tipo, sinonimos, extra) { return Object.assign({ id, rotulo, tipo, sinonimos, obrigatorio: false }, extra || {}); }

export const FONTES = [
  {
    id: 'vtin', nome: 'VT IN (monitor de notas)', tabela: 'raw_vtin',
    descricao: 'NF-e e CT-e com chave de acesso, natureza da operação, manifestação, etapa e documentos MIGO/MIRO.',
    chaveGrupo: 'chave',
    campos: [
      F('chave', 'Chave de acesso', 'chave', ['Id - Chave de acesso', 'Chave de acesso', 'Chave acesso', 'Chave NF-e', 'Chave'], { obrigatorio: true }),
      F('numero_nf', 'Número da nota', 'codigo', ['Nº NF', 'Número NF', 'Nº nota fiscal', 'Nota fiscal', 'Número da nota', 'NF']),
      F('serie', 'Série', 'codigo', ['Série', 'Serie NF']),
      F('fornecedor', 'Emitente (nome)', 'texto', ['Nome 1', 'Nome emitente', 'Razão social', 'Emitente', 'Fornecedor', 'Nome do fornecedor']),
      F('cnpj_emitente', 'CNPJ do emitente', 'cnpj', ['CNPJ emitente', 'CNPJ', 'CNPJ/CPF emitente']),
      F('data_emissao', 'Data de emissão', 'data', ['Data documento', 'Data de emissão', 'Data emissão', 'Dt. emissão']),
      F('natureza_operacao', 'Natureza da operação', 'texto', ['Natureza da operação', 'Natureza operação', 'Nat. operação', 'Natureza', 'Descrição da natureza', 'NatOp']),
      F('valor', 'Valor total', 'numero', ['Valor total', 'Valor total incl.imp.', 'Valor total da nota', 'Valor NF', 'Montante']),
      F('num_documento', 'Nº documento (lançamento)', 'codigo', ['Nº documento', 'Número documento', 'Docnum', 'Nº doc.']),
      F('status_sefaz', 'Status SEFAZ', 'texto', ['Status SEFAZ', 'Status Sefaz', 'Status da NF-e', 'Status NF-e', 'Status do documento', 'Cód. status SEFAZ', 'SEFAZ']),
      F('status_manifestacao', 'Status de manifestação', 'texto', ['Status manifestação', 'Manifestação', 'Status manifest.']),
      F('etapa', 'Etapa atual', 'texto', ['Etapa atual', 'Etapa', 'Status processo', 'Etapa do processo']),
      F('doc_migo', 'Doc. material (MIGO)', 'codigo', ['Doc. material', 'Documento material', 'Nº doc. material', 'MIGO']),
      F('data_migo', 'Data lançamento MIGO', 'data', ['Data lançamento [Doc. material]', 'Data lançamento [Documento material]', 'Data lançamento MIGO']),
      F('doc_miro', 'Doc. fatura (MIRO)', 'codigo', ['Doc. fatura', 'Documento de faturamento', 'Doc. faturamento', 'Nº doc. fatura', 'MIRO']),
      F('data_miro', 'Data lançamento MIRO', 'data', ['Data lançamento [Doc. fatura]', 'Data lançamento [Documento de faturamento]', 'Data lançamento MIRO']),
      F('pedido', 'Pedido de compra', 'codigo', ['Pedido', 'Pedido de compras', 'Documento de compras', 'Nº pedido']),
      F('centro', 'Centro', 'codigo', ['Centro', 'Centro destinatário'])
    ],
    derivados: ['modelo', 'dv_ok'],
    derivar(r) {
      const d = decomporChave(r.chave);
      r.modelo = d ? d.modelo : '';
      r.dv_ok = d ? (chaveValida(r.chave) ? 'S' : 'N') : '';
      if (d) { r.numero_nf = stripZeros(d.numero); r.serie = stripZeros(d.serie); if (!r.cnpj_emitente) r.cnpj_emitente = d.cnpj; }
    },
    descartar(r) { return r.chave ? null : 'linha sem chave de acesso'; }
  },
  {
    id: 'mb51', nome: 'MB51 (movimentos de material)', tabela: 'raw_mb51',
    descricao: 'Entradas (101), estornos (102) e devoluções. A referência traz número e série da nota.',
    chaveGrupo: "doc_material || '|' || coalesce(item_doc, '') || '|' || coalesce(ano_doc, '')",
    campos: [
      F('doc_material', 'Documento de material', 'codigo', ['Doc.material', 'Documento material', 'Doc. material', 'Nº documento material'], { obrigatorio: true }),
      F('item_doc', 'Item do documento', 'codigo', ['Item doc.material', 'Item', 'Item documento material', 'Item doc. material']),
      F('ano_doc', 'Ano do documento', 'codigo', ['Ano doc.material', 'Exercício', 'Ano']),
      F('tipo_mov', 'Tipo de movimento', 'codigo', ['Tipo de movimento', 'TMv', 'Tipo movimento', 'Tp.mov.'], { obrigatorio: true }),
      F('data_lancamento', 'Data de lançamento', 'data', ['Data de lançamento', 'Data lançamento', 'Dt.lçto.']),
      F('material', 'Material', 'codigo', ['Material']),
      F('texto_material', 'Texto breve do material', 'texto', ['Texto breve material', 'Texto breve de material', 'Denominação']),
      F('quantidade', 'Quantidade', 'numero', ['Quantidade', 'Qtd. em UM registro', 'Qtd. UM registro', 'Qtd']),
      F('centro', 'Centro', 'codigo', ['Centro']),
      F('deposito', 'Depósito', 'codigo', ['Depósito']),
      F('centro_custo', 'Centro de custo', 'codigo', ['Centro custo', 'Centro de custo']),
      F('pedido', 'Pedido', 'codigo', ['Pedido', 'Documento de compras', 'Doc.compras']),
      F('item_pedido', 'Item do pedido', 'codigo', ['Item do pedido', 'Item pedido', 'Item doc.compras']),
      F('fornecedor', 'Fornecedor (código)', 'codigo', ['Fornecedor', 'Cód. fornecedor']),
      F('referencia', 'Referência (NF-série)', 'texto', ['Referência', 'Nº NF-série']),
      F('montante', 'Montante', 'numero', ['Montante em MI', 'Montante', 'Valor']),
      F('usuario', 'Usuário', 'texto', ['Nome do usuário', 'Usuário'])
    ],
    derivados: ['ref_numero', 'ref_serie'],
    derivar(r) { const p = parseReferencia(r.referencia); r.ref_numero = p.numero; r.ref_serie = p.serie; },
    descartar(r) { return r.doc_material ? null : 'linha sem documento de material (total ou vazia)'; }
  },
  {
    id: 'me2n', nome: 'ME2N (pedidos de compra)', tabela: 'raw_me2n',
    descricao: 'Itens de pedido: categoria de classificação contábil, quantidades a fornecer e a faturar.',
    chaveGrupo: "pedido || '|' || coalesce(item, '')",
    campos: [
      F('pedido', 'Pedido (documento de compras)', 'codigo', ['Documento de compras', 'Pedido', 'Doc.compras', 'Nº pedido'], { obrigatorio: true }),
      F('item', 'Item', 'codigo', ['Item', 'Item do pedido']),
      F('tipo_doc', 'Tipo de documento', 'texto', ['Tipo doc.compras', 'Tipo de documento de compras', 'Tp.doc.compras']),
      F('categoria_cc', 'Categoria de classificação contábil', 'texto', ['Ctg.class.cont.', 'Categoria de classificação contábil', 'Cat.class.contábil', 'Categoria class. contábil', 'Classificação contábil']),
      F('cod_eliminacao', 'Código de eliminação', 'texto', ['Código de eliminação', 'Cód. eliminação', 'Indicador de eliminação']),
      F('grupo_compradores', 'Grupo de compradores', 'texto', ['Grupo de compradores', 'Grp.compradores']),
      F('data_documento', 'Data do pedido', 'data', ['Data do documento', 'Data documento', 'Data do pedido']),
      F('fornecedor', 'Fornecedor (código e nome)', 'texto', ['Fornecedor/centro fornecedor', 'Fornecedor/Centro fornecedor', 'Fornecedor']),
      F('material', 'Material', 'codigo', ['Material']),
      F('texto_breve', 'Texto breve', 'texto', ['Texto breve', 'Texto breve material']),
      F('centro', 'Centro', 'codigo', ['Centro']),
      F('deposito', 'Depósito', 'codigo', ['Depósito']),
      F('qtd_pedido', 'Quantidade do pedido', 'numero', ['Qtd.do pedido', 'Quantidade do pedido', 'Qtd. pedido']),
      F('a_fornecer', 'A ser fornecido', 'numero', ['A ser fornecido (quantidade)', 'A ser fornecido', 'Qtd. a ser fornecida', 'A fornecer']),
      F('a_faturar', 'A ser faturado', 'numero', ['A ser faturado (quantidade)', 'A ser faturado', 'A faturar']),
      F('valor_liquido', 'Valor líquido', 'numero', ['Valor líquido do pedido', 'Valor líq. pedido', 'Valor líquido']),
      F('rc', 'Requisição de compra', 'codigo', ['Requisição de compra', 'Requisição', 'Nº requisição']),
      F('item_rc', 'Item da requisição', 'codigo', ['Item da requisição', 'Item requisição']),
      F('data_remessa', 'Data de remessa', 'data', ['Data de remessa', 'Data remessa'])
    ],
    derivados: ['fornecedor_cod', 'fornecedor_nome'],
    derivar(r) {
      const m = (r.fornecedor || '').match(/^(\d+)\s+(.+)$/);
      r.fornecedor_cod = m ? stripZeros(m[1]) : '';
      r.fornecedor_nome = m ? m[2] : (r.fornecedor || '');
      r.categoria_cc = (r.categoria_cc || '').toUpperCase();
    },
    descartar(r) { return r.pedido ? null : 'linha sem pedido (provável linha de total)'; }
  },
  {
    id: 'me5a', nome: 'ME5A (requisições de compra)', tabela: 'raw_me5a',
    descricao: 'RCs com data da solicitação, grupo de compradores e pedido gerado. Fica guardada (Consulta SQL: t_me5a), mas não aparece no painel nem nas etapas.',
    chaveGrupo: "rc || '|' || coalesce(item_rc, '')",
    campos: [
      F('rc', 'Requisição de compra', 'codigo', ['Requisição de compra', 'Requisição', 'Solicitação de compra', 'Nº requisição'], { obrigatorio: true }),
      F('item_rc', 'Item da requisição', 'codigo', ['Item de requisição', 'Item da requisição', 'Item']),
      F('data_solicitacao', 'Data da solicitação', 'data', ['Data da solicitação', 'Data solicitação', 'Data de solicitação']),
      F('grupo_compradores', 'Grupo de compradores', 'texto', ['Grupo de compradores', 'Grp.compradores']),
      F('criado_por', 'Criado por', 'texto', ['Criado por', 'Criado p/', 'Requisitante']),
      F('status', 'Status', 'texto', ['Status de processamento', 'Status', 'Status proc.']),
      F('pedido', 'Pedido', 'codigo', ['Pedido', 'Documento de compras', 'Nº pedido']),
      F('item_pedido', 'Item do pedido', 'codigo', ['Item do pedido', 'Item pedido']),
      F('material', 'Material', 'codigo', ['Material']),
      F('texto_breve', 'Texto breve', 'texto', ['Texto breve', 'Texto breve material']),
      F('quantidade', 'Quantidade solicitada', 'numero', ['Quantidade solicitada', 'Quantidade']),
      F('centro', 'Centro', 'codigo', ['Centro'])
    ],
    derivados: [],
    descartar(r) { return r.rc ? null : 'linha sem requisição (provável linha de total)'; }
  },
  {
    id: 'digit', nome: 'Controle de digitalização (planilha)', tabela: 'raw_digit',
    descricao: 'Planilha manual atual: chave, pedido digitado e data da digitalização.',
    chaveGrupo: 'chave',
    campos: [
      F('chave', 'Chave de acesso', 'chave', ['Chave', 'Chave de acesso', 'Chave NF-e'], { obrigatorio: true }),
      F('pedido', 'Pedido', 'codigo', ['Pedido', 'Pedido de compra', 'Nº pedido']),
      F('data_digitalizacao', 'Data da digitalização', 'data', ['Data', 'Data digitalização', 'Data da digitalização']),
      F('setor', 'Setor', 'texto', ['Setor', 'Classificação', 'Débito/Estoque'])
    ],
    derivados: ['dv_ok'],
    derivar(r) { r.dv_ok = r.chave ? (chaveValida(r.chave) ? 'S' : 'N') : ''; },
    descartar(r) { return r.chave ? null : 'linha sem chave de acesso'; }
  },
  {
    id: 'pasta', nome: 'Pasta de notas digitalizadas (listagem)', tabela: 'raw_pasta',
    descricao: 'Lista de arquivos gerada no computador da empresa. Data oficial = pasta do dia; classificação = pasta Débito Direto/Estoque.',
    chaveGrupo: 'caminho',
    campos: [
      F('caminho', 'Caminho completo', 'texto', ['FullName', 'Caminho', 'Caminho completo', 'Path', 'Diretório'], { obrigatorio: true }),
      F('nome_arquivo_col', 'Nome do arquivo', 'texto', ['Name', 'Nome', 'Nome do arquivo', 'Arquivo']),
      F('data_modificacao', 'Data de modificação', 'data', ['LastWriteTime', 'Data de modificação', 'Modificado em'])
    ],
    derivados: ['nome_arquivo', 'extensao', 'tipo_doc', 'classificacao_pasta', 'data_pasta', 'chave', 'numero_nf', 'pedido'],
    derivar(r) { Object.assign(r, parsePasta(r.caminho, r.nome_arquivo_col, r.data_modificacao)); },
    descartar(r) { return r.caminho ? null : 'linha sem caminho'; }
  },
  {
    id: 'dv', nome: 'Della Volpe (relatório da transportadora)', tabela: 'raw_dv',
    descricao: 'Coletas com chave do CT-e e da NF-e, pedido da mercadoria e datas operacionais.',
    chaveGrupo: 'coleta',
    campos: [
      F('coleta', 'Número da coleta', 'codigo', ['NR_COLETA', 'COLETA', 'Nº coleta', 'Número coleta', 'NUM_COLETA'], { obrigatorio: true }),
      F('chave_nfe', 'Chave da NF-e', 'chave', ['CHAVE_NFE', 'Chave NF-e', 'Chave NFE']),
      F('chave_cte', 'Chave do CT-e', 'chave', ['CHAVE_CTE', 'Chave CT-e', 'Chave CTE']),
      F('coleta_pedido', 'Pedido informado na coleta', 'texto', ['COLETA_PEDIDO', 'Pedido']),
      F('data_criacao_coleta', 'Data de criação da coleta', 'data', ['DATA_CRIACAO', 'DATA_CRIACAO_COLETA', 'DT_CRIACAO', 'Data criação coleta']),
      F('data_coleta', 'Data da coleta', 'data', ['DATA_COLETA', 'DT_COLETA', 'Data coleta']),
      F('previsao_entrega', 'Previsão de entrega', 'data', ['PREVISAO_ENTREGA', 'DATA_PREVISTA_ENTREGA', 'DT_PREVISAO', 'Data prevista']),
      F('data_entrega', 'Data da entrega', 'data', ['DATA_ENTREGA', 'DT_ENTREGA', 'Data entrega']),
      F('status_sla', 'SLA (transportadora)', 'texto', ['STATUS_SLA', 'SLA', 'SLA_ENTREGA']),
      F('remetente', 'Remetente', 'texto', ['REMETENTE', 'CLIENTE', 'ORIGEM'])
    ],
    derivados: ['pedido', 'pedido_texto'],
    derivar(r) {
      const raw = cleanText(r.coleta_pedido);
      const t = raw.replace(/^0+/, '');
      const m = t.match(/^(45\d{8})$/) || raw.match(/(?:^|\D)(45\d{8})(?!\d)/);
      r.pedido = m ? m[1] : '';
      r.pedido_texto = t;
    },
    descartar(r) { return r.coleta ? null : 'linha sem número de coleta'; }
  },
  {
    id: 'xml', nome: 'XML de NF-e e CT-e (exportados do VT IN)', tabela: 'raw_xml', xml: true,
    descricao: 'Escolha vários arquivos .xml de uma vez, ou uma pasta inteira (milhares de arquivos). Traz o pedido informado pelo fornecedor, a modalidade do frete, a transportadora e, no CT-e, as NF-e transportadas.',
    chaveGrupo: 'chave',
    campos: XML_COLS.map(([id, rot]) => F(id, rot, id === 'chave' ? 'chave' : (id === 'data_emissao' ? 'data' : (id === 'valor' ? 'numero' : (/^cnpj_/.test(id) ? 'cnpj' : 'texto'))), [rot], id === 'chave' ? { obrigatorio: true } : null)),
    derivados: ['dv_ok'],
    derivar(r) { r.dv_ok = r.chave ? (chaveValida(r.chave) ? 'S' : 'N') : ''; },
    descartar(r) { return r.chave ? null : 'arquivo que não é NF-e nem CT-e (por exemplo, evento de cancelamento) ou sem chave'; }
  }
];

FONTES.forEach(f => {
  f.campos.forEach(c => { c.sinNorm = c.sinonimos.map(norm); });
  f.colunas = f.campos.map(c => c.id).concat(f.derivados);
});
export const META_COLS = ['_lote', '_importado_em', '_arquivo', '_linha'];
export function fonte(id) { return FONTES.find(f => f.id === id); }

// ---------------------------------------------------------------- cabeçalho e mapeamento
export function dedupeHeaders(row) {
  const raw = (row || []).map(c => cleanText(c));
  const count = {};
  raw.forEach(h => { if (h) { const k = norm(h); count[k] = (count[k] || 0) + 1; } });
  return raw.map((h, i) => {
    if (!h) return `Coluna ${colLetter(i)}`;
    if (count[norm(h)] > 1) {
      let prev = '';
      for (let j = i - 1; j >= 0; j--) { if (raw[j] && count[norm(raw[j])] === 1) { prev = raw[j]; break; } }
      return prev ? `${h} [${prev}]` : `${h} [${colLetter(i)}]`;
    }
    return h;
  });
}

function scoreHeaderRow(row, def) {
  const ns = new Set((row || []).map(c => norm(cleanText(c))).filter(Boolean));
  let n = 0;
  for (const c of def.campos) if (c.sinNorm.some(s => ns.has(s))) n++;
  return n;
}

export function detectHeaderRow(aoa, def) {
  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(aoa.length, 25); i++) {
    const sc = scoreHeaderRow(aoa[i], def);
    if (sc > bestScore) { bestScore = sc; best = i; }
  }
  if (best >= 0 && bestScore >= 2) return best;
  for (let i = 0; i < Math.min(aoa.length, 25); i++) {
    if ((aoa[i] || []).filter(c => cleanText(c) !== '').length >= 3) return i;
  }
  return 0;
}

export function autoMap(headers, def) {
  const hn = headers.map(norm);
  const used = new Set();
  const map = {};
  const ordem = def.campos.slice().sort((a, b) => (b.obrigatorio ? 1 : 0) - (a.obrigatorio ? 1 : 0));
  // 1ª passada: igualdade exata (na ordem dos sinônimos)
  for (const c of ordem) {
    map[c.id] = -1;
    for (const s of c.sinNorm) {
      const idx = hn.findIndex((h, i) => h === s && !used.has(i));
      if (idx >= 0) { map[c.id] = idx; used.add(idx); break; }
    }
  }
  // 2ª passada: cabeçalho começa com o sinônimo (sinônimos com 6+ letras)
  for (const c of ordem) {
    if (map[c.id] >= 0) continue;
    for (const s of c.sinNorm) {
      if (s.length < 6) continue;
      const idx = hn.findIndex((h, i) => !used.has(i) && h.startsWith(s));
      if (idx >= 0) { map[c.id] = idx; used.add(idx); break; }
    }
  }
  return map;
}

export function amostra(aoa, headerRow, idx, n) {
  const out = [];
  if (idx < 0) return out;
  for (let r = headerRow + 1; r < aoa.length && out.length < (n || 3); r++) {
    const v = (aoa[r] || [])[idx];
    if (v !== null && v !== undefined && cleanText(v) !== '') out.push(cleanText(v));
  }
  return out;
}

export function convertValue(raw, tipo, aviso) {
  const vazio = raw === null || raw === undefined || (typeof raw === 'string' && cleanText(raw) === '');
  if (vazio) return '';
  switch (tipo) {
    case 'chave': { const r = parseChave(raw); if (r.problema) aviso(r.problema); return r.chave; }
    case 'data': { const d = parseDate(raw); if (!d) aviso('data não reconhecida ou zerada'); return d || ''; }
    case 'numero': { const n = parseNumber(raw); if (n === null) { aviso('número não reconhecido'); return ''; } return String(n); }
    case 'codigo': return parseCodigo(raw);
    case 'cnpj': return parseCnpj(raw);
    default: return cleanText(raw);
  }
}

export function converter(aoa, headerRow, mapping, def) {
  const rows = [];
  const descartes = {};
  const avisos = {};
  let lidas = 0;
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const line = aoa[r] || [];
    if (!line.some(c => c !== null && c !== undefined && cleanText(c) !== '')) continue;
    lidas++;
    const row = {};
    for (const c of def.campos) {
      const idx = mapping[c.id];
      row[c.id] = convertValue(idx >= 0 ? line[idx] : null, c.tipo, (p) => {
        const k = `${c.rotulo}: ${p}`; avisos[k] = (avisos[k] || 0) + 1;
      });
    }
    if (def.derivar) def.derivar(row);
    const motivo = def.descartar ? def.descartar(row) : null;
    if (motivo) { descartes[motivo] = (descartes[motivo] || 0) + 1; continue; }
    row._linha = String(r + 1);
    rows.push(row);
  }
  return { rows, descartes, avisos, lidas };
}
