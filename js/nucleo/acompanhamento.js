/* Filtro "Notas" do topo, etiquetas de escopo e situação e o acompanhamento manual (cartão e contatos). */
import { mostrarAba } from '../app.js';
import { L } from '../logica/index.js';
import { consulta, exec, idbApagar, idbGravar, valor } from './banco.js';
import { $, confirmar, h, toast } from './dom.js';
import { FILTROS_NOTAS, st } from './estado.js';
import { fmtData, hojeISO } from './formato.js';
import { reabrirDetalhe } from '../paginas/detalhe.js';
import { q, S } from '../sql/index.js';

// ------------------------------------------------------------------ FILTRO "NOTAS", ETIQUETAS E ACOMPANHAMENTO MANUAL
const NOME_FILTRO = { no: 'Em acompanhamento', fora: 'Só fora do escopo', canceladas: 'Só canceladas ou recusadas', arquivadas: 'Só o backlog arquivado', todas: 'Todas as notas' };
export function marcarFiltroEscopo() {
  const box = $('filtroEscopoBox');
  if (box) box.classList.toggle('ativo', st.filtroEscopo !== 'no');
}
export async function mudarFiltroEscopo(modo, semRedesenhar) {
  st.filtroEscopo = FILTROS_NOTAS.includes(modo) ? modo : 'no';
  try { localStorage.setItem('followupA_filtroEscopo', st.filtroEscopo); } catch (e) { /* só lembra nesta sessão */ }
  if ($('filtroEscopo').value !== st.filtroEscopo) $('filtroEscopo').value = st.filtroEscopo;
  marcarFiltroEscopo();
  if (!st.conn) return;
  await exec('DELETE FROM filtro_escopo');
  await exec(`INSERT INTO filtro_escopo VALUES (${q(st.filtroEscopo)})`);
  Object.values(st.etapa).forEach(e => { e.pagina = 0; });
  st.pend.pagina = 0;
  if (!semRedesenhar && st.abaAtual && st.abaAtual !== 'busca') mostrarAba(st.abaAtual);
}
// Colunas de escopo e situação nas listas: só aparecem quando o filtro não é o padrão
export const colsEscopo = (alias) => st.filtroEscopo === 'no' ? '' : `${alias}.escopo, ${alias}.situacao, ${alias}.escopo_motivo, `;
export function tagEscopo(e) {
  if (e === 'Fora do escopo') return h('span', { class: 'tag', text: 'Fora do escopo' });
  if (e === 'A classificar') return h('span', { class: 'tag amarelo', text: 'A classificar' });
  return h('span', { class: 'tag ok', text: 'No escopo' });
}
export function tagSituacao(s) {
  if (s === 'Lançada') return h('span', { class: 'tag ok', text: '✓ Lançada' });
  if (s === 'Cancelada/recusada') return h('span', { class: 'tag vermelho', text: 'Cancelada ou recusada' });
  if (s === 'Arquivada') return h('span', { class: 'tag', text: 'Backlog arquivado' });
  return h('span', { class: 'tag', text: s || '—' });
}
export function tagVenc(d) {
  if (d === null || d === undefined) return '—';
  if (d < 0) return h('span', { class: 'tag vermelho', title: 'Pendência vencida' }, `⚠ vencida há ${-d} d`);
  if (d === 0) return h('span', { class: 'tag amarelo' }, 'vence hoje');
  if (d <= 5) return h('span', { class: 'tag amarelo' }, `vence em ${d} d`);
  return `${d} d`;
}
// Faixa de aviso nas listas quando o filtro não é o padrão
export function avisoFiltroEscopo() {
  if (st.filtroEscopo === 'no') return null;
  return h('div', { class: 'aviso atencao', style: 'margin-bottom:12px' },
    h('b', { text: `Mostrando: ${NOME_FILTRO[st.filtroEscopo].toLowerCase()}. ` }),
    'O filtro fica no topo da página (Notas). ',
    h('button', { class: 'btn pequeno', text: 'Voltar para “Em acompanhamento”', onclick: () => mudarFiltroEscopo('no') }));
}

// Grava o acompanhamento de uma nota (só os campos de patch mudam). Sem nenhum campo preenchido, a linha some.
export async function salvarAcomp(chave, patch) {
  const atual = Object.assign({ chave }, st.acomp.get(chave) || {}, patch, { atualizado_em: new Date().toISOString() });
  const vazio = S.ACOMP_COLS.filter(c => c !== 'chave' && c !== 'atualizado_em').every(c => !atual[c]);
  await exec(`DELETE FROM acomp WHERE chave = ${q(chave)}`);
  if (vazio) { st.acomp.delete(chave); await idbApagar('acomp', chave); return; }
  await exec(`INSERT INTO acomp (${S.ACOMP_COLS.join(', ')}) VALUES (${S.ACOMP_COLS.map(c => S.sqlVal(atual[c])).join(', ')})`);
  st.acomp.set(chave, atual);
  await idbGravar('acomp', atual);
}
export async function adicionarContato(chave, data, quem, texto, demo) {
  const c = { id: `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, chave, data: data || hojeISO(), quem: quem || '', texto: texto || '', registrado_em: new Date().toISOString() };
  if (demo) c.demo = true;
  await exec(`INSERT INTO contatos (${S.CONTATO_COLS.join(', ')}) VALUES (${S.CONTATO_COLS.map(k => S.sqlVal(c[k])).join(', ')})`);
  await idbGravar('contatos', c);
  return c;
}
export async function removerContato(id) {
  await exec(`DELETE FROM contatos WHERE id = ${q(id)}`);
  await idbApagar('contatos', id);
}
// Número vermelho na aba Pendências: ações com data até hoje
// Números vermelhos do menu: ações para hoje (Pendências) e transportadoras novas para decidir (Configurações)
export async function atualizarContadores() {
  const poe = (id, n, dica) => { const el = $(id); if (!el) return; el.hidden = !n; el.textContent = n ? String(n) : ''; el.title = n ? dica : ''; };
  try { const n = await valor('SELECT count(*)::INTEGER FROM v_documentos WHERE acao_para_hoje'); poe('contHoje', n, `${n} ação(ões) para hoje`); } catch (e) { /* modelo com erro */ }
  try { const n = await valor('SELECT count(*)::INTEGER FROM v_transportadoras_novas'); poe('contConfig', n, `${n} transportadora(s) nova(s) para decidir`); } catch (e) { /* modelo com erro */ }
}

// Cartão "Acompanhamento" no detalhe da nota ou do CT-e
export async function cardAcompanhamento(r) {
  const chave = r.chave;
  const bt = (texto, fn, cls) => h('button', { class: 'btn ' + (cls || 'pequeno'), text: texto, onclick: fn });
  const salvar = async (patch, msg) => {
    try { await salvarAcomp(chave, patch); toast(msg || 'Salvo neste navegador.'); atualizarContadores(); reabrirDetalhe(); }
    catch (e) { toast('Erro ao salvar: ' + e.message, true); }
  };
  const projetos = (await consulta(`SELECT DISTINCT projeto FROM acomp WHERE coalesce(projeto, '') <> '' ORDER BY 1`)).linhas.map(x => x.projeto);
  const motivo = r.escopo_motivo || (r.escopo === 'No escopo' ? 'regra automática (emitente fora da lista "Fora do escopo")' : '');
  const inpVenc = h('input', { type: 'date', value: r.vencimento || '', 'aria-label': 'Vencimento' });
  const inpData = h('input', { type: 'date', value: r.proxima_acao_data || '', 'aria-label': 'Data da próxima ação' });
  const inpTexto = h('input', { type: 'text', value: r.proxima_acao_texto || '', placeholder: 'Ex.: cobrar o comprador, conferir com a portaria', style: 'flex:1;min-width:180px', 'aria-label': 'Próxima ação' });
  const inpProjeto = h('input', { type: 'text', value: r.projeto || '', list: 'dl-projetos', placeholder: 'Ex.: projeto, obra, conserto', style: 'flex:1;min-width:160px', 'aria-label': 'Projeto' });
  const opcoes = (arr, atual, aoMudar, rot) => { const x = h('select', { 'aria-label': rot, onchange: (e) => aoMudar(e.target.value) }, arr.map(([v, t]) => h('option', { value: v, text: t }))); x.value = atual; return x; };
  const tipos = [['', `Automático: ${r.tipo_operacao_auto || 'sem natureza da operação'}`]].concat(L.TIPOS_OPERACAO.map(t => [t, t]));
  const natureza = r.natureza_operacao || r.natureza_escopo || r.natureza;
  return h('div', { class: 'card' }, h('h3', { text: 'Acompanhamento' }),
    h('div', { class: 'form-acomp' },
      h('label', { text: 'Situação' }),
      h('div', { class: 'linha' }, tagSituacao(r.situacao),
        r.situacao === 'Cancelada/recusada' ? h('span', { class: 'muted', style: 'font-size:12px', text: [r.status_sefaz ? 'SEFAZ: ' + r.status_sefaz : '', r.manifestacao_cod ? 'manifestação: ' + (L.MANIFESTACAO[r.manifestacao_cod] || r.manifestacao_cod) : ''].filter(Boolean).join(' · ') }) : null),
      h('label', { text: 'Escopo' }),
      h('div', null, h('div', { class: 'linha' }, tagEscopo(r.escopo), h('span', { class: 'muted', style: 'font-size:12px', text: motivo })),
        natureza ? h('div', { class: 'muted', style: 'font-size:12px;margin-top:2px', text: 'Natureza da operação: ' + natureza }) : null,
        h('div', { class: 'linha', style: 'margin-top:6px' },
          r.escopo !== 'No escopo' ? bt('Manter no acompanhamento', () => salvar({ escopo_manual: 'incluir' }, 'A nota voltou ao acompanhamento.')) : null,
          r.escopo !== 'Fora do escopo' ? bt('Tirar do acompanhamento', () => salvar({ escopo_manual: 'excluir' }, 'A nota saiu do acompanhamento.')) : null,
          r.escopo_manual ? bt('Voltar à regra automática', () => salvar({ escopo_manual: '' })) : null)),
      h('label', { text: 'Vencimento' }),
      h('div', { class: 'linha' }, inpVenc, bt('Salvar', () => salvar({ vencimento_manual: inpVenc.value })),
        !r.vencimento_estimado ? bt('Usar o estimado', () => salvar({ vencimento_manual: '' })) : null,
        r.dias_para_vencer !== null && r.dias_para_vencer !== undefined ? tagVenc(r.dias_para_vencer) : null,
        h('span', { class: 'muted', style: 'font-size:12px', text: r.vencimento_estimado ? `estimado: emissão + ${st.cfg.diasVencimento ?? 30} dias` : 'informado à mão' })),
      h('label', { text: 'Próxima ação' }),
      h('div', { class: 'linha' }, inpData, inpTexto, bt('Salvar', () => salvar({ proxima_acao_data: inpData.value, proxima_acao_texto: inpTexto.value.trim() }, 'Próxima ação salva.')),
        (r.proxima_acao_data || r.proxima_acao_texto) ? bt('Concluída', async () => {
          await adicionarContato(chave, hojeISO(), '', 'Ação concluída: ' + (r.proxima_acao_texto || '(sem texto)'));
          await salvar({ proxima_acao_data: '', proxima_acao_texto: '' }, 'Ação concluída e registrada no histórico.');
        }) : null),
      h('label', { text: 'Recebida por' }),
      opcoes([['', '—'], ['Papel', 'Papel'], ['E-mail', 'E-mail']], r.canal_recebimento || '', (v) => salvar({ canal_recebimento: v }), 'Canal de recebimento'),
      h('label', { text: 'Tipo de operação' }),
      opcoes(tipos, r.tipo_operacao_manual || '', (v) => salvar({ tipo_operacao_manual: v }), 'Tipo de operação'),
      h('label', { text: 'Projeto' }),
      h('div', { class: 'linha' }, inpProjeto, h('datalist', { id: 'dl-projetos' }, projetos.map(x => h('option', { value: x }))), bt('Salvar', () => salvar({ projeto: inpProjeto.value.trim() }))),
      h('label', { text: 'Lista diária' }),
      h('div', { class: 'linha' },
        r.situacao === 'Pendente' ? bt('Arquivar (backlog)', () => salvar({ arquivada_manual: 'S' }, 'Nota arquivada.')) : null,
        r.situacao === 'Arquivada' ? bt('Voltar para a lista diária', () => salvar({ arquivada_manual: 'N' }, 'Nota de volta à lista diária.')) : null,
        r.arquivada_manual ? bt('Usar a data de corte', () => salvar({ arquivada_manual: '' })) : null,
        (r.situacao === 'Lançada' || r.situacao === 'Cancelada/recusada') ? h('span', { class: 'muted', style: 'font-size:12px', text: 'Não se aplica a notas lançadas ou canceladas.' }) : null)));
}

// Cartão "Histórico de contatos" no detalhe
export async function cardContatos(chave) {
  const r = await consulta(`SELECT id, data, quem, texto FROM contatos WHERE chave = ${q(chave)} ORDER BY data DESC, registrado_em DESC`);
  const pessoas = (await consulta(`SELECT DISTINCT quem FROM contatos WHERE coalesce(quem, '') <> '' ORDER BY 1 LIMIT 60`)).linhas.map(x => x.quem);
  const inpData = h('input', { type: 'date', value: hojeISO(), 'aria-label': 'Data do contato' });
  const inpQuem = h('input', { type: 'text', list: 'dl-quem', placeholder: 'Com quem (área ou pessoa)', style: 'width:180px', 'aria-label': 'Com quem' });
  const inpTexto = h('input', { type: 'text', placeholder: 'O que foi tratado', style: 'flex:1;min-width:200px', 'aria-label': 'O que foi tratado' });
  const registrar = async () => {
    if (!inpTexto.value.trim()) { toast('Escreva o que foi tratado.', true); return; }
    await adicionarContato(chave, inpData.value, inpQuem.value.trim(), inpTexto.value.trim());
    toast('Contato registrado.'); reabrirDetalhe();
  };
  inpTexto.addEventListener('keydown', (e) => { if (e.key === 'Enter') registrar(); });
  return h('div', { class: 'card' }, h('h3', { text: 'Histórico de contatos' }),
    r.linhas.length ? h('ul', { class: 'contatos' }, r.linhas.map(c => h('li', null,
      h('span', { class: 'muted', text: fmtData(c.data) }),
      h('span', null, c.quem ? h('span', { class: 'quem', text: c.quem + ': ' }) : null, c.texto || ''),
      h('button', { class: 'btn pequeno', text: '×', title: 'Apagar este contato', onclick: async () => { if (await confirmar('Apagar este contato?', c.texto || '', 'Apagar')) { await removerContato(c.id); reabrirDetalhe(); } } })))) :
      h('p', { class: 'sub', text: 'Nenhum contato registrado. Use para anotar cobranças, e-mails e combinados (data, com quem, o quê).' }),
    h('div', { class: 'linha' }, inpData, inpQuem, h('datalist', { id: 'dl-quem' }, pessoas.map(x => h('option', { value: x }))), inpTexto,
      h('button', { class: 'btn primario pequeno', text: 'Registrar', onclick: registrar })));
}
