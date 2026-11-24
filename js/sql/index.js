/* Modelo SQL reunido num objeto só (S), como era no arquivo único. */
import { ACOMP_COLS, CONFIG_PADRAO, CONTATO_COLS } from './config-padrao.js';
import { DESCRICOES } from './descricoes.js';
import { esquema, materializacoes, views } from './modelo.js';
import { lista, q, sqlVal } from './util.js';
import { TRECHOS, VERIFICACOES } from './verificacoes.js';

export const S = {
  CONFIG_PADRAO, ACOMP_COLS, CONTATO_COLS, sqlVal, esquema, views, materializacoes,
  VERIFICACOES, TRECHOS, DESCRICOES, q, lista
};
export { q } from './util.js';
