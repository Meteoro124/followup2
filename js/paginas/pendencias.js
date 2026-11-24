/* Aba Pendências: lista filtrável das notas pendentes. */
import { mostrarAba } from '../app.js';
import { L } from '../logica/index.js';
import { avisoFiltroEscopo, colsEscopo, salvarAcomp } from '../nucleo/acompanhamento.js';
import { consulta, valor } from '../nucleo/banco.js';
import { $, blocoCarregando, h, limpar, toast } from '../nucleo/dom.js';
import { POR_PAGINA, st } from '../nucleo/estado.js';
import { caixaErro, exportarLinhas, fmtInt, tabela } from '../nucleo/formato.js';
import { blocoPeriodo, condPeriodo } from '../nucleo/periodo.js';
import { abrirDetalhe } from './detalhe.js';
import { q } from '../sql/index.js';

export function irParaPendencias(tipo, etapa, faixa, mostrar, venc) {
  Object.assign(st.pend, { tipo, etapa: etapa === undefined ? 'pendentes' : String(etapa), faixa: faixa || '', classificacao: '', projeto: '', texto: '', pagina: 0, mostrar: mostrar || '', venc: venc || '' });
  mostrarAba('pendencias');
}

// ------------------------------------------------------------------ PENDÊNCIAS
const FAIXAS = { f0: ['0–7 dias', 'v.dias_na_etapa <= 7'], f1: ['8–15 dias', 'v.dias_na_etapa BETWEEN 8 AND 15'], f2: ['16–30 dias', 'v.dias_na_etapa BETWEEN 16 AND 30'], f3: ['mais de 30 dias', 'v.dias_na_etapa > 30'], fx: ['sem data', 'v.dias_na_etapa IS NULL'] };
const VENC = { v3: ['Vencida há mais de 15 dias', 'v.dias_para_vencer < -15'], v2: ['Vencida há 1 a 15 dias', 'v.dias_para_vencer BETWEEN -15 AND -1'], v1: ['Vence em 0 a 7 dias', 'v.dias_para_vencer BETWEEN 0 AND 7'],
  v0: ['Vence em 8 a 15 dias', 'v.dias_para_vencer BETWEEN 8 AND 15'], vf: ['Vence em mais de 15 dias', 'v.dias_para_vencer > 15'] };
const MOSTRAR = {
  hoje: ['Só ações para hoje', 'v.acao_para_hoje'],
  vencidas: ['Só vencidas', 'v.em_acompanhamento AND v.dias_para_vencer < 0'],
  vencem: ['Só as que vencem em até 7 dias', 'v.em_acompanhamento AND v.dias_para_vencer BETWEEN 0 AND 7'],
  classificar: ['Só a classificar (transportadora mista)', "v.escopo = 'A classificar' AND v.situacao = 'Pendente'"],
  manual: ['Só com decisão manual de escopo', 'v.escopo_manual IS NOT NULL'],
  contato: ['Só com contato registrado', 'v.qtd_contatos > 0'],
  atrasada_dv: ['Só com entrega atrasada (prazo da Della Volpe)', "v.prazo_dv = 'Atrasada'"]
};
const ORDENS = { vencimento: ['Vencimento (mais urgente primeiro)', 'v.dias_para_vencer ASC NULLS LAST, v.dias_na_etapa DESC NULLS LAST'],
  parado: ['Etapa e tempo parado', 'v.etapa_ordem, v.dias_na_etapa DESC NULLS LAST'], emissao: ['Emissão (mais recente)', 'v.data_emissao DESC NULLS LAST'], valor: ['Valor (maior)', 'v.valor DESC NULLS LAST'] };

export async function renderPendencias() {
  const box = limpar($('aba-pendencias'));
  const p = st.pend;
  { const av = avisoFiltroEscopo(); if (av) box.append(av); }
  const etapas = p.tipo === 'CT-e'
    ? [['pendentes', 'Pendentes (não lançados)'], ['1', 'Em processamento no VT IN'], ['2', 'Aguardando pedido de frete (A10)'], ['3', 'Lançado'], ['todas', 'Todas']]
    : [['pendentes', 'Pendentes (não lançadas)'], ['1', 'Aguardando recebimento'], ['2', 'Recebida, sem entrada'], ['3', 'Com entrada, sem lançamento'], ['4', 'Lançada'], ['todas', 'Todas']];
  const sel = (opts, atual, aoMudar, rot) => { const s = h('select', { 'aria-label': rot, onchange: (e) => aoMudar(e.target.value) }, opts.map(([v, t]) => h('option', { value: v, text: t }))); s.value = atual; return s; };
  const fonte = p.tipo === 'CT-e' ? 'v_cte' : 'v_nfe';
  const mudar = (patch) => { Object.assign(p, patch, { pagina: 0 }); renderPendencias(); };
  let classes = [], projetos = [];
  const espF = blocoCarregando('Carregando os filtros…', 2);
  box.append(espF);
  try {
    if (p.tipo === 'NF-e') classes = (await consulta('SELECT DISTINCT classificacao FROM v_nfe ORDER BY 1')).linhas.map(x => x.classificacao).filter(Boolean);
    projetos = (await consulta(`SELECT DISTINCT projeto FROM ${fonte} WHERE projeto IS NOT NULL ORDER BY 1`)).linhas.map(x => x.projeto);
  } catch (e) { /* segue */ }
  espF.remove();
  const texto = h('input', { type: 'text', value: p.texto, placeholder: 'Fornecedor, número ou pedido', style: 'min-width:220px', 'aria-label': 'Texto' });
  texto.addEventListener('keydown', (e) => { if (e.key === 'Enter') mudar({ texto: texto.value }); });
  box.append(h('div', { class: 'card', style: 'margin-bottom:14px' },
    h('div', { class: 'linha' },
      sel([['NF-e', 'NF-e (mercadoria)'], ['CT-e', 'CT-e (frete)']], p.tipo, (v) => mudar({ tipo: v, etapa: 'pendentes', classificacao: '', projeto: '' }), 'Tipo'),
      sel(etapas, p.etapa, (v) => mudar({ etapa: v }), 'Etapa'),
      sel([['', 'Todas desta seleção']].concat(Object.entries(MOSTRAR).map(([k, [t]]) => [k, t])), p.mostrar || '', (v) => mudar({ mostrar: v }), 'Mostrar'),
      sel([['', 'Qualquer tempo na etapa']].concat(Object.entries(FAIXAS).map(([k, [t]]) => [k, t])), p.faixa, (v) => mudar({ faixa: v }), 'Tempo na etapa'),
      sel([['', 'Qualquer vencimento']].concat(Object.entries(VENC).map(([k, [t]]) => [k, t])), p.venc || '', (v) => mudar({ venc: v }), 'Vencimento')),
    h('div', { class: 'linha', style: 'margin-top:8px' },
      p.tipo === 'NF-e' ? sel([['', 'Todas as classificações']].concat(classes.map(c => [c, c])), p.classificacao, (v) => mudar({ classificacao: v }), 'Classificação') : null,
      projetos.length ? sel([['', 'Todos os projetos']].concat(projetos.map(c => [c, c])), p.projeto || '', (v) => mudar({ projeto: v }), 'Projeto') : null,
      texto, h('button', { class: 'btn', text: 'Filtrar', onclick: () => mudar({ texto: texto.value }) }),
      sel(Object.entries(ORDENS).map(([k, [t]]) => [k, 'Ordenar: ' + t]), p.ordem || 'vencimento', (v) => mudar({ ordem: v }), 'Ordem'),
      h('span', { class: 'espaco' }), blocoPeriodo(renderPendencias))));

  const cond = [condPeriodo('v.data_emissao')];
  const maxEtapa = p.tipo === 'CT-e' ? 3 : 4;
  if (p.etapa === 'pendentes') cond.push(`v.etapa_ordem < ${maxEtapa}`);
  else if (p.etapa !== 'todas') cond.push(`v.etapa_ordem = ${Number(p.etapa)}`);
  if (p.mostrar && MOSTRAR[p.mostrar]) cond.push(MOSTRAR[p.mostrar][1]);
  if (p.faixa && FAIXAS[p.faixa]) cond.push(FAIXAS[p.faixa][1]);
  if (p.venc && VENC[p.venc]) cond.push(VENC[p.venc][1]);
  if (p.classificacao) cond.push(`v.classificacao = ${q(p.classificacao)}`);
  if (p.projeto) cond.push(`v.projeto = ${q(p.projeto)}`);
  if (p.texto.trim()) {
    const t = p.texto.trim(), num = L.stripZeros(t.replace(/\D/g, ''));
    const nome = p.tipo === 'CT-e' ? 'v.transportadora' : 'v.fornecedor';
    const ped = p.tipo === 'CT-e' ? 'v.pedido_mercadoria' : 'v.pedido';
    cond.push(`(${nome} ILIKE ${q('%' + t + '%')}${num ? ` OR v.numero = ${q(num)} OR ${ped} = ${q(num)}` : ''})`);
  }
  const esc = st.filtroEscopo === 'no' ? (p.mostrar === 'classificar' || p.mostrar === 'manual' ? 'v.escopo, v.escopo_motivo, ' : '') : colsEscopo('v');
  const canc = st.filtroEscopo === 'canceladas' ? 'v.status_sefaz, v.manifestacao_cod, ' : '';
  const ordem = (ORDENS[p.ordem] || ORDENS.vencimento)[1];
  const sql = p.tipo === 'CT-e'
    ? `SELECT v.etapa_ordem, v.etapa_follow, ${esc}${canc}v.dias_para_vencer, v.dias_na_etapa, v.numero, v.transportadora, v.data_emissao, v.valor, v.etapa_vtin, v.coletas, v.qtd_nfe, v.pedido_mercadoria, v.prazo_dv, v.status_sla,
           v.proxima_acao, v.ultimo_contato, v.projeto, o.texto AS observacao, v.chave
         FROM v_cte v LEFT JOIN obs o ON o.chave = v.chave WHERE ${cond.join(' AND ')} ORDER BY ${ordem}, v.data_emissao LIMIT 20000`
    : `SELECT v.etapa_ordem, v.etapa_follow, ${esc}${canc}v.dias_para_vencer, v.dias_na_etapa, v.numero, v.serie, v.fornecedor, v.data_emissao, v.valor, v.pedido, v.classificacao, v.tipo_operacao, v.projeto,
           v.proxima_acao, v.ultimo_contato, v.data_digitalizacao, v.data_entrada, v.etapa_vtin, v.coletas, v.prazo_dv, v.status_sla, o.texto AS observacao, v.chave
         FROM v_nfe v LEFT JOIN obs o ON o.chave = v.chave WHERE ${cond.join(' AND ')} ORDER BY ${ordem}, v.data_emissao LIMIT 20000`;
  const esp = blocoCarregando(`Carregando as ${p.tipo} pendentes…`, 8);
  box.append(esp);
  try {
    const r = await consulta(sql);
    esp.remove();
    p.cols = r.cols; p.linhas = r.linhas;
    const paginas = Math.max(1, Math.ceil(r.linhas.length / POR_PAGINA));
    if (p.pagina >= paginas) p.pagina = paginas - 1;
    const pag = r.linhas.slice(p.pagina * POR_PAGINA, (p.pagina + 1) * POR_PAGINA);
    box.append(h('div', { class: 'linha', style: 'margin-bottom:8px' }, h('h2', { text: `${fmtInt(r.linhas.length)} ${p.tipo}${p.mostrar && MOSTRAR[p.mostrar] ? ' · ' + MOSTRAR[p.mostrar][0].replace(/^Só /, '') : ''}` }),
      h('span', { class: 'muted', text: p.mostrar === 'classificar' ? 'decida pela coluna da direita ou abra a nota' : 'clique numa linha para ver a trilha e registrar o acompanhamento' }), h('span', { class: 'espaco' }),
      h('button', { class: 'btn', text: 'Exportar Excel', onclick: () => exportarLinhas(r.cols.filter(c => c !== 'etapa_ordem'), r.linhas, 'pendencias_' + p.tipo.replace('-', '')) })));
    const decidir = (x, decisao, msg) => async () => { await salvarAcomp(x.chave, { escopo_manual: decisao }); toast(msg); renderPendencias(); };
    const acoes = p.mostrar === 'classificar' ? (x) => h('span', { class: 'linha', style: 'flex-wrap:nowrap;gap:4px' },
      h('button', { class: 'btn pequeno', text: 'Almoxarifado', onclick: decidir(x, 'incluir', 'Nota no acompanhamento.') }),
      h('button', { class: 'btn pequeno', text: 'Fora do escopo', onclick: decidir(x, 'excluir', 'Nota fora do escopo.') })) : null;
    box.append(tabela(r.cols, pag, { ocultar: ['etapa_ordem'], tipo: p.tipo, acoes, rotuloAcoes: 'Decisão', aoClicar: (x) => abrirDetalhe(x.chave), vazio: 'Nada pendente com estes filtros.' }));
    box.append(h('div', { class: 'paginacao' },
      h('button', { class: 'btn pequeno', text: '‹ Anterior', disabled: p.pagina === 0, onclick: () => { p.pagina--; renderPendencias(); } }),
      h('span', { text: `Página ${p.pagina + 1} de ${paginas}` }),
      h('button', { class: 'btn pequeno', text: 'Próxima ›', disabled: p.pagina >= paginas - 1, onclick: () => { p.pagina++; renderPendencias(); } })));
  } catch (e) { esp.remove(); box.append(caixaErro('Erro na lista de pendências', e)); }
}
