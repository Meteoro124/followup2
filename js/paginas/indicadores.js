/* Indicadores: os quadros de análise do follow-up (situação do acompanhamento, frete, prazo da Della Volpe,
   tempo parado na etapa, tempo entre etapas e vencimento). Seguem o período escolhido e o filtro "Notas"
   do topo; a explicação de cada quadro fica no "i" do título. */
import { mostrarAba } from '../app.js';
import { avisoFiltroEscopo, mudarFiltroEscopo } from '../nucleo/acompanhamento.js';
import { consulta, valor } from '../nucleo/banco.js';
import { $, carregandoLinha, clicavel, encher, esq, esqCartao, esqTabela, h, limpar, slot, titulo } from '../nucleo/dom.js';
import { st } from '../nucleo/estado.js';
import { caixaErro, chipEtapa, COR_ETAPA_CTE, fmtData, fmtDec, fmtInt } from '../nucleo/formato.js';
import { blocoPeriodo, condPeriodo } from '../nucleo/periodo.js';
import { irParaEtapa } from './etapas.js';
import { irParaPendencias } from './pendencias.js';
import { q, S } from '../sql/index.js';

export async function renderIndicadores() {
  const box = limpar($('aba-indicadores'));
  const vez = st.vezIndicadores = (st.vezIndicadores || 0) + 1;
  const parou = () => vez !== st.vezIndicadores; // outra atualização começou: esta para
  box.append(carregandoLinha('Lendo a base…'));
  let total = 0;
  try { total = await valor('SELECT count(*)::INTEGER FROM t_vtin'); } catch (e) { limpar(box).append(caixaErro('Erro ao ler a base', e)); return; }
  if (parou()) return;
  limpar(box);
  if (!total) {
    box.append(h('div', { class: 'card stack', style: 'max-width:720px' }, h('h2', { text: 'Sem dados' }),
      h('p', { class: 'sub', text: 'Os indicadores aparecem depois da primeira importação (ou com os dados fictícios, na página inicial).' }),
      h('div', { class: 'linha' }, h('button', { class: 'btn primario', text: 'Ir para Importar dados', onclick: () => mostrarAba('importar') }))));
    return;
  }
  { const av = avisoFiltroEscopo(); if (av) box.append(h('div', { style: 'margin-bottom:14px' }, av)); }
  const tab = () => slot('card', [esq('t', 'width:40%'), esqTabela(5)]);
  const s = { situacao: slot('card', esqCartao(2)), frete: slot('card', esqCartao(2)), prazo: slot('card', esqCartao(2)), heat: tab(), tempos: tab(), venc: tab() };
  box.append(h('div', { class: 'painel-cab' }, h('div', null, h('h1', { text: 'Indicadores' })), h('span', { class: 'espaco' }), blocoPeriodo(renderIndicadores)),
    h('div', { class: 'stack' }, s.situacao, s.frete, s.prazo, s.heat, h('div', { class: 'grid g2' }, s.tempos, s.venc)));
  const per = condPeriodo('data_emissao');
  const irLista = async (tipo, filtro, mostrar) => { await mudarFiltroEscopo(filtro, true); irParaPendencias(tipo, filtro === 'no' ? 'pendentes' : 'todas', '', mostrar); };

  // Situação do acompanhamento: NF-e e CT-e juntos, sempre sobre todas as notas (sem o filtro do topo)
  try {
    const r = (await consulta(`SELECT tipo,
          count(*) FILTER (WHERE em_acompanhamento)::INTEGER AS acomp,
          count(*) FILTER (WHERE em_acompanhamento AND dias_para_vencer < 0)::INTEGER AS vencidas,
          count(*) FILTER (WHERE em_acompanhamento AND dias_para_vencer BETWEEN 0 AND 7)::INTEGER AS vencem,
          count(*) FILTER (WHERE acao_para_hoje)::INTEGER AS hoje,
          count(*) FILTER (WHERE escopo = 'A classificar' AND situacao = 'Pendente')::INTEGER AS classificar,
          count(*) FILTER (WHERE escopo = 'Fora do escopo')::INTEGER AS fora,
          count(*) FILTER (WHERE situacao = 'Cancelada/recusada')::INTEGER AS canceladas,
          count(*) FILTER (WHERE situacao = 'Arquivada')::INTEGER AS arquivadas
        FROM v_documentos WHERE ${per} GROUP BY tipo`)).linhas;
    if (parou()) return;
    const nfe = r.find(x => x.tipo === 'NF-e') || {}, cte = r.find(x => x.tipo === 'CT-e') || {};
    const ir = (k, filtro, mostrar) => () => irLista((nfe[k] || 0) === 0 && (cte[k] || 0) > 0 ? 'CT-e' : 'NF-e', filtro, mostrar);
    const corte = st.cfg.corteBacklog ? `Emitidas antes de ${fmtData(st.cfg.corteBacklog)} ou arquivadas à mão.` : 'Arquivadas à mão.';
    const defs = [
      ['acomp', 'Em acompanhamento', 'var(--marca-escuro)', 'Notas pendentes no escopo.', ir('acomp', 'no', '')],
      ['vencidas', 'Vencidas', 'var(--critical)', 'Pelo vencimento informado na nota ou estimado (emissão + dias da configuração).', ir('vencidas', 'no', 'vencidas')],
      ['vencem', 'Vencem em até 7 dias', 'var(--marca-dourado)', 'Pendentes no escopo que vencem nos próximos 7 dias.', ir('vencem', 'no', 'vencem')],
      ['hoje', 'Ações para hoje', 'var(--marca-dourado)', 'Próxima ação com data até hoje.', ir('hoje', 'no', 'hoje')],
      ['classificar', 'A classificar', 'var(--marca-dourado)', 'CT-e de transportadora mista ainda sem digitalização.', ir('classificar', 'no', 'classificar')],
      ['fora', 'Fora do escopo', 'var(--axis)', 'Pela lista "Fora do escopo" e pelas decisões manuais.', ir('fora', 'fora', '')],
      ['canceladas', 'Canceladas ou recusadas', 'var(--axis)', 'SEFAZ 101/151 ou manifestação 03/20.', ir('canceladas', 'canceladas', '')],
      ['arquivadas', 'Backlog arquivado', 'var(--axis)', corte, ir('arquivadas', 'arquivadas', '')]
    ];
    encher(s.situacao, titulo('Situação do acompanhamento', 'NF-e e CT-e juntos, no período. As notas fora do escopo (cavaco, etanol, DDGS, milho e o frete desses produtos), as canceladas ou recusadas e o backlog arquivado não entram no painel, nas etapas nem nas pendências; o filtro "Notas", no topo, mostra cada grupo. A busca acha todas.'),
      h('div', { class: 'kpis k4', style: 'margin-top:8px' }, defs.map(([k, t, cor, d, fn]) => clicavel(h('div', { class: 'kpi cor', style: `--cor:${cor}` },
        h('div', { class: 'rot', text: t }), h('div', { class: 'val', text: fmtInt((nfe[k] || 0) + (cte[k] || 0)) }),
        h('div', { class: 'det', text: `NF-e ${fmtInt(nfe[k] || 0)} · CT-e ${fmtInt(cte[k] || 0)}` })), fn, d + ' Clique para ver a lista.'))));
  } catch (e) { encher(s.situacao, caixaErro('Erro na situação do acompanhamento', e)); }

  // Frete (CT-e) por etapa
  try {
    const cte = (await consulta(`SELECT etapa_ordem, etapa_follow, count(*)::INTEGER AS n FROM v_cte WHERE ${per} GROUP BY ALL ORDER BY etapa_ordem`)).linhas;
    if (parou()) return;
    const etapasC = [[1, 'Em processamento no VT IN'], [2, 'Aguardando pedido de frete (A10)'], [3, 'Lançado']];
    const tot = cte.reduce((a, r) => a + r.n, 0);
    encher(s.frete, titulo('Frete (CT-e) por etapa', 'Lançamento do CT-e e atribuição do pedido de frete (etapa A10 do VT IN), pela data de emissão.'),
      h('div', { class: 'kpis', style: 'margin-top:8px' },
        h('div', { class: 'kpi total' }, h('div', { class: 'rot', text: 'CT-e no período' }), h('div', { class: 'val', text: fmtInt(tot) })),
        etapasC.map(([o, t]) => {
          const n = (cte.find(r => r.etapa_ordem === o) || {}).n || 0, pct = tot ? n / tot : 0;
          return clicavel(h('div', { class: 'kpi' },
            h('div', { class: 'rot' }, h('span', { class: 'dot', style: `background:${COR_ETAPA_CTE[o]}` }), t),
            h('div', { class: 'val', text: fmtInt(n) }), h('div', { class: 'det', text: `${fmtDec(pct * 100, 0)}% do total` }),
            h('div', { class: 'barra' }, h('span', { style: `width:${(pct * 100).toFixed(1)}%;background:${COR_ETAPA_CTE[o]}` }))), () => irParaPendencias('CT-e', o), 'Ver a lista');
        })));
  } catch (e) { encher(s.frete, caixaErro('Erro no frete', e)); }

  // Prazo da Della Volpe: só as NF-e com coleta dela (decidido em 22/11/2026)
  try {
    const p = (await consulta(`SELECT count(*) FILTER (WHERE prazo_dv IS NOT NULL)::INTEGER AS com_dv,
          count(*) FILTER (WHERE prazo_dv = 'Atrasada')::INTEGER AS atrasadas, count(*) FILTER (WHERE prazo_dv = 'No prazo')::INTEGER AS no_prazo,
          count(*) FILTER (WHERE prazo_dv = 'Entregue no prazo')::INTEGER AS ent_prazo, count(*) FILTER (WHERE prazo_dv = 'Entregue com atraso')::INTEGER AS ent_atraso,
          median(dias_atraso_dv)::DOUBLE AS mediana_atraso
        FROM v_nfe WHERE ${per}`)).linhas[0];
    if (parou()) return;
    const entregues = p.ent_prazo + p.ent_atraso;
    const kpi = (rot, n, det, cor, fn) => clicavel(h('div', { class: 'kpi cor', style: `--cor:${cor}` },
      h('div', { class: 'rot', text: rot }), h('div', { class: 'val', text: fmtInt(n) }), det ? h('div', { class: 'det', text: det }) : null), fn, 'Ver a lista');
    encher(s.prazo, titulo('Prazo da Della Volpe', 'Só as NF-e com coleta da Della Volpe, no período. Vale o status de atraso e a previsão de entrega do relatório dela; a entrega é a data de entrega dela ou, sem ela, a digitalização. Nas outras transportadoras não há prazo.'),
      p.com_dv ? h('div', { class: 'kpis k4', style: 'margin-top:8px' },
        kpi('Atrasadas, ainda não entregues', p.atrasadas, p.mediana_atraso !== null ? `metade com até ${fmtDec(p.mediana_atraso, 0)} dia(s) de atraso` : '', 'var(--critical)', p.atrasadas ? () => irParaEtapa('coleta', 'atrasada_dv') : null),
        kpi('No prazo, ainda não entregues', p.no_prazo, '', 'var(--marca-claro)', null),
        kpi('Entregues no prazo', p.ent_prazo, entregues ? `${fmtDec(p.ent_prazo / entregues * 100, 0)}% das entregues` : '', 'var(--good)', null),
        kpi('Entregues com atraso', p.ent_atraso, entregues ? `${fmtDec(p.ent_atraso / entregues * 100, 0)}% das entregues` : '', 'var(--serious)', null))
        : h('p', { class: 'sub', text: 'Nenhuma NF-e com coleta da Della Volpe no período. Importe o relatório da Della Volpe.' }));
  } catch (e) { encher(s.prazo, caixaErro('Erro no prazo da Della Volpe', e)); }

  // Pendências por etapa × tempo parado
  try {
    const faixas = [['f0', '0–7 dias'], ['f1', '8–15'], ['f2', '16–30'], ['f3', 'mais de 30'], ['fx', 'sem data']];
    const sqlF = `count(*) FILTER (WHERE dias_na_etapa <= 7)::INTEGER AS f0, count(*) FILTER (WHERE dias_na_etapa BETWEEN 8 AND 15)::INTEGER AS f1,
        count(*) FILTER (WHERE dias_na_etapa BETWEEN 16 AND 30)::INTEGER AS f2, count(*) FILTER (WHERE dias_na_etapa > 30)::INTEGER AS f3,
        count(*) FILTER (WHERE dias_na_etapa IS NULL)::INTEGER AS fx`;
    const nfe = (await consulta(`SELECT 'NF-e' AS tipo, etapa_ordem, etapa_follow, ${sqlF} FROM v_nfe WHERE situacao = 'Pendente' AND ${per} GROUP BY ALL ORDER BY etapa_ordem`)).linhas;
    const cte = (await consulta(`SELECT 'CT-e' AS tipo, etapa_ordem, etapa_follow, ${sqlF} FROM v_cte WHERE situacao = 'Pendente' AND ${per} GROUP BY ALL ORDER BY etapa_ordem`)).linhas;
    if (parou()) return;
    const linhas = nfe.concat(cte);
    const max = Math.max(1, ...linhas.flatMap(r => faixas.map(([k]) => r[k])));
    const RAMPA = ['var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)', 'var(--heat-5)', 'var(--heat-6)'];
    const corCel = (n) => n ? RAMPA[Math.min(RAMPA.length - 1, Math.floor((n / max) * (RAMPA.length - 0.01)))] : 'transparent';
    const tinta = (n) => n && (n / max) > 0.5 ? 'var(--heat-tx-forte)' : 'var(--ink)';
    const t = h('table', { class: 'tabela heat' },
      h('thead', null, h('tr', null, h('th', { text: 'Etapa (tempo parado nela)' }), faixas.map(([, r]) => h('th', { class: 'num', text: r })))),
      h('tbody', null, linhas.map(r => h('tr', null,
        h('td', null, h('span', { class: 'muted', text: r.tipo + ' · ' }), chipEtapa(r.etapa_ordem, r.etapa_follow, r.tipo)),
        faixas.map(([k, rot]) => h('td', {
          class: 'cel' + (r[k] ? '' : ' zero'), style: `background:${corCel(r[k])};color:${tinta(r[k])}`,
          title: `${r[k]} ${r.tipo} em "${r.etapa_follow}" há ${rot}`, onclick: r[k] ? () => irParaPendencias(r.tipo, r.etapa_ordem, k) : null
        }, r[k] ? fmtInt(r[k]) : '·'))))));
    encher(s.heat, titulo('Pendências por tempo parado na etapa', 'Dias desde a data da etapa atual (emissão, digitalização ou entrada). Clique numa célula para ver as notas.'),
      h('div', { class: 'tabela-wrap', style: 'margin-top:8px' }, t));
  } catch (e) { encher(s.heat, caixaErro('Erro nas pendências', e)); }

  // Tempo entre etapas
  try {
    const partes = S.TRECHOS.map(([rot, col], i) => `SELECT ${i} AS ordem, ${q(rot)} AS trecho, median(${col})::DOUBLE AS mediana, quantile_cont(${col}, 0.9)::DOUBLE AS p90, count(${col})::INTEGER AS notas, count(*) FILTER (WHERE ${col} < 0)::INTEGER AS negativos FROM v_nfe WHERE ${per}`);
    partes.push(`SELECT 99 AS ordem, 'CT-e: emissão → lançamento' AS trecho, median(d_emissao_lanc)::DOUBLE, quantile_cont(d_emissao_lanc, 0.9)::DOUBLE, count(d_emissao_lanc)::INTEGER, count(*) FILTER (WHERE d_emissao_lanc < 0)::INTEGER FROM v_cte WHERE ${per}`);
    const r = (await consulta(partes.join(' UNION ALL ') + ' ORDER BY ordem')).linhas;
    if (parou()) return;
    const max = Math.max(1, ...r.map(x => x.mediana || 0));
    const t = h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, h('th', { text: 'Trecho' }), h('th', { text: 'Mediana (dias)' }), h('th', { class: 'num', text: '90% em até' }), h('th', { class: 'num', text: 'Notas medidas' }))),
      h('tbody', null, r.map(x => h('tr', null,
        h('td', { text: x.trecho }),
        h('td', null, h('div', { class: 'barrah' }, h('div', { class: 'trilho' }, h('span', { style: `width:${x.mediana ? Math.max(2, (x.mediana / max) * 100) : 0}%` })), h('span', { style: 'min-width:34px;text-align:right', text: x.mediana === null ? '—' : fmtDec(x.mediana, 1) }))),
        h('td', { class: 'num', text: x.p90 === null ? '—' : fmtDec(x.p90, 0) }),
        h('td', { class: 'num' }, fmtInt(x.notas), x.negativos ? h('span', { class: 'tag nao', style: 'margin-left:6px', title: 'Intervalos negativos (datas fora de ordem)', text: `${x.negativos} neg.` }) : null)))));
    encher(s.tempos, titulo('Tempo entre etapas', 'Só conta as notas que têm as duas datas do trecho. Trechos com poucas notas medidas indicam fonte faltando.'),
      h('div', { class: 'tabela-wrap', style: 'margin-top:8px' }, t));
  } catch (e) { encher(s.tempos, caixaErro('Erro nos tempos', e)); }

  // Vencimento das pendências
  try {
    const faixasV = [['v3', 'Vencida +15 d', 'var(--vermelho-bg)', 'var(--vermelho-tx)'], ['v2', 'Vencida 1–15 d', 'var(--vermelho-bg)', 'var(--vermelho-tx)'],
      ['v1', 'Vence 0–7 d', 'var(--amarelo-bg)', 'var(--amarelo-tx)'], ['v0', 'Vence 8–15 d', 'transparent', 'var(--ink)'], ['vf', 'Vence +15 d', 'transparent', 'var(--ink)']];
    const consultaV = (vw, tipo) => `SELECT ${q(tipo)} AS tipo,
          count(*) FILTER (WHERE dias_para_vencer < -15)::INTEGER AS v3, count(*) FILTER (WHERE dias_para_vencer BETWEEN -15 AND -1)::INTEGER AS v2,
          count(*) FILTER (WHERE dias_para_vencer BETWEEN 0 AND 7)::INTEGER AS v1, count(*) FILTER (WHERE dias_para_vencer BETWEEN 8 AND 15)::INTEGER AS v0,
          count(*) FILTER (WHERE dias_para_vencer > 15)::INTEGER AS vf
        FROM ${vw} WHERE situacao = 'Pendente' AND ${per}`;
    const r = (await consulta(consultaV('v_nfe', 'NF-e') + ' UNION ALL ' + consultaV('v_cte', 'CT-e'))).linhas;
    const venc = (await consulta(`SELECT count(*) FILTER (WHERE lancada_apos_vencimento)::INTEGER AS depois, count(*) FILTER (WHERE lancada AND data_miro IS NOT NULL)::INTEGER AS lancadas FROM v_nfe WHERE ${per}`)).linhas[0];
    if (parou()) return;
    const t = h('table', { class: 'tabela heat' },
      h('thead', null, h('tr', null, h('th', { text: 'Tipo' }), faixasV.map(([, rot]) => h('th', { class: 'num', text: rot })))),
      h('tbody', null, r.map(x => h('tr', null, h('td', { class: 'nowrap', text: x.tipo }),
        faixasV.map(([k, rot, fundo, cor]) => h('td', { class: 'cel' + (x[k] ? '' : ' zero'), style: x[k] ? `background:${fundo};color:${cor};font-weight:${k === 'v3' || k === 'v2' ? 700 : 400}` : null,
          title: `${x[k]} ${x.tipo}: ${rot.toLowerCase()}`, onclick: x[k] ? () => irParaPendencias(x.tipo, 'pendentes', '', '', k) : null }, x[k] ? fmtInt(x[k]) : '·'))))));
    encher(s.venc, titulo('Pendências por vencimento', `Vencimento estimado em emissão + ${st.cfg.diasVencimento ?? 30} dias, ou a data informada na nota (cartão Acompanhamento). A lista de pendências vem ordenada por ele.`),
      h('div', { class: 'tabela-wrap', style: 'margin-top:8px' }, t),
      h('p', { class: 'sub', style: 'margin:8px 0 0', text: venc.lancadas ? `NF-e lançadas depois do vencimento no período: ${fmtInt(venc.depois)} de ${fmtInt(venc.lancadas)} (${fmtDec(venc.depois / venc.lancadas * 100, 0)}%).` : 'Nenhuma NF-e lançada no período.' }));
  } catch (e) { encher(s.venc, caixaErro('Erro no vencimento', e)); }
}
