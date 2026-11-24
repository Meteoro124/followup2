/* SQL: verificações de qualidade dos dados e trechos de tempo entre etapas. */

// ---------------------------------------------------------------- verificações de qualidade
export const VERIFICACOES = [
  { id: 'frete_fob_sem_transp', titulo: 'Frete do destinatário sem transportadora (XML)', ajuda: 'Frete por conta da Alvorada (modalidade 1) e a nota não informa transportadora: deveria haver CT-e e pedido de frete.',
    sql: `SELECT numero, fornecedor, data_emissao, pedido, etapa_follow, chave FROM v_nfe WHERE alerta_transporte_nivel = 3 ORDER BY data_emissao DESC` },
  { id: 'aviso_pedido', titulo: 'Nota emitida sem pedido ou com pedido divergente (XML)', ajuda: 'Sem pedido: nenhuma fonte achou. Divergente: o pedido do XML não está na ME2N ou difere do digitado. Não informou: o XML não traz pedido, mas outra fonte achou.',
    sql: `SELECT aviso_pedido, numero, fornecedor, data_emissao, pedido_xml, pedido_dig AS pedido_digitado, pedido, etapa_follow, chave FROM v_nfe WHERE aviso_pedido IS NOT NULL ORDER BY aviso_pedido_nivel DESC, data_emissao DESC` },
  { id: 'nfe_sem_pedido', titulo: 'NF-e sem pedido identificado', ajuda: 'Nenhuma fonte trouxe o pedido (XML, planilha de controle, nome do arquivo, VT IN, MB51 ou Della Volpe).',
    sql: `SELECT numero, serie, fornecedor, data_emissao, etapa_follow, chave FROM v_nfe WHERE pedido IS NULL` },
  { id: 'pedido_fora_me2n', titulo: 'Pedido da nota não está na ME2N', ajuda: 'Pode ser filtro da extração da ME2N ou pedido digitado errado.',
    sql: `SELECT pedido, origem_pedido, numero, fornecedor, data_emissao, chave FROM v_nfe WHERE pedido IS NOT NULL AND NOT pedido_na_me2n` },
  { id: 'pasta_diverge', titulo: 'Pasta Débito Direto/Estoque diferente da categoria do pedido', ajuda: 'Compara a pasta onde a nota foi digitalizada com o grupo configurado para a categoria do pedido (Configurações).',
    sql: `SELECT numero, fornecedor, pedido, categorias, grupo_classificacao AS grupo_pela_categoria, classificacao_pasta AS pasta, data_digitalizacao, chave FROM v_nfe WHERE grupo_classificacao IS NOT NULL AND classificacao_pasta IS NOT NULL AND classificacao_pasta <> grupo_classificacao` },
  { id: 'lancada_sem_entrada', titulo: 'NF-e lançada sem entrada 101', ajuda: 'Pode ser transferência, serviço ou entrada com referência diferente.',
    sql: `SELECT numero, serie, fornecedor, data_emissao, num_documento, doc_miro, pedido, chave FROM v_nfe WHERE lancada AND data_entrada IS NULL` },
  { id: 'entrada_estornada', titulo: 'Entrada estornada (102)', ajuda: 'A nota teve estorno; confira se houve nova entrada.',
    sql: `SELECT numero, serie, fornecedor, data_entrada, n_101 AS linhas_101, n_102 AS linhas_102, qtd_liquida, docs_material, chave FROM v_nfe WHERE coalesce(n_102, 0) > 0` },
  { id: 'nf_ambigua', titulo: 'Número e série repetidos sem desempate', ajuda: 'Mais de uma nota com o mesmo número e série; nenhuma tinha o pedido da entrada. A entrada não foi ligada.',
    sql: `SELECT * FROM v_nfe_ambiguas` },
  { id: 'entrada_sem_ref', titulo: 'Entrada 101 sem referência de nota', ajuda: 'Movimento 101 sem o campo Referência preenchido.',
    sql: `SELECT doc_material, item_doc, data_lancamento, material, texto_material, pedido, fornecedor FROM t_mb51 WHERE tipo_mov = '101' AND ref_numero IS NULL` },
  { id: 'entrada_sem_nota', titulo: 'Entrada cuja nota não está no VT IN', ajuda: 'Nota fora do período extraído do VT IN ou referência diferente.',
    sql: `SELECT e.ref_numero AS numero, e.ref_serie AS serie, e.data_entrada, e.docs_material FROM v_entradas_ref e WHERE e.n_101 > 0 AND NOT EXISTS (SELECT 1 FROM t_vtin n WHERE n.tipo = 'NF-e' AND n.numero = e.ref_numero AND (e.ref_serie = '' OR e.ref_serie = n.serie))` },
  { id: 'digit_sem_nota', titulo: 'Arquivo digitalizado sem nota no VT IN', ajuda: 'Sem chave no nome e número não encontrado (ou repetido) no VT IN.',
    sql: `SELECT p.nome_arquivo, p.data_pasta, p.classificacao_pasta, p.numero_nf, p.chave, p.caminho FROM v_pasta_nota p WHERE p.chave_nota IS NULL OR NOT EXISTS (SELECT 1 FROM t_vtin n WHERE n.chave = p.chave_nota)` },
  { id: 'chave_invalida', titulo: 'Chave com dígito verificador inválido', ajuda: 'Erro de digitação ou leitura.',
    sql: `SELECT 'VT IN' AS fonte, chave FROM t_vtin WHERE dv_ok = 'N' UNION ALL SELECT 'Controle de digitalização', chave FROM t_digit WHERE dv_ok = 'N'` },
  { id: 'chave_duplicada', titulo: 'Chave repetida na mesma extração', ajuda: 'A mesma chave aparece mais de uma vez no mesmo arquivo.',
    sql: `SELECT 'VT IN' AS fonte, chave, count(*) AS vezes FROM s_vtin GROUP BY chave HAVING count(*) > 1 UNION ALL SELECT 'Controle de digitalização', chave, count(*) FROM s_digit GROUP BY chave HAVING count(*) > 1` },
  { id: 'datas_invertidas', titulo: 'Datas fora de ordem', ajuda: 'Digitalização ou entrada antes da emissão, ou lançamento antes da entrada.',
    sql: `SELECT numero, fornecedor, data_emissao, data_digitalizacao, data_entrada, data_miro, chave FROM v_nfe WHERE d_emissao_entrada < 0 OR d_emissao_digit < 0 OR d_entrada_lanc < 0` }
];

export const TRECHOS = [
  ['Pedido → coleta', 'd_pedido_coleta'],
  ['Coleta → entrega', 'd_coleta_entrega'],
  ['Entrega → digitalização', 'd_entrega_digit'],
  ['Emissão → digitalização', 'd_emissao_digit'],
  ['Digitalização → entrada (MIGO)', 'd_digit_entrada'],
  ['Entrada → lançamento', 'd_entrada_lanc'],
  ['Emissão → entrada (total)', 'd_emissao_entrada']
];
