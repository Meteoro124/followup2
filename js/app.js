/* APLICAÇÃO: início da página, troca de abas e situação do banco.
   Nenhum dado sai do navegador: a internet só é usada para baixar as bibliotecas
   (DuckDB-Wasm do jsDelivr e SheetJS do cdn.sheetjs.com). */
import { L } from './logica/index.js';
import { atualizarContadores, marcarFiltroEscopo, mudarFiltroEscopo } from './nucleo/acompanhamento.js';
import { criarEsquema, exec, idbAbrir, idbApagar, idbGravar, idbTodos, iniciarDuckDB, inserirCSV, recriarViews } from './nucleo/banco.js';
import { $, blocoCarregando, carregandoLinha, fecharModal, h, limpar, toast } from './nucleo/dom.js';
import { st } from './nucleo/estado.js';
import { caixaErro } from './nucleo/formato.js';
import { buscar, renderBusca } from './paginas/busca.js';
import { renderConfig } from './paginas/config.js';
import { renderSql } from './paginas/consulta-sql.js';
import { renderEtapa } from './paginas/etapas.js';
import { renderImportar } from './paginas/importar.js';
import { renderIndicadores } from './paginas/indicadores.js';
import { montarPainel, renderPainel } from './paginas/painel.js';
import { renderPendencias } from './paginas/pendencias.js';
import { q, S } from './sql/index.js';

// ------------------------------------------------------------------ inicialização
export function status(texto, classe) { $('pillTexto').textContent = texto; $('pillStatus').className = 'pill ' + classe; }

export function atualizarStatus() {
  const n = st.lotes.length;
  status(n ? `Pronto · ${n} importaç${n === 1 ? 'ão' : 'ões'}${st.idb ? '' : ' · sem gravação'}` : 'Pronto · base vazia', st.errosViews.length ? 'erro' : 'ok');
  $('pillDemo').hidden = !st.lotes.some(l => l.demo);
}

const ABAS_ETAPA = ['pedido', 'coleta', 'entregue', 'lancado'];
export function mostrarAba(nome) {
  st.abaAtual = nome;
  if (ABAS_ETAPA.includes(nome)) st.abaLista = nome; // a última aba de etapa aberta continua visível
  // As abas das etapas só aparecem enquanto estão abertas (abertas pelo clique numa etapa da trilha)
  document.querySelectorAll('#abas button').forEach(b => {
    b.setAttribute('aria-selected', String(b.dataset.aba === nome));
    if (ABAS_ETAPA.includes(b.dataset.aba)) b.hidden = b.dataset.aba !== nome && b.dataset.aba !== st.abaLista;
  });
  document.querySelectorAll('.aba').forEach(s => { s.hidden = s.id !== 'aba-' + nome; });
  const render = { painel: renderPainel, indicadores: renderIndicadores, busca: renderBusca, pendencias: renderPendencias, importar: renderImportar, sql: renderSql, config: renderConfig,
    pedido: () => renderEtapa('pedido'), coleta: () => renderEtapa('coleta'), entregue: () => renderEtapa('entregue'), lancado: () => renderEtapa('lancado') }[nome];
  const mig = $('migalhaAtual');
  if (mig) mig.textContent = TITULO_ABA[nome] || nome;
  if (render && st.conn) render();
  else if (!st.conn && nome !== 'painel') { const sec = limpar($('aba-' + nome)); sec.append(blocoCarregando('Aguardando o banco de dados terminar de carregar…', 4)); }
}
const TITULO_ABA = { painel: 'Painel', indicadores: 'Indicadores', pedido: 'Etapa 1 · Pedido de compra', coleta: 'Etapa 2 · Coleta', entregue: 'Etapa 3 · Pedido entregue',
  lancado: 'Etapa 4 · Pedido lançado', busca: 'Buscar', pendencias: 'Pendências', importar: 'Importar dados', sql: 'Consulta SQL', config: 'Configurações' };

// Mensagem de carregamento do início (mostrada sobre o esqueleto do painel)
function msgInicio(texto) { const m = document.querySelector('#aba-painel .msg-inicio .msg'); if (m) m.textContent = texto; }

async function iniciar() {
  document.querySelectorAll('#abas button').forEach(b => b.addEventListener('click', () => mostrarAba(b.dataset.aba)));
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) fecharModal(); });
  $('filtroEscopo').value = st.filtroEscopo;
  $('filtroEscopo').addEventListener('change', (e) => mudarFiltroEscopo(e.target.value));
  marcarFiltroEscopo();
  // Busca rápida da barra lateral: Enter abre a aba Buscar já pesquisando; a tecla / põe o cursor nela
  $('buscaRapida').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !st.conn) return;
    const t = e.target.value.trim(); if (!t) return;
    e.target.value = '';
    mostrarAba('busca');
    setTimeout(() => { const ent = $('buscaEntrada'); if (ent) ent.value = t; buscar(t); }, 20);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); $('buscaRapida').focus(); }
  });
  $('btnRecarregar').addEventListener('click', () => {
    if (!st.conn) return;
    const nome = st.abaAtual || 'painel', sec = $('aba-' + nome);
    if (sec) delete sec.dataset.pronto; // Buscar e Consulta SQL são montadas uma vez só
    mostrarAba(nome);
  });
  // Enquanto o banco carrega, o painel já mostra o esqueleto com o passo atual
  { const sk = montarPainel(limpar($('aba-painel'))); const m = carregandoLinha('Baixando o banco de dados (DuckDB)…'); m.classList.add('msg-inicio'); sk.cab.append(m); }
  try { st.idb = await idbAbrir(); } catch (e) { st.idb = null; console.warn('IndexedDB indisponível', e); }
  try { const c = await idbTodos('config'); const cfg = c.find(x => x.k === 'cfg'); if (cfg) st.cfg = Object.assign(st.cfg, cfg.v); } catch (e) { /* usa padrão */ }
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* opcional */ }
  try {
    status('Baixando o DuckDB…', 'carregando');
    await iniciarDuckDB();
  } catch (e) {
    status('Banco não carregou', 'erro');
    const painel = limpar($('aba-painel'));
    painel.append(h('div', { class: 'card stack' },
      h('h2', { text: 'Não foi possível carregar o banco de dados (DuckDB-Wasm)' }),
      h('p', { class: 'sub', text: 'A página precisa baixar o DuckDB de cdn.jsdelivr.net na primeira abertura. Causas prováveis: sem internet, a rede da empresa bloqueia esse endereço, ou o navegador é antigo (use Chrome ou Edge atualizados). Nenhum dado foi enviado.' }),
      caixaErro('Erro técnico', e)));
    return;
  }
  st.xlsxOk = typeof window.XLSX !== 'undefined';
  status('Carregando a base salva…', 'carregando');
  msgInicio('Carregando a base salva neste navegador…');
  await criarEsquema();
  try {
    st.lotes = (await idbTodos('lotes')).sort((a, b) => a.importado_em.localeCompare(b.importado_em));
    let i = 0;
    for (const lote of st.lotes) {
      const f = L.fonte(lote.fonte);
      i++; msgInicio(`Carregando a importação ${i} de ${st.lotes.length}: ${f ? f.nome : lote.fonte}…`);
      status(`Carregando ${i} de ${st.lotes.length}…`, 'carregando');
      if (f && lote.csv) await inserirCSV(f.tabela, lote.csv);
    }
    msgInicio('Carregando acompanhamentos e observações…');
    const obs = await idbTodos('obs');
    if (obs.length) await inserirCSV('obs', L.toCSV(['chave', 'texto', 'atualizado_em'], obs));
    // decisões de escopo da versão anterior viram acompanhamento
    for (const e of await idbTodos('escopo')) {
      const atual = (await idbTodos('acomp')).find(a => a.chave === e.chave) || { chave: e.chave };
      await idbGravar('acomp', Object.assign(atual, { escopo_manual: e.decisao, atualizado_em: e.atualizado_em }));
      await idbApagar('escopo', e.chave);
    }
    const acomp = await idbTodos('acomp');
    acomp.forEach(a => st.acomp.set(a.chave, a));
    if (acomp.length) await inserirCSV('acomp', L.toCSV(S.ACOMP_COLS, acomp));
    const contatos = await idbTodos('contatos');
    if (contatos.length) await inserirCSV('contatos', L.toCSV(S.CONTATO_COLS, contatos));
  } catch (e) { toast('Erro ao carregar a base salva: ' + e.message, true); console.error(e); }
  await exec(`DELETE FROM filtro_escopo`); await exec(`INSERT INTO filtro_escopo VALUES (${q(st.filtroEscopo)})`);
  msgInicio('Montando o modelo (cruzando as fontes)…');
  status('Montando o modelo…', 'carregando');
  await recriarViews();
  atualizarStatus();
  atualizarContadores();
  mostrarAba(st.abaAtual || 'painel');
}

// Início: os módulos rodam depois de a página ser lida; o banco começa a carregar em seguida.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
