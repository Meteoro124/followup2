/* Formatação de números, datas e colunas; tabela padrão; caixa de erro; exportação para Excel. */
import { status } from '../app.js';
import { tagEscopo, tagSituacao, tagVenc } from './acompanhamento.js';
import { valor } from './banco.js';
import { baixar, h } from './dom.js';

// ------------------------------------------------------------------ formatação
export const fmtInt = (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('pt-BR');
export const fmtDec = (n, d) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtMoeda = (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtData = (iso) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
export const fmtCnpj = (c) => /^\d{14}$/.test(c || '') ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c || '—');

const ROTULOS = {
  etapa_follow: 'Etapa', dias_na_etapa: 'Dias na etapa', idade_dias: 'Idade (dias)', numero: 'Número', serie: 'Série',
  fornecedor: 'Emitente', emitente: 'Emitente', transportadora: 'Transportadora', data_emissao: 'Emissão', valor: 'Valor',
  pedido: 'Pedido', origem_pedido: 'Origem do pedido', classificacao: 'Classificação', data_digitalizacao: 'Digitalização',
  data_entrada: 'Entrada (MIGO)', data_miro: 'Lançamento', etapa_vtin: 'Etapa no VT IN', coletas: 'Coleta', status_sla: 'SLA',
  observacao: 'Observação', chave: 'Chave de acesso', qtd_nfe: 'NF-e', pedido_mercadoria: 'Pedido da mercadoria', tipo: 'Tipo',
  item: 'Item', material: 'Material', texto_breve: 'Texto breve', categoria_cc: 'Categoria', qtd_pedido: 'Qtd pedida',
  a_fornecer: 'A fornecer', a_faturar: 'A faturar', valor_liquido: 'Valor líquido', cod_eliminacao: 'Eliminado',
  doc_material: 'Doc. material', item_doc: 'Item', tipo_mov: 'Mov.', data_lancamento: 'Lançamento', texto_material: 'Texto',
  quantidade: 'Quantidade', referencia: 'Referência', coleta: 'Coleta', data_criacao_coleta: 'Coleta criada', data_coleta: 'Coleta',
  previsao_entrega: 'Previsão de entrega', prazo_dv: 'Prazo (Della Volpe)', dias_atraso_dv: 'Dias de atraso', data_entrega: 'Entrega', chave_cte: 'Chave do CT-e', pedido_texto: 'Pedido na coleta',
  nome_arquivo: 'Arquivo', data_pasta: 'Data da pasta', classificacao_pasta: 'Pasta', ligacao: 'Ligação', caminho: 'Caminho',
  setor: 'Setor', notas_com_mesmo_numero: 'Notas com o mesmo número', chaves: 'Chaves', docs_material: 'Docs. material',
  num_documento: 'Nº documento', doc_miro: 'Doc. MIRO', linhas_101: 'Linhas 101', linhas_102: 'Linhas 102', qtd_liquida: 'Qtd líquida',
  grupo_pela_categoria: 'Grupo pela categoria', pasta: 'Pasta', categorias: 'Categorias', vezes: 'Vezes', fonte: 'Fonte',
  numero_nf: 'Número', fornecedor_nome: 'Fornecedor', data_pedido: 'Data do pedido',
  situacao_processo: 'Processo', pedido_conforme_processo: 'Processo',
  alerta_transporte: 'Alerta de transporte', aviso_pedido: 'Aviso de pedido', origem_coleta: 'Data da coleta por', modalidade_frete: 'Frete por conta',
  transportadora_xml: 'Transportadora (XML)', notas: 'Notas', notas_entregues: 'Entregues', notas_lancadas: 'Lançadas', rc: 'RC', item_rc: 'Item',
  data_rc: 'Data da RC', criado_por: 'Criado por', grupo_compradores: 'Grupo de compradores', status: 'Status', dias_sem_pedido: 'Dias sem pedido',
  pedido_xml: 'Pedido no XML', pedido_digitado: 'Pedido digitado', situacao_entrega: 'Situação da entrega', origem_data_dig: 'Data por',
  dias_desde_coleta: 'Dias desde a coleta', dias_desde_entrega: 'Dias desde a entrega', etapa_pedido: 'Etapa do pedido', texto_breve_rc: 'Texto breve',
  escopo: 'Escopo', escopo_motivo: 'Motivo do escopo', natureza_operacao: 'Natureza da operação',
  dias_para_vencer: 'Vence', vencimento: 'Vencimento', situacao: 'Situação', proxima_acao: 'Próxima ação', proxima_acao_data: 'Data',
  proxima_acao_texto: 'Ação', ultimo_contato: 'Último contato', tipo_operacao: 'Operação', projeto: 'Projeto', raiz: 'Raiz do CNPJ',
  primeiro_cte: 'Primeiro CT-e', ctes: 'CT-e', digitalizados: 'Digitalizados', cnpj: 'CNPJ', status_sefaz: 'Status SEFAZ', manifestacao_cod: 'Manifestação'
};
export const rotulo = (c) => ROTULOS[c] || c.replace(/_/g, ' ');
const COL_NUM = /^(valor|montante|qtd|quantidade|a_fornecer|a_faturar|dias|idade|n_|linhas|vezes|notas|candidatas|d_|mediana|p90|negativos|arquivos|itens|digitalizados)/;
// Cores dos avisos: transporte (3 = destaque máximo) e pedido (3 = vermelho)
export const COR_TRANSPORTE = { 3: 'max', 2: 'vermelho', 1: 'amarelo' };
export const COR_AVISO_PEDIDO = { 3: 'vermelho', 2: 'laranja', 1: 'amarelo' };
// Prazo da Della Volpe: atrasada em vermelho, entregue com atraso em laranja, no prazo em verde
export const COR_PRAZO_DV = { 'Atrasada': 'vermelho', 'Entregue com atraso': 'laranja', 'No prazo': 'ok', 'Entregue no prazo': 'ok' };
export const tagAviso = (texto, cls) => texto ? h('span', { class: 'tag ' + (cls || ''), text: texto }) : '—';
const COL_MONO = /^(chave|chaves|chave_cte|chave_nota|caminho)$/;

function fmtCelula(col, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'number') {
    if (/^(valor|montante)/.test(col)) return fmtMoeda(v);
    return Number.isInteger(v) ? fmtInt(v) : fmtDec(v, 2);
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtData(v);
  return String(v);
}

const COR_ETAPA_NFE = { 1: 'var(--st1)', 2: 'var(--st2)', 3: 'var(--st3)', 4: 'var(--st4)' };
export const COR_ETAPA_CTE = { 1: 'var(--st1)', 2: 'var(--st3)', 3: 'var(--st4)' };
export function chipEtapa(ordem, texto, tipo) {
  const cor = (tipo === 'CT-e' ? COR_ETAPA_CTE : COR_ETAPA_NFE)[ordem] || 'var(--muted)';
  const final = (tipo === 'CT-e' && ordem === 3) || (tipo !== 'CT-e' && ordem === 4);
  return h('span', { class: 'chip' }, h('span', { class: 'dot', style: `background:${cor}` }), final ? '✓ ' + texto : texto);
}
// Etapa do pedido: 2 aguardando faturamento (sem nota), 3 coletado, 4 entregue, 5 lançado (vazio = recebido pela ME2N sem nota)
const COR_ETAPA_PEDIDO = { 2: 'var(--st1)', 3: 'var(--st2)', 4: 'var(--st3)', 5: 'var(--st4)' };
export function chipPedido(ordem, texto) {
  return h('span', { class: 'chip' }, h('span', { class: 'dot', style: `background:${COR_ETAPA_PEDIDO[ordem] || 'var(--muted)'}` }), ordem === 5 ? '✓ ' + texto : texto);
}

export function tabela(cols, linhas, opts) {
  opts = opts || {};
  const visiveis = cols.filter(c => !(opts.ocultar || []).includes(c) && !/_nivel$/.test(c));
  const thead = h('thead', null, h('tr', null, visiveis.map(c => h('th', { class: COL_NUM.test(c) ? 'num' : null, text: rotulo(c) })), opts.acoes ? h('th', { text: opts.rotuloAcoes || '' }) : null));
  const tbody = h('tbody');
  for (const r of linhas) {
    const conforme = r.situacao_processo === 'Conforme' || r.pedido_conforme_processo === true;
    const classes = [opts.aoClicar ? 'clicavel' : '', r.alerta_transporte_nivel === 3 ? 'linha-max' : (conforme ? 'linha-conforme' : '')].filter(Boolean).join(' ');
    const tr = h('tr', { class: classes || null, onclick: opts.aoClicar ? () => opts.aoClicar(r) : null });
    for (const c of visiveis) {
      let conteudo;
      if (c === 'alerta_transporte') conteudo = tagAviso(r[c], COR_TRANSPORTE[r.alerta_transporte_nivel]);
      else if (c === 'aviso_pedido') conteudo = tagAviso(r[c], COR_AVISO_PEDIDO[r.aviso_pedido_nivel]);
      else if (c === 'situacao_entrega' && r[c] === 'Lançada sem digitalização') conteudo = tagAviso(r[c], 'amarelo');
      else if (c === 'situacao_entrega' && r[c] === 'Entregue (digitalizada)') conteudo = tagAviso('✓ ' + r[c], 'conforme');
      else if (c === 'situacao_processo') conteudo = r[c] === 'Conforme' ? tagAviso('✓ Conforme', 'conforme') : (r[c] === 'Com aviso' ? tagAviso(r[c], 'laranja') : tagAviso(r[c] || '—'));
      else if (c === 'pedido_conforme_processo') conteudo = r[c] ? tagAviso('✓ Conforme', 'conforme') : (r.notas ? tagAviso('Com aviso ou sem XML') : '—');
      else if (c === 'etapa_pedido' && r[c]) conteudo = chipPedido(r.etapa_ordem, r[c]);
      else if (c === 'etapa_follow' && r[c] && r.etapa_ordem !== undefined && r.etapa_ordem !== null) conteudo = chipEtapa(r.etapa_ordem, r[c], r.tipo || opts.tipo);
      else if (c === 'categoria_cc' && r[c] === '') conteudo = '(vazio = estoque)';
      else if (c === 'prazo_dv' && r[c]) conteudo = tagAviso(r[c], COR_PRAZO_DV[r[c]] || '');
      else if (c === 'escopo') conteudo = tagEscopo(r[c]);
      else if (c === 'situacao') conteudo = tagSituacao(r[c]);
      else if (c === 'dias_para_vencer') conteudo = tagVenc(r[c]);
      else if (c === 'raiz' && /^\d{8}$/.test(r[c] || '')) conteudo = r[c].replace(/^(\d{2})(\d{3})(\d{3})$/, '$1.$2.$3');
      else conteudo = fmtCelula(c, r[c]);
      const cls = COL_NUM.test(c) ? 'num' : (COL_MONO.test(c) ? 'mono' : (/^data_|^previsao/.test(c) ? 'nowrap' : null));
      tr.append(h('td', { class: cls }, conteudo));
    }
    if (opts.acoes) tr.append(h('td', { class: 'nowrap', onclick: (e) => e.stopPropagation() }, opts.acoes(r)));
    tbody.append(tr);
  }
  if (!linhas.length) tbody.append(h('tr', null, h('td', { colspan: (visiveis.length + (opts.acoes ? 1 : 0)) || 1, class: 'muted', text: opts.vazio || 'Nenhuma linha.' })));
  return h('div', { class: 'tabela-wrap', style: opts.altura ? `max-height:${opts.altura}px` : null }, h('table', { class: 'tabela' }, thead, tbody));
}

export function caixaErro(titulo, e) {
  return h('div', { class: 'aviso erro' }, h('b', { text: titulo }), h('pre', { text: String(e && e.message ? e.message : e) }));
}

export function exportarLinhas(cols, linhas, nomeBase) {
  const nome = `${nomeBase}_${new Date().toISOString().slice(0, 10)}`;
  const dados = linhas.map(r => { const o = {}; cols.forEach(c => { const v = r[c]; o[rotulo(c)] = (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? fmtData(v) : v; }); return o; });
  if (window.XLSX) {
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    XLSX.writeFile(wb, nome + '.xlsx');
  } else {
    const csv = '\uFEFF' + [cols.map(rotulo).join(';')].concat(linhas.map(r => cols.map(c => String(r[c] === null || r[c] === undefined ? '' : r[c]).replace(/;/g, ',')).join(';'))).join('\r\n');
    baixar(nome + '.csv', csv, 'text/csv');
  }
}

export function hojeISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
