/* Estado da página (filtros, período, configuração em uso) e constantes gerais. */
import { L } from '../logica/index.js';
import { S } from '../sql/index.js';

export const DUCKDB_VERSAO = '1.32.0';
export const DUCKDB_URL = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VERSAO}/+esm`;
export const IDB_NOME = 'followup_almox3001_prototipoA';
export const POR_PAGINA = 50;

export const FILTROS_NOTAS = ['no', 'fora', 'canceladas', 'arquivadas', 'todas'];
export const st = {
  db: null, conn: null, idb: null, xlsxOk: false, versaoDuck: '',
  cfg: JSON.parse(JSON.stringify(S.CONFIG_PADRAO)),
  lotes: [], errosViews: [], periodo: { de: '', ate: '' }, acomp: new Map(),
  pend: { tipo: 'NF-e', etapa: 'pendentes', faixa: '', classificacao: '', texto: '', pagina: 0, cols: [], linhas: [], mostrar: '', venc: '', projeto: '', ordem: 'vencimento' },
  etapa: {}, // estado das abas de etapa: { pedido: { filtro, texto, pagina }, ... }
  detalhe: null, sqlUltimo: null,
  filtroEscopo: (() => { try { const v = localStorage.getItem('followupA_filtroEscopo'); return FILTROS_NOTAS.includes(v) ? v : 'no'; } catch (e) { return 'no'; } })()
};

// Configuração em uso no modelo: a deste navegador (vinda do arquivo de configuração da empresa) e, enquanto houver
// dados fictícios carregados, também as regras "Fora do escopo" fictícias (só cobrem os CNPJs inventados).
export function cfgEmUso() {
  if (!st.lotes.some(l => l.demo)) return st.cfg;
  return Object.assign({}, st.cfg, { escopo: (st.cfg.escopo || []).concat(L.ESCOPO_DEMO) });
}
