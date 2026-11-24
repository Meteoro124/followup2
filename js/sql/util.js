/* SQL: funções de apoio (aspas, listas, normalização, tipo de operação). */
import { L } from '../logica/index.js';

export const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
export const lista = (arr) => arr.map(q).join(', ');

export const sqlVal = (v) => (v === null || v === undefined || v === '') ? 'NULL' : q(v);
export const dataValida = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null;
// Tipo de operação pela natureza normalizada (mesma regra de Logic.tipoOperacao)
export const tipoOperacaoSQL = (n) => `CASE WHEN coalesce(${n}, '') = '' THEN NULL ${L.REGRAS_OPERACAO.map(([re, t]) => `WHEN regexp_matches(${n}, ${q(re)}) THEN ${q(t)}`).join(' ')} ELSE 'Outra' END`;

export const inteiro = (v, padrao) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : padrao; };
// Mesma normalização do JavaScript (Logic.norm): sem acentos, minúsculas, só letras e números
export const normSQL = (expr) => `regexp_replace(lower(strip_accents(regexp_replace(coalesce(${expr}, ''), '[º°ª]', '', 'g'))), '[^a-z0-9]', '', 'g')`;
