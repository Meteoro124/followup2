/* Aba Configurações: transportadoras novas, qualidade dos dados, regras, configuração da empresa, backup,
   diagnóstico e lista "Fora do escopo". */
import { atualizarStatus, mostrarAba } from '../app.js';
import { L } from '../logica/index.js';
import { atualizarContadores } from '../nucleo/acompanhamento.js';
import { consulta, exec, idbGravar, idbLimpar, idbTodos, materializar, recriarViews, valor } from '../nucleo/banco.js';
import { $, baixar, blocoCarregando, carregandoLinha, comCarga, confirmar, encher, esq, esqTabela, h, limpar, livre, ocupado, slot, titulo, toast } from '../nucleo/dom.js';
import { cfgEmUso, DUCKDB_VERSAO, st } from '../nucleo/estado.js';
import { caixaErro, exportarLinhas, fmtDec, fmtInt, hojeISO, rotulo, tabela } from '../nucleo/formato.js';
import { campos } from './detalhe.js';
import { abrirLinha } from './etapas.js';
import { q, S } from '../sql/index.js';

// ------------------------------------------------------------------ MANUTENÇÃO (vieram da página inicial)
// Transportadoras com o primeiro CT-e recente e fora da lista: decidir uma vez (o número aparece no menu)
function cardTransportadorasNovas(alvo) {
  const card = slot('card', [esq('t', 'width:40%'), esqTabela(4)]);
  alvo.append(card);
  (async () => {
    try {
      const r = await consulta('SELECT raiz, transportadora, primeiro_cte, ctes::INTEGER AS ctes, digitalizados::INTEGER AS digitalizados FROM v_transportadoras_novas ORDER BY primeiro_cte DESC');
      const decidir = async (x, tipo) => {
        if (tipo === 'conhecida') st.cfg.transportadorasConhecidas = Array.from(new Set((st.cfg.transportadorasConhecidas || []).concat([x.raiz])));
        else st.cfg.escopo = (st.cfg.escopo || []).concat([{ regra: 'raiz', valor: x.raiz, nome: x.transportadora || '', tipo: tipo === 'mista' ? 'Mista' : 'Transportadora', motivo: tipo === 'mista' ? 'Classificação por CT-e' : 'Frete de produto', natureza: '', incluido_em: hojeISO() }]);
        await ocupado('Atualizando a lista…'); await salvarConfig(); livre(); renderConfig();
      };
      const bt = (texto, fn) => h('button', { class: 'btn pequeno', text: texto, onclick: fn });
      encher(card, titulo('Transportadoras novas', `Primeiro CT-e nos últimos ${st.cfg.diasTransportadoraNova ?? 45} dias e fora da lista "Fora do escopo". Decida uma vez e o aviso some. Almoxarifado: continua no acompanhamento. Fora do escopo: frete de produto, entra na lista. Mista: decide CT-e a CT-e. Na primeira importação de um período curto, todas aparecem aqui.`,
        h('span', { class: 'contagem', text: fmtInt(r.linhas.length) })),
        h('div', { style: 'margin-top:8px' }, tabela(r.cols, r.linhas, { altura: 300, vazio: 'Nenhuma transportadora nova para decidir.', rotuloAcoes: 'Decisão',
          acoes: (x) => h('span', { class: 'linha', style: 'gap:4px;flex-wrap:nowrap' }, bt('Almoxarifado', () => decidir(x, 'conhecida')), bt('Fora do escopo', () => decidir(x, 'fora')), bt('Mista', () => decidir(x, 'mista'))) })));
    } catch (e) { encher(card, caixaErro('Erro nas transportadoras novas', e)); }
  })();
}

// Qualidade dos dados: cada verificação mostra a rodinha até terminar de contar
function cardQualidade(alvo) {
  const lista = h('ul');
  const drill = h('div', { style: 'margin-top:12px' });
  alvo.append(h('div', { class: 'card qualidade' },
    titulo('Qualidade dos dados', 'Problemas encontrados na base inteira (sem o filtro de período). Clique em Ver para listar e exportar.'), lista, drill));
  const itens = S.VERIFICACOES.map(v => {
    const n = h('span', { class: 'n' }, h('span', { class: 'spinner pequeno', title: 'Contando…' }));
    const li = h('li', { 'aria-busy': 'true' }, n, h('div', { style: 'flex:1' }, h('div', { text: v.titulo }), h('div', { class: 'muted', style: 'font-size:12px', text: v.ajuda })));
    lista.append(li);
    return [v, li, n];
  });
  (async () => {
    for (const [v, li, nEl] of itens) {
      if (!lista.isConnected) return; // a aba foi redesenhada: esta contagem para
      let n = null, erro = null;
      try { n = await valor(`SELECT count(*)::INTEGER FROM (${v.sql}) x`); } catch (e) { erro = e; }
      li.removeAttribute('aria-busy');
      nEl.className = 'n' + (n ? '' : ' zero'); nEl.textContent = erro ? 'erro' : fmtInt(n);
      if (erro) li.querySelector('.muted').textContent = String(erro.message || erro);
      if (n) li.append(h('button', { class: 'btn pequeno', text: 'Ver', onclick: (ev) => comCarga(ev.currentTarget, () => abrirVerificacao(v, drill)) }));
    }
  })();
}

async function abrirVerificacao(v, alvo) {
  limpar(alvo).append(carregandoLinha(`Listando: ${v.titulo}…`), esqTabela(4));
  try {
    const r = await consulta(`SELECT * FROM (${v.sql}) x LIMIT 2000`);
    limpar(alvo);
    alvo.append(h('div', { class: 'linha', style: 'margin-bottom:6px' }, h('b', { text: v.titulo }), h('span', { class: 'espaco' }),
      h('button', { class: 'btn pequeno', text: 'Exportar Excel', onclick: () => exportarLinhas(r.cols, r.linhas, 'verificacao_' + v.id) }),
      h('button', { class: 'btn pequeno', text: 'Fechar', onclick: () => limpar(alvo) })));
    alvo.append(tabela(r.cols, r.linhas, { altura: 360, aoClicar: (r.cols.includes('chave') || r.cols.includes('pedido')) ? abrirLinha : null }));
    alvo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) { limpar(alvo).append(caixaErro('Erro', e)); }
}

// ------------------------------------------------------------------ CONFIGURAÇÕES
export async function salvarConfig() {
  try { await idbGravar('config', { k: 'cfg', v: st.cfg }); } catch (e) { /* segue */ }
  await recriarViews();
  atualizarStatus();
  atualizarContadores();
  toast(st.errosViews.length ? 'Configuração salva, mas há erros no modelo (veja o diagnóstico).' : 'Configuração salva.', !!st.errosViews.length);
}

export async function renderConfig() {
  const box = limpar($('aba-config'));
  const manutencao = h('div', { class: 'stack', style: 'margin-bottom:16px' });
  box.append(manutencao);
  cardTransportadorasNovas(manutencao);
  cardQualidade(manutencao);
  const g = h('div', { class: 'grid g2' });
  box.append(g);
  const centros = h('input', { type: 'text', value: st.cfg.centros.join(', '), style: 'width:100%' });
  const movs = h('input', { type: 'text', value: st.cfg.movimentos.join(', '), style: 'width:100%' });
  const dVenc = h('input', { type: 'number', min: '0', value: String(st.cfg.diasVencimento ?? 30), style: 'width:90px', 'aria-label': 'Dias do vencimento' });
  const corte = h('input', { type: 'date', value: st.cfg.corteBacklog || '', 'aria-label': 'Data de corte do backlog' });
  const dNova = h('input', { type: 'number', min: '0', value: String(st.cfg.diasTransportadoraNova ?? 45), style: 'width:90px', 'aria-label': 'Dias da transportadora nova' });
  const tb = h('tbody');
  const linhaCat = (c) => {
    const cat = h('input', { type: 'text', value: c.cat, style: 'width:60px', placeholder: '(vazio)' });
    const rot = h('input', { type: 'text', value: c.rotulo, style: 'width:100%' });
    const gr = h('select', null, [['Estoque', 'Estoque'], ['Débito direto', 'Débito direto'], ['', '(não comparar)']].map(([v, t]) => h('option', { value: v, text: t })));
    gr.value = c.grupo;
    const tr = h('tr', null, h('td', null, cat), h('td', null, rot), h('td', null, gr), h('td', null, h('button', { class: 'btn pequeno perigo', text: '×', onclick: () => tr.remove() })));
    tr._ler = () => ({ cat: cat.value.trim().toUpperCase(), rotulo: rot.value.trim() || ('Categoria ' + cat.value.trim().toUpperCase()), grupo: gr.value });
    return tr;
  };
  st.cfg.categorias.forEach(c => tb.append(linhaCat(c)));
  const salvar = async () => {
    st.cfg.centros = centros.value.split(/[,;\s]+/).map(s => L.stripZeros(s.trim())).filter(Boolean);
    st.cfg.movimentos = movs.value.split(/[,;\s]+/).map(s => L.stripZeros(s.trim())).filter(Boolean);
    st.cfg.categorias = Array.from(tb.children).map(tr => tr._ler());
    const num = (inp, padrao) => { const n = parseInt(inp.value, 10); return Number.isFinite(n) && n >= 0 ? n : padrao; };
    st.cfg.diasVencimento = num(dVenc, 30); st.cfg.diasTransportadoraNova = num(dNova, 45); st.cfg.corteBacklog = corte.value || '';
    await ocupado('Recriando o modelo…'); await salvarConfig(); livre(); renderConfig();
  };
  const linhaForm = (rot, campo, ajuda) => h('div', null, h('div', { text: rot }), campo, ajuda ? h('div', { class: 'muted', style: 'font-size:12px', text: ajuda }) : null);
  g.append(h('div', { class: 'card stack' },
    h('div', null, h('h2', { text: 'Regras do modelo' }), h('p', { class: 'sub', text: 'Ficam salvas neste navegador. Ao salvar, todas as visões são recriadas.' })),
    h('label', null, h('div', { text: 'Centros considerados (vazio = todos)' }), centros),
    h('label', null, h('div', { text: 'Tipos de movimento da MB51 considerados' }), movs),
    h('div', { class: 'linha', style: 'gap:24px;align-items:flex-start' },
      linhaForm('Vencimento estimado (dias após a emissão)', dVenc, 'Decidido em 14/11: 30 dias.'),
      linhaForm('Aviso de transportadora nova (dias)', dNova, 'Primeiro CT-e nesses dias = aviso no painel.')),
    linhaForm('Data de corte do backlog', corte, 'Pendências emitidas antes desta data vão para o backlog arquivado, fora da lista diária. Vazio = sem corte.'),
    h('div', null, h('h3', { text: 'Categoria de classificação contábil → rótulo e grupo' }),
      h('p', { class: 'sub', text: 'O grupo é comparado com a pasta (Débito Direto/Estoque) na verificação de qualidade. Regra decidida em 22/11/2026: vazio = estoque, K = débito direto (centro de custo), F = débito direto (ordem).' }),
      h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela' }, h('thead', null, h('tr', null, ['Categoria', 'Rótulo', 'Grupo', ''].map(x => h('th', { text: x })))), tb)),
      h('button', { class: 'btn pequeno', style: 'margin-top:6px', text: '+ categoria', onclick: () => tb.append(linhaCat({ cat: '', rotulo: '', grupo: '' })) })),
    h('div', { class: 'linha' }, h('button', { class: 'btn', text: 'Voltar ao padrão', onclick: async () => {
        // a lista "Fora do escopo" tem botão próprio e não volta ao padrão aqui
        const { escopo, raizesProprias, diasMista, transportadorasConhecidas } = st.cfg;
        st.cfg = Object.assign(JSON.parse(JSON.stringify(S.CONFIG_PADRAO)), { escopo, raizesProprias, diasMista, transportadorasConhecidas });
        await salvarConfig(); renderConfig(); } }),
      h('span', { class: 'espaco' }), h('button', { class: 'btn primario', text: 'Salvar regras', onclick: salvar }))));

  const inpBackup = h('input', { type: 'file', accept: '.json', onchange: (e) => { const a = e.target.files[0]; e.target.value = ''; if (a) restaurarBackup(a); } });
  const inpConfig = h('input', { type: 'file', accept: '.json', onchange: (e) => { const a = e.target.files[0]; e.target.value = ''; if (a) importarConfiguracao(a); } });
  const nEscopo = (st.cfg.escopo || []).length, nProprias = (st.cfg.raizesProprias || []).length;
  g.append(h('div', { class: 'card stack' },
    h('div', null, h('h2', { text: 'Configuração da empresa' }),
      h('p', { class: 'sub', style: 'margin:0', text: 'A lista "Fora do escopo" (com os CNPJs) e as raízes da própria empresa não ficam no código da página: vêm de um arquivo de configuração, que nunca vai para o GitHub. Num computador novo, importe o arquivo uma vez; ele fica guardado neste navegador. Para levar as mudanças deste navegador a outro computador, exporte.' })),
    nEscopo ? h('div', { class: 'aviso info', text: `Neste navegador: ${fmtInt(nEscopo)} empresa(s) na lista "Fora do escopo" e ${fmtInt(nProprias)} raiz(es) da própria empresa.` })
      : h('div', { class: 'aviso atencao', text: 'A lista "Fora do escopo" está vazia neste navegador: as notas de cavaco, etanol, milho e frete de produto entram no acompanhamento. Importe o arquivo de configuração da empresa.' }),
    h('div', { class: 'linha' }, h('label', { class: 'btn' + (nEscopo ? '' : ' primario') }, 'Importar arquivo de configuração…', inpConfig),
      h('button', { class: 'btn', text: 'Exportar a configuração deste navegador', onclick: exportarConfiguracao })),
    h('div', null, h('h2', { text: 'Base e backup' }),
      h('p', { class: 'sub', text: 'A base fica no armazenamento deste navegador. Limpar os dados de navegação apaga a base: guarde um backup numa pasta da rede.' })),
    h('div', { class: 'linha' }, h('button', { class: 'btn primario', text: 'Salvar backup (.json)', onclick: salvarBackup }),
      h('label', { class: 'btn' }, 'Restaurar backup…', inpBackup),
      h('span', { class: 'espaco' }), h('button', { class: 'btn perigo', text: 'Apagar toda a base', onclick: apagarTudo })),
    h('div', { id: 'diag' })));
  const lugarEscopo = h('div', { style: 'margin-top:16px' });
  box.append(lugarEscopo);
  renderDiagnostico($('diag'));
  { const espE = blocoCarregando('Carregando a lista "Fora do escopo"…', 5); lugarEscopo.append(espE);
    cardEscopo().then(c => { espE.remove(); lugarEscopo.append(c); }).catch(e => { espE.remove(); lugarEscopo.append(caixaErro('Erro na lista "Fora do escopo"', e)); }); }
}

// Lista "Fora do escopo": empresas cujas notas não passam pelo almoxarifado
async function cardEscopo() {
  const contagem = {};
  try {
    (await consulta(`SELECT lista_regra AS regra, lista_valor AS valor, count(*)::INTEGER AS n FROM v_escopo_lista GROUP BY ALL`))
      .linhas.forEach(x => { contagem[`${x.regra}|${x.valor}`] = x.n; });
  } catch (e) { /* sem contagem */ }
  const MOTIVOS = ['Produto (cavaco, etanol, DDGS)', 'Cavaco', 'Etanol', 'DDGS', 'Milho', 'Frete de produto', 'Classificação por CT-e', 'Outro'];
  const opcoes = (arr, atual, rotulo) => { const x = h('select', { 'aria-label': rotulo }, arr.map(([v, t]) => h('option', { value: v, text: t }))); x.value = atual; return x; };
  const tb = h('tbody');
  const linha = (e) => {
    const regra = opcoes([['raiz', 'Raiz (8 dígitos)'], ['cnpj', 'CNPJ completo (14)']], e.regra === 'cnpj' ? 'cnpj' : 'raiz', 'Regra');
    const valorInp = h('input', { type: 'text', value: e.valor || '', style: 'width:150px', class: 'mono', placeholder: 'só números', 'aria-label': 'CNPJ ou raiz' });
    const nome = h('input', { type: 'text', value: e.nome || '', style: 'width:100%;min-width:180px', 'aria-label': 'Nome' });
    const tipo = opcoes([['Fornecedor', 'Fornecedor'], ['Transportadora', 'Transportadora'], ['Mista', 'Mista (por CT-e)']], e.tipo || 'Fornecedor', 'Tipo');
    const motivo = h('input', { type: 'text', value: e.motivo || '', list: 'dl-motivos', style: 'width:100%;min-width:150px', 'aria-label': 'Motivo' });
    const natureza = h('input', { type: 'text', value: e.natureza || '', placeholder: '(opcional)', style: 'width:100%;min-width:150px', 'aria-label': 'Natureza da operação' });
    const incl = h('input', { type: 'date', value: e.incluido_em || '', 'aria-label': 'Incluída em' });
    const n = contagem[`${e.regra === 'cnpj' ? 'cnpj' : 'raiz'}|${e.valor}`];
    const tr = h('tr', null, h('td', null, regra), h('td', null, valorInp), h('td', null, nome), h('td', null, tipo), h('td', null, motivo), h('td', null, natureza), h('td', null, incl),
      h('td', { class: 'num', text: n ? fmtInt(n) : '—' }), h('td', null, h('button', { class: 'btn pequeno perigo', text: '×', title: 'Tirar da lista', onclick: () => tr.remove() })));
    tr._ler = () => ({ regra: regra.value, valor: valorInp.value.replace(/\D/g, ''), nome: nome.value.trim(), tipo: tipo.value, motivo: motivo.value.trim(), natureza: natureza.value.trim(), incluido_em: incl.value });
    return tr;
  };
  (st.cfg.escopo || []).forEach(e => tb.append(linha(e)));
  const proprias = h('input', { type: 'text', value: (st.cfg.raizesProprias || []).join(', '), style: 'width:200px', class: 'mono', 'aria-label': 'Raízes da própria empresa' });
  const dias = h('input', { type: 'number', min: '0', value: String(st.cfg.diasMista ?? 30), style: 'width:80px', 'aria-label': 'Dias da transportadora mista' });
  const erros = h('div');
  const salvar = async () => {
    limpar(erros);
    const linhas = Array.from(tb.children).map(tr => tr._ler()).filter(x => x.valor || x.nome);
    const raizesProprias = proprias.value.split(/[,;\s]+/).map(x => x.replace(/\D/g, '')).filter(Boolean);
    const problemas = [];
    linhas.forEach((x, i) => {
      if (x.regra === 'raiz' && !/^\d{8}$/.test(x.valor)) problemas.push(`Linha ${i + 1} (${x.nome || x.valor}): a raiz precisa ter 8 dígitos.`);
      if (x.regra === 'cnpj' && !/^\d{14}$/.test(x.valor)) problemas.push(`Linha ${i + 1} (${x.nome || x.valor}): o CNPJ completo precisa ter 14 dígitos.`);
      if (x.regra === 'raiz' && raizesProprias.includes(x.valor)) problemas.push(`Linha ${i + 1}: a raiz ${x.valor} é da própria empresa e nunca é usada pela raiz. Use o CNPJ completo (com a natureza da operação, se for o caso).`);
    });
    if (raizesProprias.some(r => !/^\d{8}$/.test(r))) problemas.push('As raízes da própria empresa precisam ter 8 dígitos.');
    const nd = parseInt(dias.value, 10);
    if (!Number.isFinite(nd) || nd < 0) problemas.push('Os dias da transportadora mista precisam ser um número inteiro (0 ou mais).');
    if (problemas.length) { erros.append(h('div', { class: 'aviso erro' }, h('b', { text: 'Corrija antes de salvar:' }), h('ul', { style: 'margin:4px 0 0;padding-left:18px' }, problemas.map(x => h('li', { text: x }))))); return; }
    st.cfg.escopo = linhas.map(x => Object.assign(x, { incluido_em: x.incluido_em || hojeISO() }));
    st.cfg.raizesProprias = raizesProprias;
    st.cfg.diasMista = nd;
    await ocupado('Aplicando a lista e recriando o modelo…'); await salvarConfig(); livre(); renderConfig();
  };
  return h('div', { class: 'card stack' },
    h('div', null, h('h2', { text: 'Lista "Fora do escopo"' }),
      h('p', { class: 'sub', style: 'margin:0', text: 'Empresas cujas notas não passam pelo almoxarifado (cavaco, etanol, DDGS, milho e o frete desses produtos). As notas delas saem do painel, das etapas e das pendências, mas a busca continua achando todas. A regra vale pela raiz do CNPJ (pega filiais novas) ou pelo CNPJ completo, que tem prioridade; a natureza da operação é opcional (vem do VT IN ou, sem ela, do XML). Transportadora mista: o CT-e digitalizado pelo almoxarifado fica no escopo; sem digitalização, fica "A classificar" e, passado o prazo, sai do escopo. Em cada nota dá para decidir à mão (cartão Escopo, no detalhe).' })),
    h('div', { class: 'tabela-wrap', style: 'max-height:520px' }, h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Regra', 'CNPJ ou raiz', 'Nome', 'Tipo', 'Motivo', 'Natureza da operação', 'Incluída em', 'Notas na base', ''].map((x, i) => h('th', { class: i === 7 ? 'num' : null, text: x })))), tb)),
    h('datalist', { id: 'dl-motivos' }, MOTIVOS.map(m => h('option', { value: m }))),
    h('div', { class: 'linha' },
      h('button', { class: 'btn pequeno', text: '+ Empresa', onclick: () => tb.append(linha({ regra: 'raiz', tipo: 'Transportadora', motivo: 'Frete de produto', incluido_em: hojeISO() })) }),
      h('span', { class: 'muted', style: 'margin-left:12px', text: 'Raízes da própria empresa (nunca saem pela raiz):' }), proprias,
      h('span', { class: 'muted', style: 'margin-left:12px', text: 'Transportadora mista: fora do escopo depois de' }), dias, h('span', { class: 'muted', text: 'dias sem digitalização' })),
    (st.cfg.transportadorasConhecidas || []).length ? h('div', { class: 'linha' }, h('span', { class: 'muted', text: 'Transportadoras marcadas como do almoxarifado (sem aviso de "nova"):' }),
      st.cfg.transportadorasConhecidas.map(r => h('span', { class: 'tag' }, r.replace(/^(\d{2})(\d{3})(\d{3})$/, '$1.$2.$3'), ' ',
        h('button', { class: 'btn pequeno', style: 'padding:0 5px', text: '×', title: 'Voltar a avisar', onclick: async () => {
          st.cfg.transportadorasConhecidas = st.cfg.transportadorasConhecidas.filter(x => x !== r); await ocupado('Atualizando…'); await salvarConfig(); livre(); renderConfig(); } })))) : null,
    st.lotes.some(l => l.demo) ? h('p', { class: 'sub', style: 'margin:0', text: `Com os dados fictícios carregados, valem também ${L.ESCOPO_DEMO.length} regras fictícias, que só cobrem os CNPJs inventados (raízes 90000001 a 90000005). Elas não aparecem nesta lista nem vão para a exportação.` }) : null,
    erros,
    h('div', { class: 'linha' },
      h('span', { class: 'espaco' }), h('button', { class: 'btn primario', text: 'Salvar a lista', onclick: salvar })));
}

// Arquivo de configuração da empresa: { tipo, versao, gerado_em, aviso, configuracao: { escopo, raizesProprias, ... } }
// Importar substitui só as regras que estão no arquivo; o que não está continua como está.
const TIPO_CONFIG = 'followup-nf/configuracao';
async function importarConfiguracao(arquivo) {
  let dados;
  try { dados = JSON.parse(await arquivo.text()); } catch (e) { toast('Arquivo inválido: não é um JSON.', true); return; }
  if (!dados || dados.tipo !== TIPO_CONFIG || !dados.configuracao || typeof dados.configuracao !== 'object') { toast('Este arquivo não é uma configuração do follow-up.', true); return; }
  const novo = {};
  for (const k of Object.keys(dados.configuracao)) if (k in S.CONFIG_PADRAO) novo[k] = dados.configuracao[k];
  if (!Object.keys(novo).length) { toast('O arquivo não tem nenhuma regra conhecida.', true); return; }
  const problemas = [];
  if ('escopo' in novo) {
    if (!Array.isArray(novo.escopo)) problemas.push('a lista "Fora do escopo" não é uma lista');
    else novo.escopo.forEach((x, i) => {
      const v = String((x && x.valor) || '');
      if (!x || (x.regra !== 'raiz' && x.regra !== 'cnpj')) problemas.push(`linha ${i + 1}: regra desconhecida`);
      else if (x.regra === 'raiz' && !/^\d{8}$/.test(v)) problemas.push(`linha ${i + 1} (${x.nome || v}): a raiz precisa ter 8 dígitos`);
      else if (x.regra === 'cnpj' && !/^\d{14}$/.test(v)) problemas.push(`linha ${i + 1} (${x.nome || v}): o CNPJ completo precisa ter 14 dígitos`);
    });
  }
  if ('raizesProprias' in novo && (!Array.isArray(novo.raizesProprias) || novo.raizesProprias.some(r => !/^\d{8}$/.test(String(r))))) problemas.push('as raízes da própria empresa precisam ter 8 dígitos');
  if (problemas.length) { toast(`O arquivo tem ${problemas.length} problema(s); nada foi importado. Primeiro: ${problemas[0]}.`, true); return; }
  const resumo = [];
  if ('escopo' in novo) resumo.push(`lista "Fora do escopo": de ${(st.cfg.escopo || []).length} para ${novo.escopo.length} empresa(s)`);
  if ('raizesProprias' in novo) resumo.push(`raízes da própria empresa: ${(novo.raizesProprias || []).join(', ') || 'nenhuma'}`);
  const outras = Object.keys(novo).filter(k => k !== 'escopo' && k !== 'raizesProprias');
  if (outras.length) resumo.push(`mais ${outras.length} regra(s) do modelo (${outras.join(', ')})`);
  if (!(await confirmar('Importar a configuração?', `Muda neste navegador: ${resumo.join('; ')}. O que não está no arquivo continua como está.`, 'Importar'))) return;
  Object.assign(st.cfg, JSON.parse(JSON.stringify(novo)));
  await ocupado('Aplicando a configuração e recriando o modelo…'); await salvarConfig(); livre(); renderConfig();
}

function exportarConfiguracao() {
  const dados = { tipo: TIPO_CONFIG, versao: 1, gerado_em: hojeISO(),
    aviso: 'Configuração do follow-up de NF exportada de um navegador. Tem CNPJs de fornecedores e transportadoras: não publicar no GitHub. Para usar: Configurações › Configuração da empresa › Importar arquivo.',
    configuracao: st.cfg };
  baixar(`configuracao-followup_${hojeISO()}.json`, JSON.stringify(dados, null, 2), 'application/json');
}

async function renderDiagnostico(alvo) {
  limpar(alvo);
  alvo.append(h('h3', { text: 'Diagnóstico' }));
  const espD = carregandoLinha('Medindo o banco e o armazenamento…');
  alvo.append(espD);
  let uso = '—';
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); uso = `${fmtDec((e.usage || 0) / 1048576, 1)} MB usados de ${fmtDec((e.quota || 0) / 1073741824, 1)} GB disponíveis`; } } catch (e) { /* segue */ }
  let persistente = '—';
  try { if (navigator.storage && navigator.storage.persisted) persistente = (await navigator.storage.persisted()) ? 'sim' : 'não (o navegador pode apagar sob falta de espaço)'; } catch (e) { /* segue */ }
  let brutas = [];
  try { brutas = (await consulta(L.FONTES.map(f => `SELECT ${q(f.tabela)} AS tabela, count(*)::INTEGER AS linhas FROM ${f.tabela}`).join(' UNION ALL '))).linhas; } catch (e) { /* segue */ }
  espD.remove();
  alvo.append(campos([
    ['DuckDB', `${st.versaoDuck} (duckdb-wasm ${DUCKDB_VERSAO})`],
    ['Leitor de Excel', window.XLSX ? `SheetJS ${XLSX.version}` : 'não carregou (só CSV/TXT)'],
    ['Gravação no navegador', st.idb ? 'IndexedDB ativo' : 'indisponível: a base some ao fechar a página'],
    ['Armazenamento', uso], ['Armazenamento persistente', persistente],
    ['Linhas brutas', brutas.map(b => `${b.tabela}: ${fmtInt(b.linhas)}`).join(' · ')],
    ['Modelo SQL', st.errosViews.length ? h('span', { class: 'tag nao', text: `${st.errosViews.length} erro(s)` }) : h('span', { class: 'tag ok', text: 'todas as visões criadas' })]
  ]));
  st.errosViews.forEach(e => alvo.append(caixaErro('Erro na visão ' + e.nome, e.erro)));
  const res = h('div');
  alvo.append(h('button', { class: 'btn pequeno', style: 'margin-top:8px', text: 'Testar todas as visões', onclick: (ev) => comCarga(ev.currentTarget, async () => {
    limpar(res);
    const espT = carregandoLinha('Testando as visões…');
    res.append(espT);
    for (const [nome] of S.views(cfgEmUso())) {
      espT.querySelector('.msg').textContent = `Testando ${nome}…`;
      const t0 = performance.now();
      try { const n = await valor(`SELECT count(*)::INTEGER FROM ${nome}`); res.append(h('div', { class: 'mono', style: 'font-size:12px', text: `✓ ${nome}: ${fmtInt(n)} linhas · ${Math.round(performance.now() - t0)} ms` })); }
      catch (e) { res.append(h('div', { class: 'mono', style: 'font-size:12px;color:var(--critical)', text: `✗ ${nome}: ${e.message}` })); }
    }
    for (const v of S.VERIFICACOES) {
      try { await valor(`SELECT count(*) FROM (${v.sql}) x`); } catch (e) { res.append(h('div', { class: 'mono', style: 'font-size:12px;color:var(--critical)', text: `✗ verificação ${v.id}: ${e.message}` })); }
    }
    espT.remove();
    res.append(h('div', { class: 'muted', style: 'font-size:12px', text: 'Teste concluído.' }));
  }) }), h('button', { class: 'btn pequeno', style: 'margin:8px 0 0 6px', text: 'Autoteste das regras (dados fictícios)', onclick: () => autoteste(res) }), res);
}

// Recalcula em JavaScript as regras de escopo e situação e compara com o resultado do SQL (só com dados fictícios).
async function autoteste(res) {
  limpar(res);
  if (!st.lotes.length || st.lotes.some(l => !l.demo)) {
    res.append(h('div', { class: 'aviso atencao', text: 'O autoteste usa só os dados fictícios. Carregue os dados fictícios numa base sem dados reais (use outro perfil do navegador se já tiver dados reais).' }));
    return;
  }
  await ocupado('Rodando o autoteste…');
  try {
    const hoje = await valor(`SELECT strftime(current_date, '%Y-%m-%d')`);
    const lin = { vtin: [], pasta: [], digit: [], xml: [] };
    for (const l of st.lotes) if (lin[l.fonte]) lin[l.fonte].push(...L.csvParaObjetos(l.csv));
    const esperado = L.referenciaSituacao(lin, Array.from(st.acomp.values()), cfgEmUso(), hoje);
    const obtido = {};
    (await consulta('SELECT tipo, escopo, situacao, count(*)::INTEGER AS n FROM v_documentos GROUP BY ALL')).linhas.forEach(x => { obtido[`${x.tipo}|${x.escopo}|${x.situacao}`] = x.n; });
    const chaves = Array.from(new Set(Object.keys(esperado).concat(Object.keys(obtido)))).sort();
    const linhas = chaves.map(k => { const [tipo, escopo, situacao] = k.split('|'); return { tipo, escopo, situacao, esperado: esperado[k] || 0, obtido: obtido[k] || 0 }; });
    const erradas = linhas.filter(x => x.esperado !== x.obtido);
    // tipo de operação: regra em JavaScript x regra em SQL
    const nat = (await consulta('SELECT natureza, tipo_operacao_auto FROM v_natureza WHERE natureza IS NOT NULL GROUP BY ALL')).linhas;
    const opErradas = nat.filter(x => (L.tipoOperacao(x.natureza) || null) !== (x.tipo_operacao_auto || null));
    const visoes = [];
    for (const [nome] of S.views(cfgEmUso())) { try { await valor(`SELECT count(*) FROM ${nome}`); } catch (e) { visoes.push(`${nome}: ${e.message}`); } }
    for (const v of S.VERIFICACOES) { try { await valor(`SELECT count(*) FROM (${v.sql}) x`); } catch (e) { visoes.push(`verificação ${v.id}: ${e.message}`); } }
    livre();
    const ruim = erradas.length || visoes.length || opErradas.length;
    res.append(h('div', { class: 'aviso ' + (ruim ? 'erro' : 'info') },
      h('b', { text: ruim ? `${erradas.length} combinação(ões) divergente(s), ${opErradas.length} natureza(s) com tipo de operação diferente e ${visoes.length} consulta(s) com erro.` : `Tudo certo: as ${linhas.length} combinações de tipo, escopo e situação conferem, o tipo de operação confere em ${nat.length} natureza(s) e todas as consultas rodaram.` }),
      h('div', { style: 'font-size:12px;margin-top:4px', text: 'Esperado = regras recalculadas em JavaScript a partir dos lotes fictícios; obtido = SQL no DuckDB. Se houver divergência, copie esta tela e mande para o Claude.' })));
    res.append(tabela(['tipo', 'escopo', 'situacao', 'esperado', 'obtido'], linhas, { altura: 360 }));
    opErradas.forEach(x => res.append(h('div', { class: 'mono', style: 'font-size:12px;color:var(--critical)', text: `✗ natureza "${x.natureza}": SQL ${x.tipo_operacao_auto}, JavaScript ${L.tipoOperacao(x.natureza)}` })));
    visoes.forEach(v => res.append(h('div', { class: 'mono', style: 'font-size:12px;color:var(--critical)', text: '✗ ' + v })));
  } catch (e) { livre(); res.append(caixaErro('Erro no autoteste', e)); }
}

async function salvarBackup() {
  const obs = await idbTodos('obs');
  const acomp = await idbTodos('acomp'), contatos = await idbTodos('contatos');
  const dados = { app: 'followup-almox3001-prototipoA', versao: 3, gerado_em: new Date().toISOString(), cfg: st.cfg, lotes: st.lotes, obs, acomp, contatos };
  baixar(`followup_backup_${hojeISO()}.json`, JSON.stringify(dados), 'application/json');
}

async function restaurarBackup(arquivo) {
  let dados;
  try { dados = JSON.parse(await arquivo.text()); } catch (e) { toast('Arquivo de backup inválido.', true); return; }
  if (!dados || dados.app !== 'followup-almox3001-prototipoA') { toast('Este arquivo não é um backup deste protótipo.', true); return; }
  if (!(await confirmar('Restaurar o backup?', `A base atual será substituída por ${dados.lotes.length} lote(s) de ${new Date(dados.gerado_em).toLocaleString('pt-BR')}.`, 'Restaurar'))) return;
  await ocupado('Restaurando…');
  await idbLimpar('lotes'); await idbLimpar('obs'); await idbLimpar('escopo'); await idbLimpar('acomp'); await idbLimpar('contatos');
  for (const l of dados.lotes) await idbGravar('lotes', l);
  for (const o of dados.obs || []) await idbGravar('obs', o);
  for (const e of dados.escopo || []) await idbGravar('escopo', e); // backup da versão 2: vira acompanhamento ao abrir
  for (const a of dados.acomp || []) await idbGravar('acomp', a);
  for (const c of dados.contatos || []) await idbGravar('contatos', c);
  if (dados.cfg) await idbGravar('config', { k: 'cfg', v: dados.cfg });
  location.reload();
}

async function apagarTudo() {
  if (!(await confirmar('Apagar toda a base?', 'Todos os lotes, observações, anotações de acompanhamento e contatos deste navegador serão apagados. A configuração (lista "Fora do escopo" e regras) continua. Faça um backup antes, se precisar.', 'Apagar tudo'))) return;
  await ocupado('Apagando…');
  for (const f of L.FONTES) await exec(`DELETE FROM ${f.tabela}`);
  await exec('DELETE FROM obs'); await exec('DELETE FROM acomp'); await exec('DELETE FROM contatos');
  await idbLimpar('lotes'); await idbLimpar('obs'); await idbLimpar('escopo'); await idbLimpar('acomp'); await idbLimpar('contatos');
  st.lotes = []; st.acomp.clear();
  await materializar();
  livre(); atualizarStatus(); toast('Base apagada.'); mostrarAba('painel');
}
