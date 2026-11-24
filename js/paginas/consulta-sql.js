/* Aba Consulta SQL: consultas livres e dicionário das tabelas. */
import { consulta } from '../nucleo/banco.js';
import { $, blocoCarregando, carregandoLinha, copiar, esqTabela, h, limpar } from '../nucleo/dom.js';
import { st } from '../nucleo/estado.js';
import { caixaErro, exportarLinhas, fmtInt, tabela } from '../nucleo/formato.js';
import { abrirLinha } from './etapas.js';
import { S } from '../sql/index.js';

// ------------------------------------------------------------------ CONSULTA SQL
const EXEMPLOS = [
  ['Notas paradas há mais de 15 dias', `SELECT etapa_follow, dias_na_etapa, numero, fornecedor, pedido, classificacao, data_emissao\nFROM v_nfe\nWHERE etapa_ordem < 4 AND dias_na_etapa > 15\nORDER BY dias_na_etapa DESC`],
  ['Tempo mediano por fornecedor (emissão → entrada)', `SELECT fornecedor, count(*) AS notas, median(d_emissao_entrada) AS mediana_dias\nFROM v_nfe\nWHERE d_emissao_entrada IS NOT NULL\nGROUP BY fornecedor\nHAVING count(*) >= 3\nORDER BY mediana_dias DESC`],
  ['CT-e aguardando pedido de frete, por transportadora', `SELECT transportadora, count(*) AS ctes, max(dias_na_etapa) AS mais_antigo_dias\nFROM v_cte\nWHERE etapa_ordem = 2\nGROUP BY transportadora\nORDER BY ctes DESC`],
  ['Itens entregues e ainda não faturados', `SELECT pedido, item, material, texto_breve, qtd_pedido, a_faturar\nFROM t_me2n\nWHERE coalesce(a_fornecer, 0) = 0 AND coalesce(a_faturar, 0) > 0\nORDER BY pedido, item`],
  ['Pendências vencidas por fornecedor', `SELECT fornecedor, count(*) AS notas, min(dias_para_vencer) AS mais_vencida_dias, sum(valor) AS valor\nFROM v_nfe\nWHERE situacao = 'Pendente' AND dias_para_vencer < 0\nGROUP BY fornecedor\nORDER BY notas DESC`],
  ['Situação e escopo de todas as notas', `SELECT tipo, situacao, escopo, count(*) AS notas\nFROM v_documentos\nGROUP BY ALL\nORDER BY tipo, notas DESC`],
  ['Efeito da lista "Fora do escopo" (todas as notas)', `SELECT tipo, escopo, coalesce(escopo_motivo, '(regra automática)') AS motivo, count(*) AS notas\nFROM (SELECT 'NF-e' AS tipo, escopo, escopo_motivo FROM v_nfe_todas\n      UNION ALL SELECT 'CT-e', escopo, escopo_motivo FROM v_cte_todas)\nGROUP BY ALL\nORDER BY tipo, notas DESC`],
  ['De onde veio o pedido das notas', `SELECT coalesce(origem_pedido, '(sem pedido)') AS origem, count(*) AS notas\nFROM v_nfe GROUP BY 1 ORDER BY 2 DESC`],
  ['Fornecedores que emitem nota sem pedido (XML)', `SELECT fornecedor, count(*) AS notas_com_xml,\n  count(*) FILTER (WHERE aviso_pedido IS NOT NULL) AS com_aviso,\n  count(*) FILTER (WHERE aviso_pedido = 'Sem pedido') AS sem_pedido\nFROM v_nfe WHERE tem_xml\nGROUP BY fornecedor HAVING count(*) FILTER (WHERE aviso_pedido IS NOT NULL) > 0\nORDER BY com_aviso DESC`],
  ['Frete do destinatário sem transportadora, por fornecedor', `SELECT fornecedor, count(*) AS notas, min(data_emissao) AS primeira, max(data_emissao) AS ultima\nFROM v_nfe WHERE alerta_transporte_nivel = 3\nGROUP BY fornecedor ORDER BY notas DESC`],
  ['Pedidos por etapa da trilha', `SELECT etapa_ordem, etapa_follow, count(*) AS pedidos, median(dias_na_etapa) AS mediana_dias\nFROM v_pedido_trilha GROUP BY ALL ORDER BY etapa_ordem`],
  ['Lotes importados por fonte', `SELECT 'VT IN' AS fonte, _lote, _arquivo, _importado_em, count(*) AS linhas FROM raw_vtin GROUP BY ALL\nUNION ALL SELECT 'MB51', _lote, _arquivo, _importado_em, count(*) FROM raw_mb51 GROUP BY ALL\nORDER BY _importado_em DESC`]
];

async function dicionario() {
  const objs = (await consulta(`SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'main' ORDER BY CASE WHEN table_name LIKE 'v\\_%' ESCAPE '\\' THEN 0 WHEN table_name LIKE 't\\_%' ESCAPE '\\' THEN 1 WHEN table_name LIKE 's\\_%' ESCAPE '\\' THEN 2 ELSE 3 END, table_name`)).linhas;
  const cols = (await consulta(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'main' ORDER BY table_name, ordinal_position`)).linhas;
  return objs.map(o => ({ nome: o.table_name, tipo: o.table_type === 'VIEW' ? 'view' : 'tabela', desc: S.DESCRICOES[o.table_name] || (o.table_name.startsWith('raw_') ? 'Tabela bruta: todas as linhas de todos os lotes importados (texto), com _lote, _importado_em, _arquivo e _linha.' : (o.table_name.startsWith('s_') ? 'Última versão de cada chave (lote mais recente).' : '')), cols: cols.filter(c => c.table_name === o.table_name) }));
}

export async function renderSql() {
  const box = $('aba-sql');
  if (box.dataset.pronto) return;
  box.dataset.pronto = '1';
  const ta = h('textarea', { class: 'sql', spellcheck: 'false' });
  ta.value = st.sqlUltimo || EXEMPLOS[0][1];
  const saida = h('div', { style: 'margin-top:12px' });
  const btnExec = h('button', { class: 'btn primario', text: 'Executar (Ctrl+Enter)' });
  const executar = async () => {
    limpar(saida).append(blocoCarregando('Executando a consulta…', 6)); st.sqlUltimo = ta.value;
    btnExec.classList.add('carregando'); btnExec.disabled = true;
    const t0 = performance.now();
    try {
      const r = await consulta(ta.value);
      limpar(saida);
      const ms = Math.round(performance.now() - t0);
      saida.append(h('div', { class: 'linha', style: 'margin-bottom:6px' }, h('b', { text: `${fmtInt(r.linhas.length)} linha(s)` }), h('span', { class: 'muted', text: `${ms} ms${r.linhas.length > 1000 ? ' · mostrando as primeiras 1.000' : ''}` }),
        h('span', { class: 'espaco' }), h('button', { class: 'btn pequeno', text: 'Exportar Excel', onclick: () => exportarLinhas(r.cols, r.linhas, 'consulta') })));
      // Linha com chave de acesso ou pedido abre o detalhe logo abaixo do resultado
      saida.append(tabela(r.cols, r.linhas.slice(0, 1000), { altura: 520, aoClicar: (r.cols.includes('chave') || r.cols.includes('pedido') || r.cols.includes('chave_cte')) ? (x) => abrirLinha(x.chave ? x : (x.chave_cte ? { chave: x.chave_cte } : x)) : null }));
    } catch (e) { limpar(saida).append(caixaErro('Erro na consulta', e)); }
    finally { btnExec.classList.remove('carregando'); btnExec.disabled = false; }
  };
  btnExec.addEventListener('click', executar);
  ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); executar(); } });
  const selEx = h('select', { onchange: (e) => { if (e.target.value !== '') { ta.value = EXEMPLOS[Number(e.target.value)][1]; executar(); } e.target.value = ''; } },
    h('option', { value: '', text: 'Exemplos de consulta…' }), EXEMPLOS.map(([t], i) => h('option', { value: String(i), text: t })));
  const copiarDic = async () => {
    const d = await dicionario();
    const txt = ['# Dicionário de dados – Follow-up de NF (protótipo A, DuckDB)', 'Só a estrutura, sem dados. Datas são DATE; códigos são texto sem zeros à esquerda; chave de acesso tem 44 dígitos.', '']
      .concat(d.map(o => `## ${o.nome} (${o.tipo})${o.desc ? '\n' + o.desc : ''}\n` + o.cols.map(c => `- ${c.column_name}: ${c.data_type}`).join('\n') + '\n')).join('\n');
    copiar(txt);
  };
  const lado = h('div', { class: 'card', style: 'max-height:640px;overflow:auto' }, h('h3', { text: 'Tabelas e views' }), h('p', { class: 'sub', text: 'v_ = visões do follow-up · t_ = fontes tipadas · s_ = última versão · raw_ = lotes brutos' }));
  box.append(h('div', { class: 'grid', style: 'grid-template-columns:minmax(0,3fr) minmax(260px,1fr)' },
    h('div', null, h('div', { class: 'card' }, h('div', { class: 'linha', style: 'margin-bottom:8px' }, h('h2', { text: 'Consulta SQL' }), h('span', { class: 'espaco' }), selEx,
      h('button', { class: 'btn', text: 'Copiar dicionário para o Claude', title: 'Copia nomes de tabelas e colunas, sem dados', onclick: copiarDic }),
      btnExec), ta,
      h('p', { class: 'sub', style: 'margin:6px 0 0', text: 'O banco é o DuckDB rodando neste navegador. Para pedir uma consulta ao Claude, copie o dicionário (só nomes de colunas) e descreva o que quer saber; cole aqui o SQL que ele devolver.' })), saida),
    lado));
  const espLado = carregandoLinha('Carregando as tabelas…');
  lado.append(espLado, esqTabela(8));
  try {
    const dic = await dicionario();
    lado.querySelectorAll('.esq').forEach(x => x.remove()); espLado.remove();
    for (const o of dic) {
      lado.append(h('details', { class: 'obj' }, h('summary', null, h('span', { class: 'mono', text: o.nome }), h('span', { class: 'muted', text: ` · ${o.tipo}` })),
        o.desc ? h('div', { class: 'muted', style: 'font-size:12px;margin:2px 0', text: o.desc }) : null,
        h('ul', null, o.cols.map(c => h('li', null, h('span', { class: 'mono', text: c.column_name }), ` ${c.data_type.toLowerCase()}`))),
        h('button', { class: 'btn pequeno', text: 'SELECT * …', onclick: () => { ta.value = `SELECT *\nFROM ${o.nome}\nLIMIT 100`; executar(); } })));
    }
  } catch (e) { lado.querySelectorAll('.esq').forEach(x => x.remove()); espLado.remove(); lado.append(caixaErro('Erro ao listar', e)); }
}
