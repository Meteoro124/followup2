/* Aba Buscar: pesquisa por pedido, número, chave, coleta ou fornecedor. */
import { L } from '../logica/index.js';
import { consulta } from '../nucleo/banco.js';
import { $, blocoCarregando, h, limpar } from '../nucleo/dom.js';
import { st } from '../nucleo/estado.js';
import { caixaErro, chipPedido, tabela } from '../nucleo/formato.js';
import { abrirDetalhe, abrirPedido, campos, reabrirDetalhe, trilha } from './detalhe.js';
import { termo } from './etapas.js';
import { q } from '../sql/index.js';

// ------------------------------------------------------------------ BUSCA E DETALHE
export function renderBusca() {
  const box = $('aba-busca');
  if (box.dataset.pronto) { reabrirDetalhe(); return; }
  box.dataset.pronto = '1';
  setTimeout(reabrirDetalhe, 0);
  const entrada = h('input', { id: 'buscaEntrada', type: 'text', placeholder: 'Pedido, número da NF ou CT-e, chave de 44 dígitos, coleta ou nome do fornecedor', style: 'flex:1;min-width:280px;padding:9px 12px' });
  const botao = h('button', { id: 'buscaBotao', class: 'btn primario', text: 'Buscar' });
  const ir = () => buscar(entrada.value);
  botao.addEventListener('click', ir);
  entrada.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
  box.append(h('div', { class: 'card' }, h('div', { class: 'linha' }, entrada, botao),
    h('p', { class: 'sub', style: 'margin:8px 0 0', text: 'A busca acha todas as notas, inclusive as fora do escopo (com a etiqueta). Zeros à esquerda são ignorados. Com mais de um resultado, escolha na lista.' })));
  box.append(h('div', { id: 'buscaResultados', style: 'margin-top:16px' }));
  box.append(h('div', { id: 'buscaDetalhe', style: 'margin-top:16px' }));
  setTimeout(() => entrada.focus(), 50);
}

export async function buscar(termo) {
  const t = String(termo || '').trim();
  st.origemDetalhe = null; // pesquisa feita na própria aba Buscar: sem botão de voltar
  st.detalhe = null;
  const res = limpar($('buscaResultados')); limpar($('buscaDetalhe'));
  let abriu = false; // sem uma nota aberta, o detalhe fica em branco abaixo da pesquisa
  if (!t) { detalheNfeEmBranco(); return; }
  const botao = $('buscaBotao');
  if (botao) { botao.classList.add('carregando'); botao.disabled = true; }
  const esp = blocoCarregando(`Buscando "${t}"…`, 4);
  res.append(esp);
  const dig = t.replace(/\D/g, '');
  let cN, cC;
  if (/^\d{44}$/.test(dig)) { cN = cC = `chave = ${q(dig)}`; }
  else if (/^[\d\s.\-/]+$/.test(t)) {
    const num = L.stripZeros(dig);
    const chaveLike = dig.length >= 10 ? ` OR chave LIKE ${q('%' + dig + '%')}` : '';
    cN = `(numero = ${q(num)} OR pedido = ${q(num)} OR list_contains(string_split(coalesce(coletas, ''), ', '), ${q(num)})${chaveLike})`;
    cC = `(numero = ${q(num)} OR pedido_mercadoria = ${q(num)} OR list_contains(string_split(coalesce(coletas, ''), ', '), ${q(num)})${chaveLike})`;
  } else {
    const like = q('%' + t + '%');
    cN = `(fornecedor ILIKE ${like} OR fornecedor_pedido ILIKE ${like})`; cC = `transportadora ILIKE ${like}`;
  }
  try {
    // Pedido com este número: mostra primeiro; o botão abre pela regra (1 nota → a nota; várias → a lista; nenhuma → aguardando faturamento)
    const num = /^[\d\s.\-/]+$/.test(t) ? L.stripZeros(dig) : '';
    const ped = num ? (await consulta(`SELECT p.pedido, p.fornecedor, p.etapa_ordem, p.etapa_follow AS etapa_pedido,
        (SELECT count(*) FROM v_nfe_todas n WHERE n.pedido = p.pedido)::INTEGER AS notas FROM v_pedido_trilha p WHERE p.pedido = ${q(num)}`)).linhas[0] : null;
    if (ped) res.append(h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'linha' },
      h('b', { text: `Pedido ${ped.pedido}` }), h('span', { class: 'muted', text: ped.fornecedor || '' }), chipPedido(ped.etapa_ordem, ped.etapa_pedido), h('span', { class: 'muted', text: `${ped.notas} nota(s)` }),
      h('span', { class: 'espaco' }), h('button', { class: 'btn primario', text: ped.notas === 1 ? 'Abrir a nota do pedido' : (ped.notas > 1 ? 'Ver as notas do pedido' : 'Abrir o pedido'), onclick: () => abrirPedido(ped.pedido) }))));
    const r = await consulta(`SELECT 'NF-e' AS tipo, chave, numero, serie, fornecedor AS emitente, data_emissao, valor, pedido, etapa_ordem, etapa_follow, escopo FROM v_nfe_todas WHERE ${cN}
        UNION ALL SELECT 'CT-e', chave, numero, serie, transportadora, data_emissao, valor, pedido_mercadoria, etapa_ordem, etapa_follow, escopo FROM v_cte_todas WHERE ${cC}
        ORDER BY data_emissao DESC NULLS LAST LIMIT 300`);
    esp.remove();
    if (!r.linhas.length) { if (!ped) res.append(h('div', { class: 'aviso atencao', text: `Nada encontrado para "${t}" no VT IN importado.` })); return; }
    if (r.linhas.length === 1 && !ped) { abriu = true; abrirDetalhe(r.linhas[0].chave); return; }
    res.append(h('div', { class: 'card' }, h('h3', { text: `${r.linhas.length} resultado(s)${r.linhas.length === 300 ? ' (mostrando os 300 mais recentes)' : ''}` }),
      tabela(r.cols, r.linhas, { ocultar: ['etapa_ordem'], altura: 320, aoClicar: (x) => abrirDetalhe(x.chave) })));
  } catch (e) { res.append(caixaErro('Erro na busca', e)); }
  finally {
    esp.remove();
    if (botao) { botao.classList.remove('carregando'); botao.disabled = false; }
    if (!abriu) detalheNfeEmBranco();
  }
}

// Detalhe da nota em branco: os mesmos quadros do detalhe, com os campos vazios, até uma nota ser escolhida.
export function detalheNfeEmBranco() {
  const alvo = $('buscaDetalhe');
  if (!alvo) return;
  limpar(alvo);
  const vazio = (rotulos) => campos(rotulos.map(r => [r, null]));
  const semNota = 'Nenhuma nota selecionada.';
  alvo.append(h('div', { class: 'detalhe-branco' },
    h('div', { class: 'linha', style: 'margin-bottom:12px' }, h('h2', { text: 'NF-e — / série — · nenhuma nota selecionada' }),
      h('span', { class: 'tag', text: 'pesquise acima ou clique numa lista para preencher' })),
    h('div', { class: 'grid g3' },
      h('div', { class: 'card' }, h('h3', { text: 'Trilha do pedido' }), trilha([
        ['Pedido de compra', null, '—'], ['Coleta', null, '—'], ['Pedido entregue', null, '—'], ['Pedido lançado', null, '—']])),
      h('div', { class: 'card' }, h('h3', { text: 'Dados fiscais (VT IN)' }), vazio(['Emitente', 'CNPJ', 'UF / mês', 'Emissão', 'Valor', 'Chave', 'Dígito verificador',
        'Manifestação', 'Etapa no VT IN', 'Nº documento', 'Doc. MIRO', 'Extraído em'])),
      h('div', { class: 'card' }, h('h3', { text: 'Pedido e classificação' }), vazio(['Pedido', 'Classificação', 'Categorias', 'Pasta da digitalização',
        'Fornecedor no pedido', 'Grupo de compradores', 'A fornecer / a faturar', 'Frete'])),
      h('div', { class: 'card' }, h('h3', { text: 'XML da nota' }), vazio(['Pedido nos itens', 'Pedido da nota', 'Pedido na observação', 'Pedido digitado', 'Aviso',
        'Natureza / CFOP', 'Frete por conta', 'Transportadora', 'Alerta', 'CT-e (XML)']))),
    h('div', { class: 'card', style: 'margin-top:16px' }, h('h3', { text: 'Itens do pedido (ME2N)' }),
      tabela(['item', 'material', 'texto_breve', 'categoria_cc', 'qtd_pedido', 'a_fornecer', 'a_faturar', 'valor_liquido', 'cod_eliminacao'], [], { vazio: semNota })),
    h('div', { class: 'card', style: 'margin-top:16px' }, h('h3', { text: 'Entradas com a mesma referência (MB51, número e série)' }),
      tabela(['doc_material', 'item_doc', 'tipo_mov', 'data_lancamento', 'material', 'texto_material', 'quantidade', 'pedido', 'referencia'], [], { vazio: semNota })),
    h('div', { class: 'grid g2', style: 'margin-top:16px' },
      h('div', { class: 'card' }, h('h3', { text: 'Frete (relatório da Della Volpe)' }),
        tabela(['coleta', 'data_coleta', 'previsao_entrega', 'data_entrega', 'status_sla', 'chave_cte', 'pedido_texto'], [], { vazio: semNota })),
      h('div', { class: 'card' }, h('h3', { text: 'Digitalização' }),
        tabela(['nome_arquivo', 'data_pasta', 'classificacao_pasta', 'ligacao', 'caminho'], [], { vazio: semNota }))),
    h('div', { class: 'card', style: 'margin-top:16px' }, h('h3', { text: 'Observação' }),
      h('textarea', { rows: 3, style: 'width:100%', disabled: true, placeholder: 'Escolha uma nota para escrever a observação.' }))));
}
