/* Detalhe da nota e do CT-e, sempre na aba Buscar. Navegação decidida em 20/11/2026 (feita em 23/11/2026):
   nota → detalhe da nota; CT-e → detalhe do CT-e (com as NF-e que ele leva); pedido com 1 nota → a nota;
   pedido com várias notas → a lista delas; pedido sem nota → "Aguardando faturamento".
   O pedido não tem mais página própria: virou o quadro "Pedido" dentro do detalhe da nota. */
import { mostrarAba } from '../app.js';
import { L } from '../logica/index.js';
import { cardAcompanhamento, cardContatos, tagEscopo, tagSituacao, tagVenc } from '../nucleo/acompanhamento.js';
import { consulta, exec, idbApagar, idbGravar, valor } from '../nucleo/banco.js';
import { $, carregandoLinha, copiar, esqCartao, h, limpar, titulo, toast } from '../nucleo/dom.js';
import { st } from '../nucleo/estado.js';
import { caixaErro, chipEtapa, chipPedido, COR_AVISO_PEDIDO, COR_TRANSPORTE, fmtCnpj, fmtData, fmtDec, fmtMoeda, tabela, tagAviso } from '../nucleo/formato.js';
import { detalheNfeEmBranco } from './busca.js';
import { irParaEtapa } from './etapas.js';
import { q } from '../sql/index.js';

export function campos(pares) {
  return h('dl', { class: 'campos' }, pares.filter(Boolean).map(([k, v]) => [h('dt', { text: k }), h('dd', null, v === null || v === undefined || v === '' ? '—' : v)]));
}

// passos: [título, data, detalhe, feito sem data, estado extra ('atencao' | 'alerta' | 'andamento'), elemento extra, ao clicar]
export function trilha(passos) {
  let anterior = null;
  return h('ol', { class: 'trilha' }, passos.map(([titulo, data, det, feitoSemData, estado, extra, aoClicar]) => {
    let delta = null;
    if (data && anterior) {
      const d = Math.round((Date.parse(data) - Date.parse(anterior)) / 86400000);
      delta = (d >= 0 ? '+' : '') + d + (Math.abs(d) === 1 ? ' dia' : ' dias');
    }
    if (data) anterior = data;
    const feito = !!data || !!feitoSemData;
    return h('li', { class: [feito ? 'feito' : 'vazio', estado || '', aoClicar ? 'clicavel' : ''].join(' ').replace(/\s+/g, ' ').trim(),
      onclick: aoClicar || null, role: aoClicar ? 'button' : null, tabindex: aoClicar ? '0' : null, title: aoClicar ? 'Abrir a etapa' : null,
      onkeydown: aoClicar ? (e) => { if (e.key === 'Enter') aoClicar(); } : null }, h('span', { class: 'marca' }),
      h('div', null, h('div', { class: 'titulo', text: titulo }), h('div', { class: 'det', text: feito || estado ? (det || '') : (det || 'sem informação nas fontes importadas') }), extra || null),
      h('div', { class: 'quando' }, h('div', { text: data ? fmtData(data) : (feitoSemData ? 'sem data' : '') }), delta ? h('div', { class: 'delta', text: delta }) : null));
  }));
}

async function blocoObs(chave) {
  const atual = await consulta(`SELECT texto, atualizado_em FROM obs WHERE chave = ${q(chave)}`);
  const ta = h('textarea', { rows: 3, style: 'width:100%', placeholder: 'Anotações do follow-up: cobrança ao comprador, ocorrência na portaria, prazo combinado…' });
  ta.value = atual.linhas[0] ? atual.linhas[0].texto || '' : '';
  const info = h('span', { class: 'muted', style: 'font-size:12px', text: atual.linhas[0] ? 'Atualizada em ' + new Date(atual.linhas[0].atualizado_em).toLocaleString('pt-BR') : '' });
  const salvar = async () => {
    const agora = new Date().toISOString();
    await exec(`DELETE FROM obs WHERE chave = ${q(chave)}`);
    if (ta.value.trim()) {
      await exec(`INSERT INTO obs VALUES (${q(chave)}, ${q(ta.value.trim())}, ${q(agora)})`);
      await idbGravar('obs', { chave, texto: ta.value.trim(), atualizado_em: agora });
    } else await idbApagar('obs', chave);
    info.textContent = 'Salva agora.';
    toast('Observação salva neste navegador.');
  };
  return h('div', { class: 'card' }, h('h3', { text: 'Observação' }), ta, h('div', { class: 'linha', style: 'margin-top:6px' }, info, h('span', { class: 'espaco' }), h('button', { class: 'btn', text: 'Salvar observação', onclick: salvar })));
}

// O detalhe abre sempre na aba Buscar. Se o clique veio de outra aba (uma lista), essa aba continua
// na barra e o detalhe ganha o botão "Voltar para a lista".
const NOME_ABA = { painel: 'Painel', pedido: 'Pedido', coleta: 'Coleta', entregue: 'Entregue', lancado: 'Lançado', pendencias: 'Pendências', sql: 'Consulta SQL', indicadores: 'Indicadores', config: 'Configurações' };
function irParaDetalhe(qual) {
  st.detalhe = qual;
  if (!st.abaAtual || st.abaAtual === 'busca') return false;
  st.origemDetalhe = st.abaAtual;
  const res = $('buscaResultados');
  if (res) limpar(res);
  const ent = $('buscaEntrada'); if (ent) ent.value = ''; // a pesquisa anterior não vale para este detalhe
  mostrarAba('busca'); // a aba Buscar reabre o detalhe guardado em st.detalhe
  return true;
}
function alvoDetalhe() {
  const alvo = limpar($('buscaDetalhe') || $('aba-busca'));
  const o = st.origemDetalhe;
  if (o && NOME_ABA[o]) alvo.append(h('div', { class: 'linha detalhe-topo' },
    h('button', { class: 'btn', text: `‹ Voltar para a lista (${NOME_ABA[o]})`, onclick: () => mostrarAba(o) })));
  return alvo;
}

// Esqueleto do detalhe: fica embaixo do que já carregou, até o último quadro chegar
function esqDetalhe(texto) {
  return h('div', { 'aria-busy': 'true' }, carregandoLinha(texto),
    h('div', { class: 'grid g3' }, [0, 1, 2].map(() => h('div', { class: 'card' }, esqCartao(4)))));
}
export async function abrirDetalhe(chave) {
  if (irParaDetalhe(chave)) return;
  const alvo = alvoDetalhe();
  const corpo = h('div'), esp = esqDetalhe('Abrindo a nota…');
  alvo.append(corpo, esp);
  alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const tipo = await valor(`SELECT tipo FROM t_vtin WHERE chave = ${q(chave)}`);
    if (tipo === 'CT-e') await detalheCte(chave, corpo); else await detalheNfe(chave, corpo);
  } catch (e) { corpo.append(caixaErro('Erro ao abrir a nota', e)); }
  finally { esp.remove(); }
}

// O detalhe aberto fica em st.detalhe: a chave da nota, ou 'P:' + número do pedido.
export function reabrirDetalhe() {
  if (!st.detalhe) { detalheNfeEmBranco(); return; }
  if (st.detalhe.startsWith('P:')) abrirPedido(st.detalhe.slice(2)); else abrirDetalhe(st.detalhe);
}

// Pedido: com 1 nota → a nota; com várias → a lista das notas; sem nota → "Aguardando faturamento"
export async function abrirPedido(pedido) {
  if (irParaDetalhe('P:' + pedido)) return;
  const alvo = alvoDetalhe();
  const corpo = h('div'), esp = esqDetalhe(`Abrindo o pedido ${pedido}…`);
  alvo.append(corpo, esp);
  alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const nf = await consulta(`SELECT chave FROM v_nfe_todas WHERE pedido = ${q(pedido)} LIMIT 2`);
    if (nf.linhas.length === 1) { esp.remove(); await abrirDetalhe(nf.linhas[0].chave); return; }
    if (nf.linhas.length > 1) await notasDoPedido(pedido, corpo); else await pedidoSemNota(pedido, corpo);
  } catch (e) { corpo.append(caixaErro('Erro ao abrir o pedido', e)); }
  finally { esp.remove(); }
}

// As 4 etapas do pedido (todas as notas dele) como cartões clicáveis; cada um leva à aba da etapa, já pesquisando o pedido.
function passosPedido(p) {
  const parcial = (n, total) => total > 1 ? `${n} de ${total} notas` : '';
  const estTransp = { 3: 'alerta-max', 2: 'alerta', 1: 'atencao' }[p.alerta_transporte_nivel];
  const txtTransp = { 3: 'Frete do destinatário sem transportadora', 2: 'Sem transportadora', 1: 'Transporte próprio' }[p.alerta_transporte_nivel];
  const estPed = { 3: 'alerta', 2: 'alerta', 1: 'atencao' }[p.aviso_pedido_nivel];
  const txtPed = { 3: 'nota sem pedido', 2: 'pedido divergente', 1: 'fornecedor não informou o pedido' }[p.aviso_pedido_nivel];
  const passos = [
    { id: 'pedido', nome: 'Pedido de compra', data: p.data_pedido, est: !p.na_me2n ? 'atencao' : (estPed || 'feito'), det: [p.na_me2n ? '' : 'fora da ME2N', txtPed || ''].filter(Boolean).join(' · ') || (p.grupo_compradores || '') },
    { id: 'coleta', nome: 'Coleta', data: p.data_coleta, est: p.notas ? (estTransp || 'feito') : 'vazio', det: p.notas ? [p.origem_coleta ? 'pela ' + p.origem_coleta : '', txtTransp || ''].filter(Boolean).join(' · ') : 'aguardando faturamento' },
    { id: 'entregue', nome: 'Pedido entregue', data: p.data_entregue, est: !p.notas ? 'vazio' : (p.notas_entregues === p.notas ? (p.lancadas_sem_digit ? 'atencao' : 'feito') : (p.notas_entregues ? 'andamento' : 'vazio')),
      det: [parcial(p.notas_entregues, p.notas), p.lancadas_sem_digit ? `${p.lancadas_sem_digit} lançada(s) sem digitalização` : ''].filter(Boolean).join(' · ') || (p.notas_entregues ? 'data da digitalização' : 'aguardando') },
    { id: 'lancado', nome: 'Pedido lançado', data: p.data_lancado, est: !p.notas ? 'vazio' : (p.notas_lancadas === p.notas ? 'feito' : (p.notas_lancadas ? 'andamento' : 'vazio')),
      det: parcial(p.notas_lancadas, p.notas) || (p.notas_lancadas === p.notas && p.notas ? 'todas as notas lançadas' : 'aguardando') }
  ];
  const ir = (id) => irParaEtapa(id, id === 'pedido' ? 'todos' : 'todas', p.pedido);
  return h('div', { class: 'etapas5' }, passos.map((x, i) => h('div', { class: 'etapa5 ' + (p.pedido_conforme_processo && x.est === 'feito' ? 'feito conforme' : x.est), role: 'button', tabindex: '0', title: 'Abrir a etapa com este pedido',
    onclick: () => ir(x.id), onkeydown: (e) => { if (e.key === 'Enter') ir(x.id); } },
    h('div', { class: 'num', text: `Etapa ${i + 1}` }), h('div', { class: 'nome', text: x.nome }),
    h('div', { class: 'quando', text: x.data ? fmtData(x.data) : (x.est === 'andamento' ? 'em andamento' : '—') }), h('div', { class: 'det', text: x.det }))));
}

async function tabelaItensPedido(pedido) {
  const it = await consulta(`SELECT item, material, texto_breve, categoria_cc, qtd_pedido, a_fornecer, a_faturar, valor_liquido, cod_eliminacao FROM t_me2n WHERE pedido = ${q(pedido)} ORDER BY TRY_CAST(item AS INTEGER)`);
  return tabela(it.cols, it.linhas, { vazio: 'Pedido não encontrado na ME2N importada.' });
}
// Notas em que este pedido foi digitado, mas o XML traz outro pedido (o XML vale mais)
async function blocoDigitadas(pedido) {
  const r = await consulta(`SELECT numero, fornecedor, data_emissao, pedido_xml, pedido AS pedido_usado, chave FROM v_nfe_todas WHERE pedido_dig = ${q(pedido)} AND pedido <> ${q(pedido)}`);
  if (!r.linhas.length) return null;
  return h('div', null, h('h3', { text: 'Notas com este pedido digitado, mas outro pedido no XML' }),
    h('p', { class: 'sub', text: 'Pela regra, o pedido do XML vale mais. Confira com o comprador qual é o certo.' }),
    tabela(r.cols, r.linhas, { aoClicar: (x) => abrirDetalhe(x.chave) }));
}
const resumoPedido = (p) => [p.fornecedor, p.data_pedido ? 'pedido de ' + fmtData(p.data_pedido) : '', p.categorias ? 'categoria ' + p.categorias : '',
  p.grupo_compradores ? 'compras: ' + p.grupo_compradores : ''].filter(Boolean).join(' · ');

// Pedido com várias notas: a lista das notas (cada uma abre o detalhe completo, com o quadro do pedido)
async function notasDoPedido(pedido, alvo) {
  const p = (await consulta(`SELECT * FROM v_pedido_trilha WHERE pedido = ${q(pedido)}`)).linhas[0] || { pedido };
  const nf = await consulta(`SELECT situacao_processo, numero, serie, data_emissao, valor, etapa_ordem, etapa_follow, situacao_entrega, data_digitalizacao, data_miro, escopo, situacao, chave
      FROM v_nfe_todas WHERE pedido = ${q(pedido)} ORDER BY data_emissao`);
  alvo.append(h('div', { class: 'linha', style: 'margin-bottom:12px' },
    h('h2', { text: `Pedido ${pedido} · ${p.fornecedor || 'fornecedor não informado'}` }), p.etapa_follow ? chipPedido(p.etapa_ordem, p.etapa_follow) : null,
    p.pedido_conforme_processo ? tagAviso('✓ Conforme ao processo', 'conforme') : null,
    h('span', { class: 'tag', text: `${nf.linhas.length} notas · ${p.notas_entregues ?? '—'} entregue(s) · ${p.notas_lancadas ?? '—'} lançada(s)` })));
  alvo.append(h('div', { class: 'card stack' },
    titulo(`Notas do pedido (${nf.linhas.length})`, 'O pedido tem mais de uma nota. Escolha a nota para ver o detalhe completo, com o quadro do pedido (trilha, itens da ME2N e as outras notas).'),
    tabela(nf.cols, nf.linhas, { ocultar: ['etapa_ordem'], tipo: 'NF-e', aoClicar: (x) => abrirDetalhe(x.chave) }),
    await blocoDigitadas(pedido)));
}

// Pedido sem nota no VT IN importado: situação "Aguardando faturamento"
async function pedidoSemNota(pedido, alvo) {
  const p = (await consulta(`SELECT * FROM v_pedido_trilha WHERE pedido = ${q(pedido)}`)).linhas[0];
  if (!p) { alvo.append(h('div', { class: 'aviso atencao', text: `Pedido ${pedido} não encontrado na ME2N nem nas notas importadas.` })); return; }
  const recebido = p.a_fornecer === 0; // a ME2N não tem saldo a fornecer: a nota deveria existir
  alvo.append(h('div', { class: 'linha', style: 'margin-bottom:12px' },
    h('h2', { text: `Pedido ${p.pedido} · ${p.fornecedor || 'fornecedor não informado'}` }),
    tagAviso(recebido ? 'Recebido pela ME2N, sem nota no VT IN' : 'Aguardando faturamento', 'amarelo'),
    p.dias_na_etapa !== null ? h('span', { class: 'tag', text: `pedido feito há ${p.dias_na_etapa} dia(s)` }) : null));
  alvo.append(h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, titulo('Pedido de compra'), campos([
      ['Situação', recebido ? 'A ME2N não tem saldo a fornecer, mas nenhuma nota deste pedido está no VT IN importado. Confira a extração do VT IN.'
        : 'Aguardando faturamento: o fornecedor ainda não emitiu nota para este pedido (nenhuma NF-e no VT IN importado).'],
      ['Data do pedido', fmtData(p.data_pedido)], ['Fornecedor', p.fornecedor], ['Grupo de compradores', p.grupo_compradores], ['Categorias', p.categorias],
      ['Saldo a fornecer', p.a_fornecer !== null && p.a_fornecer !== undefined ? fmtDec(p.a_fornecer, 0) : null], ['Valor do pedido', p.valor_pedido ? fmtMoeda(p.valor_pedido) : null]
    ])),
    h('div', { class: 'card stack' }, titulo('Itens do pedido (ME2N)'), await tabelaItensPedido(pedido), await blocoDigitadas(pedido))));
}

// Quadro "Pedido" dentro do detalhe da nota: resumo, trilha do pedido (com mais de uma nota), as outras notas e os itens
async function quadroPedido(r, chave) {
  if (!r.pedido) return h('div', { class: 'card', style: 'margin-top:16px' }, titulo('Pedido'),
    h('p', { class: 'sub', style: 'margin:0', text: r.tem_xml ? 'Nota emitida sem pedido: nenhuma fonte achou o pedido.' : 'Sem pedido identificado nas fontes importadas.' }));
  const p = (await consulta(`SELECT * FROM v_pedido_trilha WHERE pedido = ${q(r.pedido)}`)).linhas[0];
  const outras = await consulta(`SELECT situacao_processo, numero, serie, data_emissao, valor, etapa_ordem, etapa_follow, situacao_entrega, data_miro, chave
      FROM v_nfe_todas WHERE pedido = ${q(r.pedido)} AND chave <> ${q(chave)} ORDER BY data_emissao`);
  return h('div', { class: 'card stack', style: 'margin-top:16px' },
    h('div', { class: 'linha' }, titulo(`Pedido ${r.pedido}`, 'O pedido desta nota: a trilha do pedido inteiro (quando ele tem mais de uma nota), as outras notas e os itens da ME2N. Clique numa etapa para abrir a aba dela já pesquisando o pedido.'),
      p && p.etapa_follow ? chipPedido(p.etapa_ordem, p.etapa_follow) : null,
      p && p.pedido_conforme_processo ? tagAviso('✓ Pedido conforme ao processo', 'conforme') : null,
      h('span', { class: 'muted', style: 'font-size:12.5px', text: p ? resumoPedido(p) : 'pedido fora da ME2N importada' })),
    p && p.notas > 1 ? passosPedido(p) : null,
    outras.linhas.length ? h('div', null, h('h3', { text: `Outras notas deste pedido (${outras.linhas.length})` }),
      tabela(outras.cols, outras.linhas, { ocultar: ['etapa_ordem'], tipo: 'NF-e', aoClicar: (x) => abrirDetalhe(x.chave) })) : null,
    await blocoDigitadas(r.pedido),
    h('div', null, h('h3', { text: 'Itens do pedido (ME2N)' }), await tabelaItensPedido(r.pedido)));
}

async function detalheNfe(chave, alvo) {
  const r = (await consulta(`SELECT * FROM v_nfe_todas WHERE chave = ${q(chave)}`)).linhas[0];
  if (!r) { alvo.append(h('div', { class: 'aviso atencao', text: 'Nota não encontrada no VT IN (ou fora do centro configurado).' })); return; }
  const d = L.decomporChave(chave) || {};
  alvo.append(h('div', { class: 'linha', style: 'margin-bottom:12px' },
    h('h2', { text: `NF-e ${r.numero} / série ${r.serie} · ${r.fornecedor || 'emitente não informado'}` }), chipEtapa(r.etapa_ordem, r.etapa_follow, 'NF-e'),
    r.dias_na_etapa !== null ? h('span', { class: 'tag', text: `${r.dias_na_etapa} dia(s) nesta etapa` }) : null,
    r.alerta_transporte ? tagAviso(r.alerta_transporte, COR_TRANSPORTE[r.alerta_transporte_nivel]) : null,
    r.aviso_pedido ? tagAviso(r.aviso_pedido, COR_AVISO_PEDIDO[r.aviso_pedido_nivel]) : null,
    r.prazo_dv === 'Atrasada' ? tagAviso(`Entrega atrasada (Della Volpe)${r.dias_atraso_dv ? ' · ' + r.dias_atraso_dv + ' dia(s)' : ''}`, 'vermelho') : null,
    r.situacao_processo === 'Conforme' ? tagAviso('✓ Conforme ao processo', 'conforme') : null,
    r.escopo !== 'No escopo' ? tagEscopo(r.escopo) : null,
    r.situacao !== 'Pendente' && r.situacao !== 'Lançada' ? tagSituacao(r.situacao) : null,
    r.dias_para_vencer !== null ? tagVenc(r.dias_para_vencer) : null,
    r.proxima_acao ? h('span', { class: 'tag' + (r.acao_para_hoje ? ' amarelo' : ''), text: 'Próxima ação: ' + r.proxima_acao }) : null));
  const g = h('div', { class: 'grid g3' });
  alvo.append(g);
  // Trilha desta nota nas 4 etapas do pedido
  const estTransp = { 3: 'alerta', 2: 'alerta', 1: 'atencao' }[r.alerta_transporte_nivel];
  const detColeta = [r.origem_coleta ? 'pela ' + r.origem_coleta : '', r.coletas ? 'coleta ' + r.coletas : '',
    r.previsao_entrega ? 'prazo da Della Volpe ' + fmtData(r.previsao_entrega) : '',
    r.prazo_dv ? r.prazo_dv.toLowerCase() + (r.dias_atraso_dv ? ` há ${r.dias_atraso_dv} dia(s)` : '') : '', r.status_sla ? 'status: ' + r.status_sla : ''].filter(Boolean).join(' · ');
  const detEntregue = r.data_digitalizacao ? [r.origem_data_dig, r.data_entrada ? 'entrada MIGO ' + fmtData(r.data_entrada) : ''].filter(Boolean).join(' · ')
    : (r.lancada ? 'lançada sem digitalização: falta a data oficial do recebimento' : (r.data_entrega ? 'entregue pela transportadora em ' + fmtData(r.data_entrega) + ', ainda não digitalizada' : ''));
  // Cada etapa abre a aba dela, já pesquisando esta nota (pela chave) ou o pedido dela
  const abrirPed = () => (r.pedido ? irParaEtapa('pedido', 'todos', r.pedido) : irParaEtapa('pedido', 'aviso_todos', chave));
  g.append(h('div', { class: 'card' }, h('h3', { text: 'Trilha desta nota' }), h('p', { class: 'sub', text: 'Clique numa etapa para abrir a aba dela.' }), trilha([
    ['Pedido de compra', r.data_pedido, r.pedido ? `${r.pedido} · origem: ${r.origem_pedido}${r.aviso_pedido ? ' · ' + r.aviso_pedido.toLowerCase() : ''}` : (r.tem_xml ? 'nota emitida sem pedido' : 'sem pedido identificado'),
      !!r.pedido, r.aviso_pedido_nivel >= 2 ? 'alerta' : (r.aviso_pedido_nivel === 1 ? 'atencao' : (r.pedido_conforme ? 'conforme' : null)), null, abrirPed],
    ['Coleta', r.data_coleta, [detColeta, r.alerta_transporte || (r.transporte_conforme ? 'transportadora informada' : '')].filter(Boolean).join(' · '), false, estTransp || (r.prazo_dv === 'Atrasada' ? 'alerta' : null) || (r.transporte_conforme ? 'conforme' : null), null, () => irParaEtapa('coleta', 'todas', chave)],
    ['Pedido entregue', r.data_digitalizacao, detEntregue, r.lancada, r.lancada && !r.data_digitalizacao ? 'atencao' : (r.entrega_conforme ? 'conforme' : null), null, () => irParaEtapa('entregue', 'todas', chave)],
    ['Pedido lançado', r.data_miro, r.num_documento ? 'Nº documento ' + r.num_documento : (r.doc_miro ? 'MIRO ' + r.doc_miro : ''), r.lancada, null, null, () => irParaEtapa('lancado', 'todas', chave)]
  ])));
  const bCopiar = h('button', { class: 'btn pequeno', text: 'Copiar chave', onclick: () => copiar(chave) });
  g.append(h('div', { class: 'card' }, h('h3', { text: 'Dados fiscais (VT IN)' }), campos([
    ['Emitente', r.fornecedor], ['CNPJ', fmtCnpj(r.cnpj)], ['UF / mês', d.uf ? `${L.UFS[d.uf] || d.uf} · ${d.aamm.slice(2)}/20${d.aamm.slice(0, 2)}` : null],
    ['Emissão', fmtData(r.data_emissao)], ['Valor', fmtMoeda(r.valor)],
    ['Chave', h('span', null, h('span', { class: 'chave-txt', text: chave }), ' ', bCopiar)],
    ['Dígito verificador', r.dv_ok === 'S' ? h('span', { class: 'tag ok', text: 'válido' }) : h('span', { class: 'tag nao', text: 'inválido' })],
    ['Manifestação', r.status_manifestacao], ['Etapa no VT IN', r.etapa_vtin], ['Nº documento', r.num_documento], ['Doc. MIRO', r.doc_miro],
    ['Extraído em', r.extraido_em ? new Date(r.extraido_em).toLocaleString('pt-BR') : null]
  ])));
  // CT-e ligados pelo XML: cada um abre o detalhe do CT-e
  const ctesXml = r.ctes_xml ? String(r.ctes_xml).split(', ').filter(Boolean) : [];
  const linkCtes = ctesXml.length ? h('span', null, `${r.transportadora_cte || ''} · emitido em ${fmtData(r.data_cte)} `,
    ctesXml.map((c, i) => h('button', { class: 'btn pequeno', style: 'margin:2px 4px 0 0', text: ctesXml.length > 1 ? `Abrir CT-e ${i + 1}` : 'Abrir o CT-e', onclick: () => abrirDetalhe(c) }))) : null;
  g.append(h('div', { class: 'card' }, h('h3', { text: 'Classificação e frete' }), campos([
    ['Pedido', r.pedido ? `${r.pedido} (${r.origem_pedido})` : null], ['Classificação', r.classificacao], ['Categorias', r.categorias],
    ['Pasta da digitalização', r.classificacao_pasta],
    ['Frete', r.coletas ? `coleta ${r.coletas}${r.ctes ? ' · CT-e ligado' : ' · sem CT-e no relatório'}` : (r.ctes_xml ? 'CT-e ligado pelo XML' : null)],
    ['Prazo (Della Volpe)', r.prazo_dv ? tagAviso(r.prazo_dv + (r.dias_atraso_dv ? ` · ${r.dias_atraso_dv} dia(s)` : ''), { 'Atrasada': 'vermelho', 'Entregue com atraso': 'laranja', 'No prazo': 'ok', 'Entregue no prazo': 'ok' }[r.prazo_dv] || '') : null]
  ])));
  g.append(h('div', { class: 'card' }, h('h3', { text: 'XML da nota' }), r.tem_xml ? campos([
    ['Pedido nos itens', r.itens_pedido_xml || r.pedido_xml_item], ['Pedido da nota', r.pedido_xml_compra], ['Pedido na observação', r.pedido_xml_obs],
    ['Pedido digitado', r.pedido_dig], ['Aviso', r.aviso_pedido ? tagAviso(r.aviso_pedido, COR_AVISO_PEDIDO[r.aviso_pedido_nivel]) : (r.operacao_sem_compra ? 'operação sem compra (CFOP x.9xx)' : (r.pedido_conforme ? tagAviso('✓ Pedido conforme', 'conforme') : null))],
    ['Natureza / CFOP', [r.natureza, r.cfops].filter(Boolean).join(' · ')],
    ['Frete por conta', r.modalidade_frete], ['Transportadora', r.transportadora_xml || (r.tem_transportadora === false ? 'não informada' : null)],
    ['Alerta', r.alerta_transporte ? tagAviso(r.alerta_transporte, COR_TRANSPORTE[r.alerta_transporte_nivel]) : (r.transporte_conforme ? tagAviso('✓ Transporte conforme', 'conforme') : null)],
    ['CT-e (XML)', linkCtes]
  ]) : h('p', { class: 'sub', text: 'O XML desta nota ainda não foi importado. Sem ele, não há aviso de pedido nem de transportadora.' })));

  // Quadro "Pedido" (no lugar da antiga página do pedido)
  alvo.append(await quadroPedido(r, chave));

  const ent = await consulta(`SELECT doc_material, item_doc, tipo_mov, data_lancamento, material, texto_material, quantidade, pedido, referencia FROM t_mb51 WHERE ref_numero = ${q(r.numero)} AND (ref_serie = '' OR ref_serie = ${q(r.serie)}) ORDER BY data_lancamento, doc_material, item_doc`);
  const amb = await valor(`SELECT count(*)::INTEGER FROM v_nfe_cand WHERE chave = ${q(chave)} AND NOT aceita`);
  alvo.append(h('div', { class: 'card', style: 'margin-top:16px' }, h('h3', { text: 'Entradas com a mesma referência (MB51, número e série)' }),
    amb ? h('div', { class: 'aviso atencao', style: 'margin-bottom:8px', text: 'Há outra nota com o mesmo número e série, e o pedido não permitiu desempatar. Estas entradas não foram ligadas a esta nota.' }) : null,
    tabela(ent.cols, ent.linhas, { vazio: 'Nenhuma entrada com esta referência.' })));

  const dv = await consulta(`SELECT coleta, data_coleta, previsao_entrega, data_entrega, status_sla, chave_cte, pedido_texto FROM t_dv WHERE chave_nfe = ${q(chave)}`);
  const arq = await consulta(`SELECT nome_arquivo, data_pasta, classificacao_pasta, ligacao, caminho FROM v_pasta_nota WHERE chave_nota = ${q(chave)}`);
  const ctl = await consulta(`SELECT data_digitalizacao, pedido, setor FROM t_digit WHERE chave = ${q(chave)}`);
  const g2 = h('div', { class: 'grid g2', style: 'margin-top:16px' });
  alvo.append(g2);
  g2.append(h('div', { class: 'card' }, titulo('Frete (relatório da Della Volpe)', 'Clique numa linha com CT-e para abrir o detalhe do CT-e (com todas as NF-e que ele leva).'),
    tabela(dv.cols, dv.linhas, { vazio: 'Nota não aparece no relatório da transportadora.', aoClicar: (x) => { if (x.chave_cte) abrirDetalhe(x.chave_cte); } })));
  g2.append(h('div', { class: 'card stack' }, h('h3', { text: 'Digitalização' }),
    tabela(arq.cols, arq.linhas, { vazio: 'Nenhum arquivo ligado na listagem da pasta.' }),
    ctl.linhas.length ? tabela(ctl.cols, ctl.linhas) : null));
  alvo.append(h('div', { class: 'grid g2', style: 'margin-top:16px' }, await cardAcompanhamento(r), h('div', { class: 'stack' }, await cardContatos(chave), await blocoObs(chave))));
}

async function detalheCte(chave, alvo) {
  const r = (await consulta(`SELECT * FROM v_cte_todas WHERE chave = ${q(chave)}`)).linhas[0];
  if (!r) { alvo.append(h('div', { class: 'aviso atencao', text: 'CT-e não encontrado no VT IN.' })); return; }
  alvo.append(h('div', { class: 'linha', style: 'margin-bottom:12px' },
    h('h2', { text: `CT-e ${r.numero} / série ${r.serie} · ${r.transportadora || ''}` }), chipEtapa(r.etapa_ordem, r.etapa_follow, 'CT-e'),
    r.dias_na_etapa !== null ? h('span', { class: 'tag', text: `${r.dias_na_etapa} dia(s) desde a emissão` }) : null,
    r.escopo !== 'No escopo' ? tagEscopo(r.escopo) : null,
    r.situacao !== 'Pendente' && r.situacao !== 'Lançada' ? tagSituacao(r.situacao) : null,
    r.dias_para_vencer !== null ? tagVenc(r.dias_para_vencer) : null,
    r.proxima_acao ? h('span', { class: 'tag' + (r.acao_para_hoje ? ' amarelo' : ''), text: 'Próxima ação: ' + r.proxima_acao }) : null));
  const g = h('div', { class: 'grid g3' });
  alvo.append(g);
  g.append(h('div', { class: 'card' }, h('h3', { text: 'Trilha do frete' }), trilha([
    ['Coleta', r.data_coleta, r.coletas ? 'Coleta ' + r.coletas : ''],
    ['Emissão do CT-e', r.data_emissao, ''],
    ['Entrega', r.data_entrega, r.status_sla || ''],
    ['Digitalização (CT-e separado)', r.data_digitalizacao, ''],
    ['Pedido de frete (A10)', null, r.etapa_ordem >= 3 ? 'atribuído' : (r.etapa_ordem === 2 ? 'aguardando' : ''), r.etapa_ordem >= 3],
    ['Lançamento', r.data_miro, r.doc_miro ? 'MIRO ' + r.doc_miro : '', r.etapa_ordem === 3]
  ])));
  g.append(h('div', { class: 'card' }, h('h3', { text: 'Dados fiscais (VT IN)' }), campos([
    ['Transportadora', r.transportadora], ['CNPJ', fmtCnpj(r.cnpj)], ['Emissão', fmtData(r.data_emissao)], ['Valor', fmtMoeda(r.valor)],
    ['Chave', h('span', null, h('span', { class: 'chave-txt', text: chave }), ' ', h('button', { class: 'btn pequeno', text: 'Copiar chave', onclick: () => copiar(chave) }))],
    ['Etapa no VT IN', r.etapa_vtin], ['Nº documento', r.num_documento], ['Doc. MIRO', r.doc_miro],
    ['Pedido da mercadoria', r.pedido_mercadoria ? h('button', { class: 'btn pequeno', text: `Abrir o pedido ${r.pedido_mercadoria}`, onclick: () => abrirPedido(r.pedido_mercadoria) }) : null]
  ])));
  const nf = await consulta(`SELECT n.numero, n.fornecedor, n.data_emissao, n.pedido, n.etapa_ordem, n.etapa_follow, d.chave_nfe AS chave, d.fonte
      FROM (SELECT chave_nfe, string_agg(DISTINCT fonte, ' e ') AS fonte FROM (
              SELECT chave_nfe, 'Della Volpe' AS fonte FROM t_dv WHERE chave_cte = ${q(chave)} AND chave_nfe IS NOT NULL
              UNION ALL SELECT chave_nfe, 'XML do CT-e' FROM v_cte_xml_nfe WHERE chave_cte = ${q(chave)}) GROUP BY chave_nfe) d
      LEFT JOIN v_nfe_todas n ON n.chave = d.chave_nfe`);
  g.append(h('div', { class: 'card' }, titulo(`NF-e transportadas (${nf.linhas.length})`, 'Um CT-e leva uma ou mais NF-e. Clique numa nota para ver o detalhe completo dela.'),
    tabela(nf.cols, nf.linhas, { ocultar: ['etapa_ordem'], tipo: 'NF-e', vazio: 'CT-e não aparece no relatório da transportadora nem tem XML importado.', aoClicar: (x) => abrirDetalhe(x.chave) })));
  alvo.append(h('div', { class: 'grid g2', style: 'margin-top:16px' }, await cardAcompanhamento(r), h('div', { class: 'stack' }, await cardContatos(chave), await blocoObs(chave))));
}
