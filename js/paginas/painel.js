/* Painel (página inicial), enxuto: 4 cartões só com título e número, a trilha do pedido, as NF-e por semana e,
   à direita, os avisos e as ações para hoje. A explicação de cada quadro fica no "i" do título ou no próprio cartão
   (ao passar o mouse). Os quadros de análise ficam na página Indicadores; qualidade dos dados e transportadoras
   novas, em Configurações. */
import { mostrarAba } from '../app.js';
import { avisoFiltroEscopo, mudarFiltroEscopo } from '../nucleo/acompanhamento.js';
import { consulta, valor } from '../nucleo/banco.js';
import { $, carregandoLinha, clicavel, encher, esq, esqCartao, esqTabela, h, ico, limpar, slot, titulo } from '../nucleo/dom.js';
import { st } from '../nucleo/estado.js';
import { caixaErro, fmtData, fmtDec, fmtInt, hojeISO } from '../nucleo/formato.js';
import { blocoPeriodo, condPeriodo } from '../nucleo/periodo.js';
import { abrirDetalhe } from './detalhe.js';
import { irParaEtapa } from './etapas.js';
import { carregarDemo } from './importar.js';
import { irParaPendencias } from './pendencias.js';

// ------------------------------------------------------------------ PAINEL (visual do "dashboard 1")
// Monta a página com esqueletos no lugar de cada quadro; cada consulta enche o seu quadro quando termina.
export function montarPainel(box) {
  const s = {};
  s.atualizado = h('p', { class: 'atualizado' });
  s.cab = h('div', { class: 'painel-cab' }, h('div', null, h('h1', { text: 'Visão geral' }), s.atualizado), h('span', { class: 'espaco' }));
  s.kpis = [0, 1, 2, 3].map(() => slot('kpi-g', [esq('t', 'width:55%'), esq('n')]));
  s.trilha = slot('card', [esq('t', 'width:35%'), h('div', { class: 'rosca-bloco' }, esq('r'), h('div', null, esqTabela(5)))]);
  s.grafico = slot('card', esqCartao(0, true));
  s.avisos = slot('secao-lat', [esq('t', 'width:40%'), esqTabela(5)]);
  s.acoes = slot('secao-lat', [esq('t', 'width:50%'), esqTabela(4)]);
  box.append(s.cab, h('div', { class: 'painel-grade' },
    h('div', { class: 'stack', style: 'min-width:0' },
      h('div', { class: 'kpis-grandes' }, s.kpis),
      h('div', { class: 'linha-graficos' }, s.trilha, s.grafico)),
    h('aside', { class: 'painel-lateral' }, h('div', { class: 'card' }, s.avisos, s.acoes))));
  return s;
}

// Medidor em meia-lua (0 a 100%)
function medidor(pct) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const ang = Math.PI * (1 - p / 100), cx = 50, cy = 52, r = 40;
  const px = (cx + (r - 12) * Math.cos(ang)).toFixed(1), py = (cy - (r - 12) * Math.sin(ang)).toFixed(1);
  const sp = h('span', { style: 'display:contents' });
  sp.innerHTML = `<svg class="medidor" viewBox="0 0 100 58" aria-hidden="true">
      <path class="trilho-m" d="M10 52 A40 40 0 0 1 90 52" fill="none" stroke-width="9" stroke-linecap="round"/>
      <path class="valor-m" d="M10 52 A40 40 0 0 1 90 52" fill="none" stroke-width="9" stroke-linecap="round" pathLength="100" stroke-dasharray="${p.toFixed(1)} 100"/>
      <line class="ponteiro" x1="50" y1="52" x2="${px}" y2="${py}" stroke-width="2.5" stroke-linecap="round"/><circle cx="50" cy="52" r="3.5" fill="currentColor" opacity=".6"/></svg>`;
  return sp;
}

// Rosca com as etapas da trilha
function rosca(valores, cores, centro, rotCentro, aoClicar) {
  const tot = valores.reduce((a, b) => a + b, 0);
  const wrap = h('div', { class: 'rosca' });
  let svg = '<svg viewBox="0 0 120 120" role="img" aria-label="Distribuição por etapa">';
  svg += '<circle cx="60" cy="60" r="46" fill="none" style="stroke:var(--grid)" stroke-width="24"/>';
  let acum = 0;
  const C = 2 * Math.PI * 46;
  valores.forEach((v, i) => {
    if (!tot || !v) return;
    const fr = v / tot, folga = valores.filter(Boolean).length > 1 ? 0.6 : 0;
    svg += `<circle class="fatia" data-i="${i}" cx="60" cy="60" r="46" fill="none" style="stroke:${cores[i]}" stroke-width="24" stroke-dasharray="${Math.max(0, fr * C - folga).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acum * C).toFixed(2)}"><title>Etapa ${i + 1}: ${fmtInt(v)}</title></circle>`;
    acum += fr;
  });
  wrap.innerHTML = svg + '</svg>';
  wrap.querySelectorAll('circle.fatia').forEach(c => c.addEventListener('click', () => aoClicar(Number(c.dataset.i))));
  wrap.append(h('div', { class: 'centro' }, h('b', { text: fmtInt(centro) }), h('span', { text: rotCentro })));
  return wrap;
}

// Gráfico de área: notas emitidas e lançadas por semana
function graficoArea(pontos) {
  const W = 600, H = 190, P = 10, n = pontos.length;
  const max = Math.max(1, ...pontos.flatMap(p => [p.emitidas, p.lancadas]));
  const x = (i) => n === 1 ? W / 2 : (i / (n - 1)) * W;
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const linha = (k) => pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const area = (k) => `${linha(k)} L${x(n - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const id = 'ga' + Math.random().toString(36).slice(2, 8);
  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Notas emitidas e lançadas por semana">
      <defs><linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--graf-1);stop-opacity:.45"/><stop offset="1" style="stop-color:var(--graf-1);stop-opacity:0"/></linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--graf-2);stop-opacity:.22"/><stop offset="1" style="stop-color:var(--graf-2);stop-opacity:0"/></linearGradient></defs>`;
  [0.25, 0.5, 0.75].forEach(f => { const yy = (P + f * (H - 2 * P)).toFixed(1); svg += `<line class="grade" x1="0" x2="${W}" y1="${yy}" y2="${yy}" vector-effect="non-scaling-stroke"/>`; });
  svg += `<path d="${area('emitidas')}" fill="url(#${id}a)"/><path d="${area('lancadas')}" fill="url(#${id}b)"/>`;
  svg += `<path class="l1" d="${linha('emitidas')}" fill="none" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
  svg += `<path class="l2" d="${linha('lancadas')}" fill="none" stroke-width="2" stroke-dasharray="5 4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
  const larg = n > 1 ? W / (n - 1) : W;
  pontos.forEach((p, i) => { svg += `<rect class="alvo" x="${Math.max(0, x(i) - larg / 2).toFixed(1)}" y="0" width="${larg.toFixed(1)}" height="${H}" fill="transparent"><title>Semana de ${fmtData(p.s)}: ${fmtInt(p.emitidas)} emitida(s), ${fmtInt(p.lancadas)} lançada(s)</title></rect>`; });
  const g = h('div', { class: 'grafico-area' });
  g.innerHTML = svg + '</svg>';
  const meio = pontos[Math.floor((n - 1) / 2)];
  g.append(h('div', { class: 'eixo-x' }, h('span', { text: fmtData(pontos[0].s).slice(0, 5) }), n > 2 ? h('span', { text: fmtData(meio.s).slice(0, 5) }) : null, h('span', { text: fmtData(pontos[n - 1].s).slice(0, 5) })));
  return g;
}

export async function renderPainel() {
  const box = limpar($('aba-painel'));
  const vez = st.vezPainel = (st.vezPainel || 0) + 1;
  const parou = () => vez !== st.vezPainel; // outra atualização do painel começou: esta para
  box.append(carregandoLinha('Lendo a base…'));
  let total = 0;
  try { total = await valor('SELECT count(*)::INTEGER FROM t_vtin'); } catch (e) { limpar(box).append(caixaErro('Erro ao ler a base', e)); return; }
  if (parou()) return;
  limpar(box);
  if (st.errosViews.length) box.append(h('div', { class: 'aviso erro', style: 'margin-bottom:16px' }, `${st.errosViews.length} consulta(s) do modelo deram erro. Veja em Configurações › Diagnóstico.`));
  if (!total) { box.append(boasVindas()); return; }
  // Sem a lista "Fora do escopo" (vem do arquivo de configuração da empresa), as notas de cavaco, etanol etc. entram no painel
  if (!(st.cfg.escopo || []).length && st.lotes.some(l => !l.demo)) box.append(h('div', { class: 'aviso atencao linha', style: 'margin-bottom:14px' },
    h('span', { style: 'flex:1;min-width:260px', text: 'A lista "Fora do escopo" está vazia neste navegador: as notas de cavaco, etanol, milho e frete de produto estão entrando no acompanhamento. Importe o arquivo de configuração da empresa.' }),
    h('button', { class: 'btn primario', text: 'Ir para Configurações', onclick: () => mostrarAba('config') })));

  { const av = avisoFiltroEscopo(); if (av) box.append(h('div', { style: 'margin-bottom:14px' }, av)); }
  const s = montarPainel(box);
  s.cab.append(blocoPeriodo(renderPainel));
  const ult = st.lotes[st.lotes.length - 1];
  if (ult) s.atualizado.textContent = `Última importação: ${new Date(ult.importado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;
  const per = condPeriodo('data_emissao');
  const irLista = async (tipo, filtro, mostrar) => { await mudarFiltroEscopo(filtro, true); irParaPendencias(tipo, filtro === 'no' ? 'pendentes' : 'todas', '', mostrar); };
  // Cartão grande: só título e número; a explicação vai no "title" (aparece ao passar o mouse)
  const cartao = (el, rot, val, dica, fn, ...extra) => {
    encher(el, h('div', { class: 'rot', text: rot }), h('div', { class: 'val', text: val }), extra);
    el.title = dica;
    return clicavel(el, fn, dica);
  };

  // Situação do acompanhamento (NF-e e CT-e juntos, sem o filtro do topo): cartões 1 e 2, "a classificar" e o total de ações para hoje
  let situacao = {};
  try {
    const r = (await consulta(`SELECT tipo,
          count(*) FILTER (WHERE em_acompanhamento)::INTEGER AS acomp,
          count(*) FILTER (WHERE em_acompanhamento AND dias_para_vencer < 0)::INTEGER AS vencidas,
          count(*) FILTER (WHERE em_acompanhamento AND dias_para_vencer BETWEEN 0 AND 7)::INTEGER AS vencem,
          count(*) FILTER (WHERE escopo = 'A classificar' AND situacao = 'Pendente')::INTEGER AS classificar
        FROM v_documentos WHERE ${per} GROUP BY tipo`)).linhas;
    if (parou()) return;
    const nfe = r.find(x => x.tipo === 'NF-e') || {}, cte = r.find(x => x.tipo === 'CT-e') || {};
    const soma = (k) => (nfe[k] || 0) + (cte[k] || 0);
    const tipoDe = (k) => (nfe[k] || 0) === 0 && (cte[k] || 0) > 0 ? 'CT-e' : 'NF-e';
    situacao = { classificar: soma('classificar'), tipoClassificar: tipoDe('classificar') };
    cartao(s.kpis[0], 'Em acompanhamento', fmtInt(soma('acomp')),
      `NF-e ${fmtInt(nfe.acomp || 0)} · CT-e ${fmtInt(cte.acomp || 0)}: notas pendentes no escopo, no período. Clique para ver a lista.`,
      () => irLista(tipoDe('acomp'), 'no', ''));
    s.kpis[1].classList.toggle('critico', soma('vencidas') > 0);
    cartao(s.kpis[1], 'Vencidas', fmtInt(soma('vencidas')),
      `NF-e ${fmtInt(nfe.vencidas || 0)} · CT-e ${fmtInt(cte.vencidas || 0)} vencidas; mais ${fmtInt(soma('vencem'))} vencem em até 7 dias. Vencimento: data informada na nota ou emissão + ${st.cfg.diasVencimento ?? 30} dias. Clique para ver a lista.`,
      () => irLista(tipoDe('vencidas'), 'no', 'vencidas'));
  } catch (e) { encher(s.kpis[0], caixaErro('Erro na situação do acompanhamento', e)); encher(s.kpis[1], h('p', { class: 'sub', text: 'Sem dados (erro ao lado).' })); }

  // Avisos do XML (pedido e transportadora), notas conformes e CT-e a classificar
  try {
    const a = (await consulta(`SELECT count(*) FILTER (WHERE tem_xml)::INTEGER AS com_xml, count(*) FILTER (WHERE situacao_processo = 'Conforme')::INTEGER AS conf,
          count(*) FILTER (WHERE alerta_transporte_nivel = 3)::INTEGER AS t3, count(*) FILTER (WHERE alerta_transporte_nivel = 3 AND NOT lancada)::INTEGER AS t3p,
          count(*) FILTER (WHERE alerta_transporte_nivel = 2)::INTEGER AS t2, count(*) FILTER (WHERE alerta_transporte_nivel = 2 AND NOT lancada)::INTEGER AS t2p,
          count(*) FILTER (WHERE alerta_transporte_nivel = 1)::INTEGER AS t1,
          count(*) FILTER (WHERE aviso_pedido_nivel = 3)::INTEGER AS p3, count(*) FILTER (WHERE aviso_pedido_nivel = 3 AND NOT lancada)::INTEGER AS p3p,
          count(*) FILTER (WHERE aviso_pedido_nivel = 2)::INTEGER AS p2, count(*) FILTER (WHERE aviso_pedido_nivel = 1)::INTEGER AS p1,
          count(*) FILTER (WHERE lancada AND data_digitalizacao IS NULL)::INTEGER AS sd,
          count(*) FILTER (WHERE prazo_dv = 'Atrasada')::INTEGER AS dva
        FROM v_nfe WHERE ${per}`)).linhas[0];
    if (parou()) return;
    const pct = a.com_xml ? a.conf / a.com_xml * 100 : null;
    cartao(s.kpis[2], 'Conformes ao processo', pct === null ? '—' : fmtDec(pct, 0) + '%',
      a.com_xml ? `${fmtInt(a.conf)} de ${fmtInt(a.com_xml)} NF-e com XML, no período, sem nenhum aviso de pedido, de transportadora ou de digitalização. Clique para ver as notas conformes.`
        : 'Importe os XML de NF-e e CT-e para medir.',
      a.conf ? () => irParaEtapa('lancado', 'conformes') : null, medidor(pct));
    const itens = [
      ['max', 'alerta', 'Frete do destinatário sem transportadora', a.t3, `${fmtInt(a.t3p)} ainda não lançada(s). Frete por conta da Alvorada e a nota não informa a transportadora.`, () => irParaEtapa('coleta', 'fob_sem')],
      ['vermelho', 'doc', 'Nota emitida sem pedido', a.p3, `${fmtInt(a.p3p)} ainda não lançada(s). Nenhuma fonte achou o pedido.`, () => irParaEtapa('pedido', 'aviso_sem')],
      ['vermelho', 'caminhao', 'Sem transportadora', a.t2, `${fmtInt(a.t2p)} ainda não lançada(s).`, () => irParaEtapa('coleta', 'sem_transp')],
      ['laranja', 'doc', 'Pedido divergente', a.p2, 'Pedido do XML fora da ME2N ou diferente do digitado.', () => irParaEtapa('pedido', 'aviso_div')],
      ['laranja', 'caminhao', 'Entrega atrasada (Della Volpe)', a.dva, 'Coleta da Della Volpe ainda não entregue e atrasada pelo status de atraso ou pela previsão de entrega dela.', () => irParaEtapa('coleta', 'atrasada_dv')],
      ['amarelo', 'doc', 'Fornecedor não informou o pedido', a.p1, 'O XML não tem o pedido, mas ele foi achado em outra fonte.', () => irParaEtapa('pedido', 'aviso_naoinf')],
      ['amarelo', 'caminhao', 'Transporte próprio', a.t1, 'Transporte do remetente ou do destinatário.', () => irParaEtapa('coleta', 'proprio')],
      ['amarelo', 'importar', 'Lançada sem digitalização', a.sd, 'Conta como entregue, mas falta a data oficial do recebimento.', () => irParaEtapa('entregue', 'sem_digit')],
      ['amarelo', 'etiqueta', 'CT-e a classificar', situacao.classificar || 0, 'CT-e de transportadora mista ainda sem digitalização: decida se é do almoxarifado.', () => irLista(situacao.tipoClassificar || 'CT-e', 'no', 'classificar')]
    ].filter(x => x[3]);
    encher(s.avisos, titulo('Avisos', a.com_xml ? 'Pelos XML importados, no período. O XML chega antes do caminhão: dá para cobrar antes do recebimento.' : 'Importe os XML de NF-e e CT-e para ver os avisos de pedido e de transportadora.'),
      h('ul', { class: 'lista-avisos' },
        itens.map(([cls, ic, t, n, d, fn]) => clicavel(h('li', { class: cls === 'max' ? 'max' : '' }, h('span', { class: 'ico ' + (cls === 'max' ? 'vermelho' : cls) }, ico(ic)),
          h('div', { class: 'tx', text: `${fmtInt(n)} · ${t}` })), fn, d + ' Clique para ver a lista.')),
        a.conf ? clicavel(h('li', null, h('span', { class: 'ico verde' }, ico('check')), h('div', { class: 'tx', text: `${fmtInt(a.conf)} · Notas conformes ao processo` })),
          () => irParaEtapa('lancado', 'conformes'), 'Notas com XML e sem nenhum aviso. Clique para ver a lista.') : null,
        !itens.length && a.com_xml ? h('li', { style: 'cursor:default' }, h('span', { class: 'ico verde' }, ico('check')), h('div', { class: 'tx', text: 'Nenhum aviso no período' })) : null));
  } catch (e) { encher(s.kpis[2], caixaErro('Erro nos avisos', e)); encher(s.avisos, caixaErro('Erro nos avisos', e)); }

  // NF-e lançadas no período
  try {
    const l = (await consulta(`SELECT count(*)::INTEGER AS emitidas, count(*) FILTER (WHERE lancada)::INTEGER AS lancadas FROM v_nfe WHERE ${per}`)).linhas[0];
    if (parou()) return;
    const pct = l.emitidas ? l.lancadas / l.emitidas * 100 : 0;
    cartao(s.kpis[3], 'NF-e lançadas', fmtInt(l.lancadas),
      `${fmtDec(pct, 0)}% das ${fmtInt(l.emitidas)} NF-e emitidas no período. Clique para ver a lista.`,
      () => irParaEtapa('lancado', 'lancadas'), h('div', { class: 'barra' }, h('span', { style: `width:${pct.toFixed(1)}%` })));
  } catch (e) { encher(s.kpis[3], caixaErro('Erro nas lançadas', e)); }

  // Trilha do pedido (rosca)
  try {
    const pp = condPeriodo('coalesce(primeira_emissao, data_pedido)');
    const ped = (await consulta(`SELECT etapa_ordem, count(*)::INTEGER AS n FROM v_pedido_trilha WHERE etapa_ordem IS NOT NULL AND ${pp} GROUP BY ALL`)).linhas;
    const nPed = (o) => (ped.find(x => x.etapa_ordem === o) || {}).n || 0;
    const nf = (await consulta(`SELECT count(*) FILTER (WHERE NOT entregue)::INTEGER AS coleta, count(*) FILTER (WHERE entregue AND NOT lancada)::INTEGER AS entregue,
          count(*) FILTER (WHERE lancada)::INTEGER AS lancado FROM v_nfe WHERE ${per}`)).linhas[0];
    if (parou()) return;
    // 4 etapas (a RC saiu da trilha em 22/11/2026); etapa_ordem do pedido no SQL: 2 a 5
    const etapas = [
      ['Pedido de compra', nPed(2), 'Pedidos aguardando faturamento (ainda sem nota).', () => irParaEtapa('pedido', 'aguardando_coleta')],
      ['Coleta', nPed(3), `Pedidos coletados, aguardando entrega (${fmtInt(nf.coleta)} nota(s)).`, () => irParaEtapa('coleta', 'aguardando_entrega')],
      ['Pedido entregue', nPed(4), `Pedidos entregues, aguardando lançamento (${fmtInt(nf.entregue)} nota(s)).`, () => irParaEtapa('entregue', 'aguardando_lancamento')],
      ['Pedido lançado', nPed(5), `Pedidos com todas as notas lançadas (${fmtInt(nf.lancado)} nota(s)).`, () => irParaEtapa('lancado', 'lancadas')]
    ];
    const cores = ['var(--d2)', 'var(--d3)', 'var(--d4)', 'var(--d5)'];
    encher(s.trilha, titulo('Trilha do pedido', 'Quantos pedidos estão parados em cada etapa, no período. Clique numa etapa para ver a lista e pesquisar.'),
      h('div', { class: 'rosca-bloco' },
        rosca(etapas.map(e => e[1] || 0), cores, nPed(2) + nPed(3) + nPed(4), 'pedidos em andamento', (i) => etapas[i][3]()),
        h('ul', { class: 'legenda-etapas' }, etapas.map(([nome, v, d, fn], i) => clicavel(h('li', null,
          h('div', { class: 'nm' }, h('i', { style: `background:${cores[i]}` }), `${i + 1}. ${nome}`), h('div', { class: 'v', text: fmtInt(v) })), fn, d + ' Clique para abrir a etapa.')))));
  } catch (e) { encher(s.trilha, caixaErro('Erro na trilha do pedido', e)); }

  // Notas emitidas e lançadas por semana
  try {
    const r = (await consulta(`SELECT strftime(s, '%Y-%m-%d') AS s, sum(e)::INTEGER AS emitidas, sum(l)::INTEGER AS lancadas FROM (
          SELECT CAST(date_trunc('week', data_emissao) AS DATE) AS s, 1 AS e, 0 AS l FROM v_nfe WHERE data_emissao IS NOT NULL AND ${per}
          UNION ALL SELECT CAST(date_trunc('week', data_miro) AS DATE), 0, 1 FROM v_nfe WHERE lancada AND data_miro IS NOT NULL AND ${condPeriodo('data_miro')}
        ) x GROUP BY 1 ORDER BY 1`)).linhas;
    if (parou()) return;
    const legenda = h('div', { class: 'legenda-linha' }, h('span', null, h('i', { style: 'background:var(--graf-1)' }), 'emitidas'), h('span', null, h('i', { style: 'background:var(--graf-2)' }), 'lançadas'));
    if (!r.length) encher(s.grafico, titulo('NF-e por semana', 'Emitidas, pela data de emissão, e lançadas, pela data do lançamento.'), h('p', { class: 'sub', text: 'Sem notas no período.' }));
    else {
      const limite = st.periodo.de ? 60 : 16; // sem período escolhido: as últimas 16 semanas
      const mapa = new Map(r.map(x => [x.s, x]));
      const dia = 86400000, fim = Date.parse(r[r.length - 1].s + 'T00:00:00Z');
      const ini = Math.max(Date.parse(r[0].s + 'T00:00:00Z'), fim - (limite - 1) * 7 * dia);
      const pts = [];
      for (let t = ini; t <= fim; t += 7 * dia) { const k = new Date(t).toISOString().slice(0, 10), v = mapa.get(k) || {}; pts.push({ s: k, emitidas: v.emitidas || 0, lancadas: v.lancadas || 0 }); }
      const ultima = pts[pts.length - 1];
      encher(s.grafico, titulo('NF-e por semana', `Emitidas, pela data de emissão, e lançadas, pela data do lançamento. ${fmtInt(pts.reduce((a, p) => a + p.emitidas, 0))} emitidas em ${pts.length} semana(s); na última: ${fmtInt(ultima.emitidas)} emitida(s) e ${fmtInt(ultima.lancadas)} lançada(s). Passe o mouse no gráfico para ver cada semana.`),
        legenda, graficoArea(pts));
    }
  } catch (e) { encher(s.grafico, caixaErro('Erro no gráfico semanal', e)); }

  // Ações para hoje (coluna da direita, em linha do tempo)
  try {
    const n = await valor('SELECT count(*)::INTEGER FROM v_documentos WHERE acao_para_hoje');
    const r = await consulta(`SELECT tipo, proxima_acao_data, proxima_acao_texto, numero, emitente, chave FROM v_documentos WHERE acao_para_hoje ORDER BY proxima_acao_data, numero LIMIT 6`);
    if (parou()) return;
    const hoje = hojeISO();
    encher(s.acoes, titulo('Ações para hoje', 'Próximas ações com data até hoje, de notas pendentes. Registre a próxima ação no cartão Acompanhamento da nota.', h('span', { class: 'contagem', text: fmtInt(n) })),
      r.linhas.length ? h('ul', { class: 'linha-tempo' }, r.linhas.map(x => clicavel(h('li', null,
        h('span', { class: 'pt' + (x.proxima_acao_data && x.proxima_acao_data < hoje ? ' atrasada' : '') }),
        h('div', { style: 'min-width:0' }, h('div', { class: 'tx', text: x.proxima_acao_texto || '(ação sem descrição)' }),
          h('div', { class: 'sb', text: `${x.tipo} ${x.numero || ''} · ${x.emitente || '—'} · ${x.proxima_acao_data && x.proxima_acao_data < hoje ? 'atrasada desde ' : ''}${fmtData(x.proxima_acao_data)}` }))), () => abrirDetalhe(x.chave), 'Abrir a nota')))
        : h('p', { class: 'sub', text: 'Nenhuma ação para hoje.' }),
      n > r.linhas.length ? h('button', { class: 'btn pequeno', text: `Ver todas (${fmtInt(n)})`, onclick: () => irLista('NF-e', 'no', 'hoje') }) : null);
  } catch (e) { encher(s.acoes, caixaErro('Erro nas ações', e)); }
}

function boasVindas() {
  return h('div', { class: 'card stack', style: 'max-width:820px' },
    h('h2', { text: 'Base vazia' }),
    h('p', { class: 'sub', text: 'Este protótipo cruza as extrações do SAP e as planilhas de apoio dentro do próprio navegador, com o DuckDB. Nada é enviado para a internet: os arquivos são lidos aqui e a base fica guardada neste navegador.' }),
    h('ol', { style: 'margin:0;padding-left:20px' },
      h('li', { text: 'Para avaliar sem dados reais, carregue os dados fictícios: cerca de 400 NF-e e 260 CT-e de três meses, com os mesmos problemas das amostras (linha de total, datas em número serial, número de nota repetido, movimentos internos na MB51).' }),
      h('li', { text: 'Para usar com dados reais, importe primeiro o arquivo de configuração da empresa (Configurações › Configuração da empresa): ele traz a lista "Fora do escopo", que não fica no código da página. Depois vá em Importar dados e escolha os arquivos exportados do SAP e as planilhas. A página reconhece as colunas pelo nome e deixa você corrigir antes de importar.' }),
      h('li', { text: 'Cada importação vira um lote guardado com data e hora. Para cada chave vale a versão mais recente, e o histórico é mantido.' })),
    h('div', { class: 'linha' },
      h('button', { class: 'btn primario', text: 'Carregar dados fictícios', onclick: carregarDemo }),
      h('button', { class: 'btn', text: 'Ir para Importar dados', onclick: () => mostrarAba('importar') })));
}
