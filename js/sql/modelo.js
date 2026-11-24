/* MODELO SQL (DuckDB): tabelas brutas acumuladas por lote e views do follow-up. Toda a regra de negócio está aqui,
   em SQL legível, para ser revisada e reaproveitada no DuckDB local, num servidor ou traduzida para Power Query. */
import { L } from '../logica/index.js';
import { ACOMP_COLS, CONTATO_COLS } from './config-padrao.js';
import { dataValida, inteiro, lista, normSQL, q, tipoOperacaoSQL } from './util.js';

function filtroCentro(cfg, col) {
  return cfg.centros && cfg.centros.length ? `(${col} IS NULL OR ${col} IN (${lista(cfg.centros)}))` : 'TRUE';
}

export function esquema() {
  const out = L.FONTES.map(f => {
    const cols = f.colunas.concat(L.META_COLS).map(c => `"${c}" VARCHAR`).join(', ');
    return `CREATE TABLE IF NOT EXISTS ${f.tabela} (${cols})`;
  });
  out.push('CREATE TABLE IF NOT EXISTS obs (chave VARCHAR, texto VARCHAR, atualizado_em VARCHAR)');
  // Acompanhamento manual por nota (escopo, vencimento, próxima ação, canal, tipo de operação, projeto, arquivamento) e histórico de contatos
  out.push(`CREATE TABLE IF NOT EXISTS acomp (${ACOMP_COLS.map(c => `"${c}" VARCHAR`).join(', ')})`);
  out.push(`CREATE TABLE IF NOT EXISTS contatos (${CONTATO_COLS.map(c => `"${c}" VARCHAR`).join(', ')})`);
  // Filtro "Notas" escolhido no topo da página: 'no' (padrão), 'fora', 'canceladas', 'arquivadas' ou 'todas'
  out.push('CREATE TABLE IF NOT EXISTS filtro_escopo (modo VARCHAR)');
  return out;
}
function linhaEscopoValida(e) {
  if (!e) return false;
  const v = String(e.valor || '');
  return e.regra === 'cnpj' ? /^\d{14}$/.test(v) : /^\d{8}$/.test(v);
}
// A lista "Fora do escopo" vira uma tabela (um único comando, recriado ao salvar a configuração)
function escopoSQL(cfg) {
  const sv = (s) => (s === null || s === undefined || s === '') ? 'NULL' : q(s);
  const linhas = (cfg.escopo || []).filter(linhaEscopoValida).map(e =>
    `(${q(e.regra === 'cnpj' ? 'cnpj' : 'raiz')}, ${q(e.valor)}, ${sv(e.nome)}, ${sv(e.tipo)}, ${sv(e.motivo)}, ${sv(e.natureza)}, ${q(L.norm(e.natureza || ''))}, ${sv(e.incluido_em)})`);
  const cols = 'regra, valor, nome, tipo, motivo, natureza, natureza_norm, incluido_em';
  return linhas.length
    ? `CREATE OR REPLACE TABLE cfg_escopo AS SELECT * FROM (VALUES ${linhas.join(', ')}) t(${cols})`
    : `CREATE OR REPLACE TABLE cfg_escopo AS SELECT ${cols.split(', ').map(c => `CAST(NULL AS VARCHAR) AS ${c}`).join(', ')} WHERE FALSE`;
}

// Camada leve sobre a tabela pré-calculada (base): escopo, situação, vencimento e acompanhamento manual.
// Escopo: decisão manual > transportadora mista (digitalizado = no escopo; mais de N dias sem digitalização = fora; senão a classificar) > lista > no escopo.
// Situação: cancelada/recusada > lançada > arquivada (à mão, ou emitida antes da data de corte) > pendente.
function viewOverlay(nome, base, cfg) {
  const dm = inteiro(cfg.diasMista, 30), dv = inteiro(cfg.diasVencimento, 30);
  const corte = dataValida(cfg.corteBacklog);
  const condCorte = corte ? `x.data_emissao < DATE ${q(corte)}` : 'FALSE';
  return [nome, `CREATE OR REPLACE VIEW ${nome} AS
WITH a AS (
  SELECT chave, nullif(escopo_manual, '') AS escopo_manual,
    TRY_CAST(nullif(vencimento_manual, '') AS DATE) AS vencimento_manual,
    TRY_CAST(nullif(proxima_acao_data, '') AS DATE) AS proxima_acao_data, nullif(proxima_acao_texto, '') AS proxima_acao_texto,
    nullif(canal_recebimento, '') AS canal_recebimento, nullif(tipo_operacao_manual, '') AS tipo_operacao_manual,
    nullif(projeto, '') AS projeto, nullif(arquivada_manual, '') AS arquivada_manual
  FROM acomp
  QUALIFY row_number() OVER (PARTITION BY chave ORDER BY atualizado_em DESC NULLS LAST) = 1
),
k AS (
  SELECT chave, count(*) AS qtd_contatos, max(TRY_CAST(data AS DATE)) AS ultimo_contato_data,
    arg_max(coalesce(nullif(quem, '') || ': ', '') || coalesce(texto, ''), coalesce(data, '') || coalesce(registrado_em, '')) AS ultimo_contato
  FROM contatos GROUP BY chave
),
x AS (
  SELECT b.*,
    a.escopo_manual, a.vencimento_manual, a.proxima_acao_data, a.proxima_acao_texto, a.canal_recebimento,
    a.tipo_operacao_manual, a.projeto, a.arquivada_manual,
    k.qtd_contatos, k.ultimo_contato_data, k.ultimo_contato,
    coalesce(a.tipo_operacao_manual, b.tipo_operacao_auto) AS tipo_operacao,
    (b.data_digitalizacao IS NULL AND date_diff('day', b.data_emissao, current_date) > ${dm}) AS mista_vencida
  FROM ${base} b
  LEFT JOIN a ON a.chave = b.chave
  LEFT JOIN k ON k.chave = b.chave
),
y AS (
  SELECT x.* EXCLUDE (mista_vencida),
    CASE WHEN escopo_manual = 'incluir' THEN 'No escopo'
         WHEN escopo_manual = 'excluir' THEN 'Fora do escopo'
         WHEN lista_tipo = 'Mista' THEN
           CASE WHEN data_digitalizacao IS NOT NULL THEN 'No escopo' WHEN mista_vencida THEN 'Fora do escopo' ELSE 'A classificar' END
         WHEN lista_valor IS NOT NULL THEN 'Fora do escopo'
         ELSE 'No escopo' END AS escopo,
    CASE WHEN escopo_manual = 'incluir' THEN 'Decisão manual: no acompanhamento'
         WHEN escopo_manual = 'excluir' THEN 'Decisão manual: fora do escopo'
         WHEN lista_tipo = 'Mista' THEN
           CASE WHEN data_digitalizacao IS NOT NULL THEN 'Transportadora mista: digitalizado pelo almoxarifado'
                WHEN mista_vencida THEN 'Transportadora mista: mais de ${dm} dias sem digitalização (sugerido)'
                ELSE 'Transportadora mista: aguardando digitalização' END
         WHEN lista_valor IS NOT NULL THEN 'Lista: ' || coalesce(lista_motivo, 'fora do escopo') || coalesce(' · ' || lista_nome, '')
    END AS escopo_motivo,
    coalesce(vencimento_manual, CAST(data_emissao + INTERVAL ${dv} DAY AS DATE)) AS vencimento,
    (vencimento_manual IS NULL) AS vencimento_estimado,
    CASE WHEN cancelada THEN 'Cancelada/recusada'
         WHEN lancada THEN 'Lançada'
         WHEN arquivada_manual = 'S' OR (coalesce(arquivada_manual, '') <> 'N' AND ${condCorte}) THEN 'Arquivada'
         ELSE 'Pendente' END AS situacao
  FROM x
)
SELECT y.*,
  (escopo <> 'Fora do escopo' AND situacao = 'Pendente') AS em_acompanhamento,
  (escopo <> 'Fora do escopo' AND situacao IN ('Pendente', 'Lançada')) AS conta_indicador,
  CASE WHEN situacao = 'Pendente' THEN date_diff('day', current_date, vencimento) END AS dias_para_vencer,
  (lancada AND data_miro > vencimento) AS lancada_apos_vencimento,
  (situacao = 'Pendente' AND escopo <> 'Fora do escopo' AND proxima_acao_data IS NOT NULL AND proxima_acao_data <= current_date) AS acao_para_hoje,
  CASE WHEN proxima_acao_data IS NOT NULL THEN strftime(proxima_acao_data, '%d/%m') || coalesce(' · ' || proxima_acao_texto, '') ELSE proxima_acao_texto END AS proxima_acao,
  -- Prazo da Della Volpe (decidido em 22/11/2026): só para notas com coleta dela (previsão ou status no relatório).
  -- Vale o status de atraso dela ("ATRAS…") e a previsão de entrega dela; entrega = data de entrega dela ou, sem ela, a digitalização.
  CASE WHEN previsao_entrega IS NULL AND status_sla IS NULL THEN NULL
       WHEN coalesce(data_entrega, data_digitalizacao) IS NOT NULL OR coalesce(lancada, false) THEN
         CASE WHEN upper(coalesce(status_sla, '')) LIKE '%ATRAS%' OR coalesce(data_entrega, data_digitalizacao) > previsao_entrega THEN 'Entregue com atraso'
              WHEN coalesce(data_entrega, data_digitalizacao) IS NULL OR previsao_entrega IS NULL THEN 'Entregue'
              ELSE 'Entregue no prazo' END
       WHEN upper(coalesce(status_sla, '')) LIKE '%ATRAS%' OR previsao_entrega < current_date THEN 'Atrasada'
       WHEN previsao_entrega IS NULL THEN 'Sem previsão'
       ELSE 'No prazo' END AS prazo_dv,
  CASE WHEN coalesce(data_entrega, data_digitalizacao) IS NULL AND NOT coalesce(lancada, false) AND previsao_entrega < current_date
       THEN date_diff('day', previsao_entrega, current_date) END AS dias_atraso_dv
FROM y`];
}
// Visão filtrada pelo filtro "Notas" do topo da página. O padrão ("Em acompanhamento") mostra as notas no escopo
// (e as "A classificar") pendentes e lançadas: tira as fora do escopo, as canceladas/recusadas e o backlog arquivado.
function viewFiltrada(nome, todas) {
  return [nome, `CREATE OR REPLACE VIEW ${nome} AS
SELECT * FROM ${todas}
WHERE CASE (SELECT coalesce(max(modo), 'no') FROM filtro_escopo)
        WHEN 'todas' THEN TRUE
        WHEN 'fora' THEN escopo = 'Fora do escopo'
        WHEN 'canceladas' THEN situacao = 'Cancelada/recusada'
        WHEN 'arquivadas' THEN situacao = 'Arquivada'
        ELSE escopo <> 'Fora do escopo' AND situacao IN ('Pendente', 'Lançada') END`];
}
const MATERIALIZAR_NFE = ['m_nfe_base', 'CREATE OR REPLACE TABLE m_nfe_base AS SELECT * FROM v_nfe_base'];
const MATERIALIZAR_CTE = ['m_cte_base', 'CREATE OR REPLACE TABLE m_cte_base AS SELECT * FROM v_cte_base'];
// Tabelas pré-calculadas: recalcular depois de importar ou apagar dados (o acompanhamento manual não precisa)
export function materializacoes() { return [MATERIALIZAR_NFE, MATERIALIZAR_CTE]; }

// Última versão por chave: para cada chave, ficam as linhas do lote mais recente em que ela apareceu.
function snapshot(f) {
  return `CREATE OR REPLACE VIEW s_${f.id} AS
WITH b AS (SELECT *, (${f.chaveGrupo}) AS _k FROM ${f.tabela}),
u AS (SELECT _k, max(_importado_em) AS _m FROM b WHERE _k IS NOT NULL GROUP BY _k)
SELECT * EXCLUDE (_k, _m) FROM b JOIN u USING (_k) WHERE b._importado_em = u._m`;
}

function classificacaoSQL(cfg) {
  const casos = cfg.categorias.map(c => `WHEN ${q(c.cat)} THEN ${q(c.rotulo)}`).join(' ');
  const grupos = cfg.categorias.filter(c => c.grupo).map(c => `WHEN ${q(c.cat)} THEN ${q(c.grupo)}`).join(' ');
  return {
    rotulo: `CASE WHEN pedido IS NULL THEN 'Sem pedido identificado'
       WHEN NOT pedido_na_me2n THEN 'Pedido fora da ME2N'
       WHEN n_categorias > 1 THEN 'Misto (' || categorias || ')'
       ELSE CASE categoria_min ${casos} ELSE 'Categoria ' || categoria_min END END`,
    grupo: grupos ? `CASE WHEN pedido_na_me2n AND n_categorias = 1 THEN CASE categoria_min ${grupos} ELSE NULL END END` : 'CAST(NULL AS VARCHAR)'
  };
}

export function views(cfg) {
  const v = [['cfg_escopo', escopoSQL(cfg)]];
  L.FONTES.forEach(f => v.push(['s_' + f.id, snapshot(f)]));

  v.push(['t_vtin', `CREATE OR REPLACE VIEW t_vtin AS
SELECT chave,
  CASE modelo WHEN '55' THEN 'NF-e' WHEN '57' THEN 'CT-e' ELSE 'Outro' END AS tipo,
  numero_nf AS numero, coalesce(serie, '0') AS serie, cnpj_emitente AS cnpj, left(cnpj_emitente, 8) AS raiz, fornecedor,
  nullif(trim(natureza_operacao), '') AS natureza_operacao,
  TRY_CAST(data_emissao AS DATE) AS data_emissao,
  TRY_CAST(valor AS DOUBLE) AS valor,
  CASE WHEN num_documento IS NULL OR num_documento IN ('', '0') THEN NULL ELSE num_documento END AS num_documento,
  status_sefaz, regexp_extract(coalesce(status_sefaz, ''), '^\\s*0*(\\d+)', 1) AS sefaz_cod,
  status_manifestacao, regexp_extract(coalesce(status_manifestacao, ''), '^\\s*0*(\\d+)', 1) AS manifestacao_cod,
  nullif(trim(etapa), '') AS etapa,
  doc_migo, TRY_CAST(data_migo AS DATE) AS data_migo,
  doc_miro, TRY_CAST(data_miro AS DATE) AS data_miro,
  pedido, centro, dv_ok, _importado_em AS extraido_em
FROM s_vtin
WHERE ${filtroCentro(cfg, 'centro')}`]);

  v.push(['t_mb51', `CREATE OR REPLACE VIEW t_mb51 AS
SELECT doc_material, item_doc, ano_doc, tipo_mov,
  TRY_CAST(data_lancamento AS DATE) AS data_lancamento,
  material, texto_material, TRY_CAST(quantidade AS DOUBLE) AS quantidade,
  centro, deposito, centro_custo, pedido, item_pedido, fornecedor, referencia,
  ref_numero, coalesce(ref_serie, '') AS ref_serie,
  TRY_CAST(montante AS DOUBLE) AS montante, usuario
FROM s_mb51
WHERE tipo_mov IN (${lista(cfg.movimentos.length ? cfg.movimentos : ['101'])}) AND ${filtroCentro(cfg, 'centro')}`]);

  v.push(['v_entradas_ref', `CREATE OR REPLACE VIEW v_entradas_ref AS
SELECT ref_numero, ref_serie,
  min(data_lancamento) FILTER (WHERE tipo_mov = '101') AS data_entrada,
  sum(CASE WHEN tipo_mov = '101' THEN abs(coalesce(quantidade, 0))
           WHEN tipo_mov = '102' THEN -abs(coalesce(quantidade, 0)) ELSE 0 END) AS qtd_liquida,
  count(*) FILTER (WHERE tipo_mov = '101') AS n_101,
  count(*) FILTER (WHERE tipo_mov = '102') AS n_102,
  count(*) FILTER (WHERE tipo_mov NOT IN ('101', '102')) AS n_outros,
  list(DISTINCT pedido) FILTER (WHERE pedido IS NOT NULL) AS pedidos,
  string_agg(DISTINCT doc_material, ', ') AS docs_material
FROM t_mb51
WHERE ref_numero IS NOT NULL
GROUP BY ref_numero, ref_serie`]);

  v.push(['t_pasta', `CREATE OR REPLACE VIEW t_pasta AS
SELECT caminho, nome_arquivo, extensao, tipo_doc, classificacao_pasta,
  TRY_CAST(data_pasta AS DATE) AS data_pasta, TRY_CAST(data_modificacao AS DATE) AS data_modificacao,
  chave, numero_nf, pedido
FROM s_pasta`]);

  v.push(['t_digit', `CREATE OR REPLACE VIEW t_digit AS
SELECT chave, pedido, TRY_CAST(data_digitalizacao AS DATE) AS data_digitalizacao, setor, dv_ok
FROM s_digit`]);

  v.push(['v_pasta_nota', `CREATE OR REPLACE VIEW v_pasta_nota AS
WITH unico AS (
  SELECT tipo, numero, any_value(chave) AS chave
  FROM t_vtin GROUP BY tipo, numero HAVING count(*) = 1
)
SELECT coalesce(p.chave, u.chave) AS chave_nota,
  CASE WHEN p.chave IS NOT NULL THEN 'chave no nome do arquivo'
       WHEN u.chave IS NOT NULL THEN 'número da nota (único no VT IN)' END AS ligacao,
  p.*
FROM t_pasta p
LEFT JOIN unico u ON p.chave IS NULL AND u.tipo = p.tipo_doc AND u.numero = p.numero_nf`]);

  v.push(['v_digit', `CREATE OR REPLACE VIEW v_digit AS
WITH pa AS (
  SELECT chave_nota AS chave, min(data_pasta) AS data_pasta,
    string_agg(DISTINCT classificacao_pasta, ' / ') AS classificacao_pasta,
    any_value(pedido) AS pedido_pasta, count(*) AS arquivos, any_value(ligacao) AS ligacao_pasta
  FROM v_pasta_nota WHERE chave_nota IS NOT NULL GROUP BY chave_nota
),
ct AS (
  SELECT chave, min(data_digitalizacao) AS data_controle, any_value(pedido) AS pedido_controle, any_value(setor) AS setor
  FROM t_digit GROUP BY chave
)
SELECT coalesce(pa.chave, ct.chave) AS chave,
  coalesce(pa.data_pasta, ct.data_controle) AS data_digitalizacao,
  CASE WHEN pa.data_pasta IS NOT NULL THEN 'pasta do dia' WHEN ct.data_controle IS NOT NULL THEN 'planilha de controle' END AS origem_data_dig,
  coalesce(ct.pedido_controle, pa.pedido_pasta) AS pedido_dig,
  CASE WHEN ct.pedido_controle IS NOT NULL THEN 'planilha de controle' WHEN pa.pedido_pasta IS NOT NULL THEN 'nome do arquivo' END AS origem_pedido_dig,
  nullif(pa.classificacao_pasta, '') AS classificacao_pasta, ct.setor, pa.arquivos, pa.ligacao_pasta
FROM pa FULL OUTER JOIN ct ON pa.chave = ct.chave`]);

  v.push(['t_dv', `CREATE OR REPLACE VIEW t_dv AS
SELECT coleta, chave_nfe, chave_cte, coleta_pedido, pedido, pedido_texto,
  TRY_CAST(data_criacao_coleta AS DATE) AS data_criacao_coleta,
  TRY_CAST(data_coleta AS DATE) AS data_coleta,
  TRY_CAST(previsao_entrega AS DATE) AS previsao_entrega,
  TRY_CAST(data_entrega AS DATE) AS data_entrega,
  status_sla, remetente, _importado_em AS extraido_em
FROM s_dv`]);

  v.push(['v_dv_nfe', `CREATE OR REPLACE VIEW v_dv_nfe AS
SELECT chave_nfe,
  string_agg(DISTINCT coleta, ', ') AS coletas,
  string_agg(DISTINCT chave_cte, ', ') AS ctes,
  min(data_coleta) AS data_coleta,
  max(previsao_entrega) AS previsao_entrega,
  max(data_entrega) AS data_entrega,
  any_value(pedido) AS pedido_dv,
  string_agg(DISTINCT status_sla, ', ') AS status_sla
FROM t_dv WHERE chave_nfe IS NOT NULL GROUP BY chave_nfe`]);

  // XML exportados do VT IN
  v.push(['t_xml', `CREATE OR REPLACE VIEW t_xml AS
SELECT chave,
  CASE substr(chave, 21, 2) WHEN '55' THEN 'NF-e' WHEN '57' THEN 'CT-e' ELSE coalesce(tipo_doc, 'Outro') END AS tipo,
  TRY_CAST(data_emissao AS DATE) AS data_emissao, cnpj_emitente, emitente, cnpj_destinatario,
  natureza, nullif(trim(cfops), '') AS cfops, TRY_CAST(valor AS DOUBLE) AS valor,
  nullif(trim(mod_frete), '') AS mod_frete, coalesce(tem_transportadora = 'S', false) AS tem_transportadora,
  nullif(trim(transportadora), '') AS transportadora, nullif(cnpj_transportadora, '') AS cnpj_transportadora,
  nullif(trim(pedidos_itens), '') AS pedidos_itens, nullif(trim(itens_pedido), '') AS itens_pedido,
  nullif(trim(pedido_compra), '') AS pedido_compra, nullif(trim(pedido_obs), '') AS pedido_obs,
  nullif(trim(chaves_nfe), '') AS chaves_nfe, arquivo_xml, dv_ok, _importado_em AS extraido_em
FROM s_xml`]);

  // Uma linha por NF-e com XML. Operação sem compra = todos os CFOP do grupo x.9xx (remessa, conserto, comodato, bonificação).
  v.push(['v_xml_nfe', `CREATE OR REPLACE VIEW v_xml_nfe AS
SELECT chave, data_emissao AS data_emissao_xml, natureza, cfops, mod_frete, tem_transportadora,
  transportadora AS transportadora_xml, cnpj_transportadora,
  string_split(pedidos_itens, ' ')[1] AS pedido_xml_item, pedidos_itens, itens_pedido,
  pedido_compra AS pedido_xml_compra, pedido_obs AS pedido_xml_obs,
  coalesce(NOT regexp_matches(cfops, '(^| )[0-9][0-8][0-9][0-9]( |$)'), false) AS operacao_sem_compra
FROM t_xml WHERE tipo = 'NF-e'`]);

  // CT-e (XML) → NF-e transportadas: liga o frete à mercadoria para qualquer transportadora.
  v.push(['v_cte_xml_nfe', `CREATE OR REPLACE VIEW v_cte_xml_nfe AS
SELECT chave AS chave_cte, data_emissao AS data_emissao_cte, emitente AS transportadora_cte,
  unnest(string_split(chaves_nfe, ' ')) AS chave_nfe
FROM t_xml WHERE tipo = 'CT-e' AND chaves_nfe IS NOT NULL`]);

  v.push(['v_nfe_cte_xml', `CREATE OR REPLACE VIEW v_nfe_cte_xml AS
SELECT chave_nfe, min(data_emissao_cte) AS data_cte, string_agg(DISTINCT chave_cte, ', ') AS ctes_xml,
  any_value(transportadora_cte) AS transportadora_cte
FROM v_cte_xml_nfe GROUP BY chave_nfe`]);

  // Lista "Fora do escopo" por nota: o CNPJ completo vale antes da raiz; a raiz da própria empresa nunca é usada.
  // A natureza da operação vem do VT IN ou, sem ela, do XML.
  const proprias = (cfg.raizesProprias || []).filter(r => /^\d{8}$/.test(r));
  v.push(['v_natureza', `CREATE OR REPLACE VIEW v_natureza AS
WITH x AS (SELECT chave, any_value(natureza) AS natureza FROM t_xml WHERE natureza IS NOT NULL GROUP BY chave),
n AS (
  SELECT t.chave, t.cnpj, t.raiz, coalesce(t.natureza_operacao, x.natureza) AS natureza,
    ${normSQL('coalesce(t.natureza_operacao, x.natureza)')} AS natureza_norm
  FROM t_vtin t LEFT JOIN x ON x.chave = t.chave
)
SELECT n.*, ${tipoOperacaoSQL('n.natureza_norm')} AS tipo_operacao_auto FROM n`]);
  v.push(['v_escopo_lista', `CREATE OR REPLACE VIEW v_escopo_lista AS
WITH n AS (SELECT * FROM v_natureza)
SELECT n.chave, n.natureza AS natureza_escopo, l.tipo AS lista_tipo, l.motivo AS lista_motivo, l.nome AS lista_nome, l.regra AS lista_regra, l.valor AS lista_valor
FROM n
JOIN cfg_escopo l
  ON ((l.regra = 'cnpj' AND n.cnpj = l.valor)
      OR (l.regra = 'raiz' AND n.raiz = l.valor${proprias.length ? ` AND l.valor NOT IN (${lista(proprias)})` : ''}))
 AND (coalesce(l.natureza_norm, '') = '' OR contains(n.natureza_norm, l.natureza_norm))
QUALIFY row_number() OVER (PARTITION BY n.chave ORDER BY CASE l.regra WHEN 'cnpj' THEN 0 ELSE 1 END, l.valor) = 1`]);

  v.push(['t_me2n', `CREATE OR REPLACE VIEW t_me2n AS
SELECT pedido, item, tipo_doc,
  coalesce(upper(trim(categoria_cc)), '') AS categoria_cc,
  nullif(trim(cod_eliminacao), '') AS cod_eliminacao,
  grupo_compradores, TRY_CAST(data_documento AS DATE) AS data_pedido,
  fornecedor_cod, fornecedor_nome, material, texto_breve, centro, deposito,
  TRY_CAST(qtd_pedido AS DOUBLE) AS qtd_pedido,
  TRY_CAST(a_fornecer AS DOUBLE) AS a_fornecer,
  TRY_CAST(a_faturar AS DOUBLE) AS a_faturar,
  TRY_CAST(valor_liquido AS DOUBLE) AS valor_liquido,
  rc, item_rc, TRY_CAST(data_remessa AS DATE) AS data_remessa
FROM s_me2n
WHERE ${filtroCentro(cfg, 'centro')}`]);

  v.push(['v_pedido', `CREATE OR REPLACE VIEW v_pedido AS
SELECT pedido,
  min(data_pedido) AS data_pedido,
  count(*) AS itens,
  count(*) FILTER (WHERE cod_eliminacao IS NULL) AS itens_ativos,
  count(DISTINCT categoria_cc) AS n_categorias,
  min(categoria_cc) AS categoria_min,
  string_agg(DISTINCT CASE WHEN categoria_cc = '' THEN '(vazio = estoque)' ELSE categoria_cc END, ' + ') AS categorias,
  any_value(fornecedor_nome) AS fornecedor_pedido,
  any_value(grupo_compradores) AS grupo_compradores,
  sum(a_fornecer) AS a_fornecer, sum(a_faturar) AS a_faturar, sum(valor_liquido) AS valor_pedido,
  string_agg(DISTINCT rc, ', ') AS rcs_me2n
FROM t_me2n GROUP BY pedido`]);

  v.push(['t_me5a', `CREATE OR REPLACE VIEW t_me5a AS
SELECT rc, item_rc, TRY_CAST(data_solicitacao AS DATE) AS data_rc, grupo_compradores, criado_por, status,
  pedido, item_pedido, material, texto_breve, TRY_CAST(quantidade AS DOUBLE) AS quantidade, centro
FROM s_me5a
WHERE ${filtroCentro(cfg, 'centro')}`]);

  v.push(['v_rc_pedido', `CREATE OR REPLACE VIEW v_rc_pedido AS
SELECT pedido, min(data_rc) AS data_rc, string_agg(DISTINCT rc, ', ') AS rcs
FROM (
  SELECT pedido, rc, data_rc FROM t_me5a WHERE pedido IS NOT NULL
  UNION ALL
  SELECT m.pedido, m.rc, r.data_rc
  FROM t_me2n m JOIN t_me5a r ON r.rc = m.rc AND (m.item_rc IS NULL OR r.item_rc = m.item_rc)
) x
GROUP BY pedido`]);

  // Entrada da MB51 -> nota: número + série; se houver mais de uma nota com o mesmo número e série,
  // só liga a que tiver o pedido entre os pedidos da entrada.
  v.push(['v_nfe_cand', `CREATE OR REPLACE VIEW v_nfe_cand AS
WITH n AS (SELECT * FROM t_vtin WHERE tipo = 'NF-e'),
c AS (
  SELECT n.chave, coalesce(d.pedido_dig, n.pedido) AS pedido_doc, e.*
  FROM n
  JOIN v_entradas_ref e ON e.ref_numero = n.numero AND (e.ref_serie = '' OR e.ref_serie = n.serie)
  LEFT JOIN v_digit d ON d.chave = n.chave
),
k AS (SELECT ref_numero, ref_serie, count(*) AS candidatas FROM c GROUP BY ref_numero, ref_serie)
SELECT c.*, k.candidatas,
  (k.candidatas = 1 OR coalesce(list_contains(c.pedidos, c.pedido_doc), false)) AS aceita
FROM c JOIN k USING (ref_numero, ref_serie)`]);

  v.push(['v_nfe_entrada', `CREATE OR REPLACE VIEW v_nfe_entrada AS
SELECT chave,
  min(data_entrada) AS data_entrada, sum(qtd_liquida) AS qtd_liquida,
  sum(n_101)::BIGINT AS n_101, sum(n_102)::BIGINT AS n_102,
  string_agg(docs_material, ', ') AS docs_material,
  max(candidatas) AS candidatas,
  any_value(CASE WHEN len(pedidos) = 1 THEN pedidos[1] END) AS pedido_mb51
FROM v_nfe_cand WHERE aceita GROUP BY chave`]);

  v.push(['v_nfe_ambiguas', `CREATE OR REPLACE VIEW v_nfe_ambiguas AS
SELECT ref_numero AS numero, ref_serie AS serie, max(candidatas) AS notas_com_mesmo_numero,
  string_agg(chave, ', ') AS chaves, any_value(docs_material) AS docs_material
FROM v_nfe_cand
GROUP BY ref_numero, ref_serie
HAVING max(candidatas) > 1 AND NOT bool_or(aceita)`]);

  const cl = classificacaoSQL(cfg);
  v.push(['v_nfe_base', `CREATE OR REPLACE VIEW v_nfe_base AS
WITH b AS (
  SELECT n.chave, n.numero, n.serie, n.cnpj, n.fornecedor, n.natureza_operacao, n.data_emissao, n.valor,
    n.etapa AS etapa_vtin, n.status_sefaz, n.sefaz_cod, n.status_manifestacao, n.manifestacao_cod,
    (coalesce(n.sefaz_cod, '') IN ('101', '151') OR coalesce(n.manifestacao_cod, '') IN ('3', '20')) AS cancelada,
    n.num_documento, n.doc_miro, n.data_miro, n.dv_ok,
    n.pedido AS pedido_vtin, n.extraido_em, n.raiz, nt.tipo_operacao_auto,
    el.lista_tipo, el.lista_motivo, el.lista_nome, el.lista_regra, el.lista_valor, el.natureza_escopo,
    d.data_digitalizacao, d.origem_data_dig, d.pedido_dig, d.origem_pedido_dig, d.classificacao_pasta, d.setor,
    e.data_entrada, e.qtd_liquida, e.n_101, e.n_102, e.docs_material, e.pedido_mb51,
    dv.coletas, dv.ctes, dv.data_coleta AS data_coleta_dv, dv.previsao_entrega, dv.data_entrega, dv.status_sla, dv.pedido_dv,
    (x.chave IS NOT NULL) AS tem_xml, x.natureza, x.cfops, x.mod_frete, x.tem_transportadora, x.transportadora_xml,
    coalesce(x.operacao_sem_compra, false) AS operacao_sem_compra,
    x.pedido_xml_item, x.pedido_xml_compra, x.pedido_xml_obs, x.itens_pedido AS itens_pedido_xml,
    coalesce(x.pedido_xml_item, x.pedido_xml_compra, x.pedido_xml_obs) AS pedido_xml,
    cx.data_cte, cx.ctes_xml, cx.transportadora_cte,
    -- Coleta: data da Della Volpe; sem ela, emissão do CT-e; sem ela, emissão da NF-e
    coalesce(dv.data_coleta, cx.data_cte, n.data_emissao) AS data_coleta,
    CASE WHEN dv.data_coleta IS NOT NULL THEN 'Della Volpe'
         WHEN cx.data_cte IS NOT NULL THEN 'emissão do CT-e'
         WHEN n.data_emissao IS NOT NULL THEN 'emissão da NF-e' END AS origem_coleta,
    -- Pedido: XML (item, depois nota) vale mais que o digitado; a observação do XML vem depois do digitado
    coalesce(x.pedido_xml_item, x.pedido_xml_compra, d.pedido_dig, x.pedido_xml_obs, n.pedido, e.pedido_mb51, dv.pedido_dv) AS pedido,
    CASE WHEN x.pedido_xml_item IS NOT NULL THEN 'XML (item)'
         WHEN x.pedido_xml_compra IS NOT NULL THEN 'XML (nota)'
         WHEN d.pedido_dig IS NOT NULL THEN d.origem_pedido_dig
         WHEN x.pedido_xml_obs IS NOT NULL THEN 'XML (observação)'
         WHEN n.pedido IS NOT NULL THEN 'VT IN'
         WHEN e.pedido_mb51 IS NOT NULL THEN 'MB51'
         WHEN dv.pedido_dv IS NOT NULL THEN 'Della Volpe' END AS origem_pedido
  FROM t_vtin n
  LEFT JOIN v_digit d ON d.chave = n.chave
  LEFT JOIN v_nfe_entrada e ON e.chave = n.chave
  LEFT JOIN v_dv_nfe dv ON dv.chave_nfe = n.chave
  LEFT JOIN v_xml_nfe x ON x.chave = n.chave
  LEFT JOIN v_nfe_cte_xml cx ON cx.chave_nfe = n.chave
  LEFT JOIN v_natureza nt ON nt.chave = n.chave
  LEFT JOIN v_escopo_lista el ON el.chave = n.chave
  WHERE n.tipo = 'NF-e'
),
c AS (
  SELECT b.*,
    (p.pedido IS NOT NULL) AS pedido_na_me2n,
    p.data_pedido, p.categorias, p.n_categorias, p.categoria_min, p.fornecedor_pedido,
    p.grupo_compradores, p.a_fornecer, p.a_faturar, p.itens AS itens_pedido,
    rc.data_rc, rc.rcs,
    (b.num_documento IS NOT NULL OR b.doc_miro IS NOT NULL) AS lancada,
    (b.data_entrada IS NOT NULL AND coalesce(b.qtd_liquida, 1) > 0) AS com_entrada,
    (SELECT count(*) FROM t_me2n) > 0 AS me2n_carregada
  FROM b
  LEFT JOIN v_pedido p ON p.pedido = b.pedido
  LEFT JOIN v_rc_pedido rc ON rc.pedido = b.pedido
),
a AS (
  SELECT c.*,
    -- Aviso de nota emitida sem pedido (só para NF-e com XML e com compra)
    CASE WHEN NOT tem_xml OR operacao_sem_compra THEN NULL
         WHEN pedido_xml IS NULL AND pedido IS NULL THEN 'Sem pedido'
         WHEN pedido_xml IS NOT NULL AND ((me2n_carregada AND NOT pedido_na_me2n) OR (pedido_dig IS NOT NULL AND pedido_dig <> pedido_xml)) THEN 'Pedido divergente'
         WHEN pedido_xml IS NULL THEN 'Fornecedor não informou' END AS aviso_pedido,
    -- Transportadora na coleta (pela modalidade do frete do XML)
    CASE WHEN NOT tem_xml OR mod_frete = '9' THEN NULL
         WHEN mod_frete IN ('3', '4') THEN 'Transporte próprio'
         WHEN NOT tem_transportadora AND mod_frete = '1' THEN 'Frete do destinatário sem transportadora'
         WHEN NOT tem_transportadora THEN 'Sem transportadora' END AS alerta_transporte,
    CASE mod_frete WHEN '0' THEN 'Emitente (CIF)' WHEN '1' THEN 'Destinatário (FOB)' WHEN '2' THEN 'Terceiros'
         WHEN '3' THEN 'Próprio do remetente' WHEN '4' THEN 'Próprio do destinatário' WHEN '9' THEN 'Sem transporte' END AS modalidade_frete,
    (data_digitalizacao IS NOT NULL OR lancada) AS entregue
  FROM c
)
SELECT a.*,
  CASE aviso_pedido WHEN 'Sem pedido' THEN 3 WHEN 'Pedido divergente' THEN 2 WHEN 'Fornecedor não informou' THEN 1 END AS aviso_pedido_nivel,
  CASE alerta_transporte WHEN 'Frete do destinatário sem transportadora' THEN 3 WHEN 'Sem transportadora' THEN 2 WHEN 'Transporte próprio' THEN 1 END AS alerta_transporte_nivel,
  -- De acordo com o processo (destaque verde): pedido do XML confirmado, transportadora informada, nota digitalizada
  (tem_xml AND NOT operacao_sem_compra AND pedido_xml IS NOT NULL AND aviso_pedido IS NULL) AS pedido_conforme,
  (tem_xml AND alerta_transporte IS NULL AND coalesce(mod_frete, '') <> '9' AND tem_transportadora) AS transporte_conforme,
  (data_digitalizacao IS NOT NULL) AS entrega_conforme,
  CASE WHEN NOT tem_xml THEN 'Sem XML'
       WHEN aviso_pedido IS NULL AND alerta_transporte IS NULL AND NOT (lancada AND data_digitalizacao IS NULL) THEN 'Conforme'
       ELSE 'Com aviso' END AS situacao_processo,
  CASE WHEN data_digitalizacao IS NOT NULL THEN 'Entregue (digitalizada)'
       WHEN lancada THEN 'Lançada sem digitalização'
       ELSE 'Aguardando entrega' END AS situacao_entrega,
  ${cl.rotulo} AS classificacao,
  ${cl.grupo} AS grupo_classificacao,
  CASE WHEN lancada THEN 4 WHEN com_entrada THEN 3 WHEN data_digitalizacao IS NOT NULL THEN 2 ELSE 1 END AS etapa_ordem,
  CASE WHEN lancada THEN 'Lançada'
       WHEN com_entrada THEN 'Com entrada, sem lançamento'
       WHEN data_digitalizacao IS NOT NULL THEN 'Recebida, sem entrada'
       ELSE 'Aguardando recebimento' END AS etapa_follow,
  CASE WHEN lancada THEN NULL
       WHEN com_entrada THEN date_diff('day', data_entrada, current_date)
       WHEN data_digitalizacao IS NOT NULL THEN date_diff('day', data_digitalizacao, current_date)
       ELSE date_diff('day', data_emissao, current_date) END AS dias_na_etapa,
  date_diff('day', data_emissao, current_date) AS idade_dias,
  date_diff('day', data_rc, data_pedido) AS d_rc_pedido,
  date_diff('day', data_pedido, data_coleta) AS d_pedido_coleta,
  date_diff('day', data_coleta, data_entrega) AS d_coleta_entrega,
  date_diff('day', data_entrega, data_digitalizacao) AS d_entrega_digit,
  date_diff('day', data_emissao, data_digitalizacao) AS d_emissao_digit,
  date_diff('day', data_digitalizacao, data_entrada) AS d_digit_entrada,
  date_diff('day', data_entrada, data_miro) AS d_entrada_lanc,
  date_diff('day', data_emissao, data_entrada) AS d_emissao_entrada
FROM a`]);

  // v_nfe_base é pré-calculada em m_nfe_base. v_nfe_todas = todas as notas com escopo, situação, vencimento e
  // acompanhamento; v_nfe segue o filtro "Notas" do topo da página.
  v.push(MATERIALIZAR_NFE);
  v.push(viewOverlay('v_nfe_todas', 'm_nfe_base', cfg));
  v.push(viewFiltrada('v_nfe', 'v_nfe_todas'));

  // Trilha por pedido: Requisição → Pedido → Coleta → Pedido entregue → Pedido lançado.
  // Entregue = todas as notas do pedido digitalizadas ou lançadas; a data é a da digitalização.
  v.push(['v_pedido_trilha', `CREATE OR REPLACE VIEW v_pedido_trilha AS
WITH nf AS (
  SELECT pedido,
    count(*) AS notas,
    min(data_coleta) AS data_coleta,
    arg_min(origem_coleta, data_coleta) AS origem_coleta,
    count(*) FILTER (WHERE entregue) AS notas_entregues,
    min(data_digitalizacao) AS data_entregue,
    count(*) FILTER (WHERE lancada AND data_digitalizacao IS NULL) AS lancadas_sem_digit,
    count(*) FILTER (WHERE lancada) AS notas_lancadas,
    max(data_miro) AS data_ultimo_lancamento,
    max(aviso_pedido_nivel) AS aviso_pedido_nivel,
    max(alerta_transporte_nivel) AS alerta_transporte_nivel,
    count(*) FILTER (WHERE situacao_processo = 'Conforme') AS notas_conformes,
    any_value(fornecedor) AS fornecedor_nota,
    min(data_emissao) AS primeira_emissao
  FROM v_nfe WHERE pedido IS NOT NULL GROUP BY pedido
),
pe AS (
  SELECT pedido FROM v_pedido WHERE itens_ativos > 0
  UNION SELECT pedido FROM nf
),
j AS (
  SELECT pe.pedido, rc.data_rc, rc.rcs, p.data_pedido, (p.pedido IS NOT NULL) AS na_me2n,
    coalesce(p.fornecedor_pedido, nf.fornecedor_nota) AS fornecedor, p.grupo_compradores, p.categorias,
    p.a_fornecer, p.valor_pedido,
    coalesce(nf.notas, 0) AS notas, nf.data_coleta, nf.origem_coleta,
    coalesce(nf.notas_entregues, 0) AS notas_entregues, nf.data_entregue, coalesce(nf.lancadas_sem_digit, 0) AS lancadas_sem_digit,
    coalesce(nf.notas_lancadas, 0) AS notas_lancadas,
    CASE WHEN nf.notas > 0 AND nf.notas_lancadas = nf.notas THEN nf.data_ultimo_lancamento END AS data_lancado,
    nf.aviso_pedido_nivel, nf.alerta_transporte_nivel, nf.primeira_emissao, coalesce(nf.notas_conformes, 0) AS notas_conformes
  FROM pe
  LEFT JOIN v_pedido p ON p.pedido = pe.pedido
  LEFT JOIN nf ON nf.pedido = pe.pedido
  LEFT JOIN v_rc_pedido rc ON rc.pedido = pe.pedido
)
SELECT j.*,
  (notas > 0 AND notas_conformes = notas) AS pedido_conforme_processo,
  CASE WHEN notas > 0 AND notas_lancadas = notas THEN 5
       WHEN notas > 0 AND notas_entregues = notas THEN 4
       WHEN notas > 0 THEN 3
       WHEN coalesce(a_fornecer, 1) = 0 THEN NULL
       ELSE 2 END AS etapa_ordem,
  CASE WHEN notas > 0 AND notas_lancadas = notas THEN 'Pedido lançado'
       WHEN notas > 0 AND notas_entregues = notas THEN 'Entregue, aguardando lançamento'
       WHEN notas > 0 THEN 'Coletado, aguardando entrega'
       WHEN coalesce(a_fornecer, 1) = 0 THEN 'Recebido pela ME2N, nota fora do VT IN importado'
       ELSE 'Aguardando faturamento' END AS etapa_follow,
  CASE WHEN notas > 0 AND notas_lancadas = notas THEN NULL
       WHEN notas > 0 AND notas_entregues = notas THEN date_diff('day', data_entregue, current_date)
       WHEN notas > 0 THEN date_diff('day', data_coleta, current_date)
       ELSE date_diff('day', data_pedido, current_date) END AS dias_na_etapa
FROM j`]);

  v.push(['v_cte_base', `CREATE OR REPLACE VIEW v_cte_base AS
WITH c AS (SELECT * FROM t_vtin WHERE tipo = 'CT-e'),
dv AS (
  SELECT chave_cte,
    string_agg(DISTINCT coleta, ', ') AS coletas,
    string_agg(DISTINCT chave_nfe, ', ') AS nfes,
    count(DISTINCT chave_nfe) AS qtd_nfe,
    min(data_coleta) AS data_coleta, max(data_entrega) AS data_entrega, max(previsao_entrega) AS previsao_entrega,
    string_agg(DISTINCT status_sla, ', ') AS status_sla,
    any_value(pedido) AS pedido_mercadoria
  FROM t_dv WHERE chave_cte IS NOT NULL GROUP BY chave_cte
),
pa AS (
  SELECT chave_nota, min(data_pasta) AS data_digitalizacao
  FROM v_pasta_nota WHERE tipo_doc = 'CT-e' AND chave_nota IS NOT NULL GROUP BY chave_nota
)
SELECT c.chave, c.numero, c.serie, c.cnpj, c.raiz, c.fornecedor AS transportadora, c.natureza_operacao, c.data_emissao, c.valor,
  c.etapa AS etapa_vtin, c.status_sefaz, c.sefaz_cod, c.status_manifestacao, c.manifestacao_cod,
  (coalesce(c.sefaz_cod, '') IN ('101', '151') OR coalesce(c.manifestacao_cod, '') IN ('3', '20')) AS cancelada,
  (c.doc_miro IS NOT NULL OR coalesce(c.etapa, '') LIKE '999%') AS lancada,
  c.num_documento, c.doc_miro, c.data_miro, c.dv_ok, c.extraido_em, nt.tipo_operacao_auto,
  el.lista_tipo, el.lista_motivo, el.lista_nome, el.lista_regra, el.lista_valor, el.natureza_escopo,
  dv.coletas, dv.nfes, dv.qtd_nfe, dv.data_coleta, dv.data_entrega, dv.previsao_entrega, dv.status_sla, dv.pedido_mercadoria,
  pa.data_digitalizacao,
  CASE WHEN c.doc_miro IS NOT NULL OR c.etapa LIKE '999%' THEN 3
       WHEN c.etapa ILIKE 'A10%' THEN 2 ELSE 1 END AS etapa_ordem,
  CASE WHEN c.doc_miro IS NOT NULL OR c.etapa LIKE '999%' THEN 'Lançado'
       WHEN c.etapa ILIKE 'A10%' THEN 'Aguardando pedido de frete (A10)'
       ELSE 'Em processamento no VT IN' END AS etapa_follow,
  CASE WHEN c.doc_miro IS NOT NULL OR c.etapa LIKE '999%' THEN NULL
       ELSE date_diff('day', c.data_emissao, current_date) END AS dias_na_etapa,
  date_diff('day', c.data_emissao, current_date) AS idade_dias,
  date_diff('day', c.data_emissao, c.data_miro) AS d_emissao_lanc
FROM c
LEFT JOIN dv ON dv.chave_cte = c.chave
LEFT JOIN pa ON pa.chave_nota = c.chave
LEFT JOIN v_natureza nt ON nt.chave = c.chave
LEFT JOIN v_escopo_lista el ON el.chave = c.chave`]);
  v.push(MATERIALIZAR_CTE);
  v.push(viewOverlay('v_cte_todas', 'm_cte_base', cfg));
  v.push(viewFiltrada('v_cte', 'v_cte_todas'));

  // NF-e e CT-e juntos, sem o filtro do topo (painel, contador de ações para hoje e autoteste)
  const COLS_DOC = 'chave, numero, serie, data_emissao, valor, etapa_ordem, etapa_follow, dias_na_etapa, escopo, escopo_motivo, escopo_manual, situacao, em_acompanhamento, conta_indicador, dias_para_vencer, vencimento, vencimento_estimado, proxima_acao_data, proxima_acao_texto, proxima_acao, acao_para_hoje, ultimo_contato, projeto, tipo_operacao, lancada, lancada_apos_vencimento';
  v.push(['v_documentos', `CREATE OR REPLACE VIEW v_documentos AS
SELECT 'NF-e' AS tipo, fornecedor AS emitente, cnpj, pedido, ${COLS_DOC} FROM v_nfe_todas
UNION ALL
SELECT 'CT-e' AS tipo, transportadora AS emitente, cnpj, pedido_mercadoria AS pedido, ${COLS_DOC} FROM v_cte_todas`]);
  // Transportadora nova: primeiro CT-e há poucos dias, fora da lista e não marcada como do almoxarifado
  const conhecidas = (cfg.transportadorasConhecidas || []).filter(r => /^\d{8}$/.test(r));
  v.push(['v_transportadoras_novas', `CREATE OR REPLACE VIEW v_transportadoras_novas AS
SELECT raiz, any_value(transportadora) AS transportadora, any_value(cnpj) AS cnpj, min(data_emissao) AS primeiro_cte,
  count(*) AS ctes, count(*) FILTER (WHERE data_digitalizacao IS NOT NULL) AS digitalizados
FROM m_cte_base
WHERE lista_valor IS NULL AND raiz IS NOT NULL${conhecidas.length ? ` AND raiz NOT IN (${lista(conhecidas)})` : ''}
GROUP BY raiz
HAVING date_diff('day', min(data_emissao), current_date) <= ${inteiro(cfg.diasTransportadoraNova, 45)}`]);

  return v;
}
