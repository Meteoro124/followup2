/* Lógica pura reunida num objeto só (L), como era no arquivo único. */
import { decodeBytes, lerXmlFiscal, linhaXml, looksLikeText, MOD_FRETE, parseDelimited, pedidoDeTexto, pedidoNaObservacao, toCSV, XML_COLS, xmlParaAoa } from './arquivos.js';
import { chaveValida, cleanText, codigoInicial, colLetter, dataDePasta, decomporChave, dvChave, isoToSerial, MANIFESTACAO, norm, parseChave, parseCnpj, parseCodigo, parseDate, parseNumber, parsePasta, parseReferencia, REGRAS_OPERACAO, serialToISO, stripZeros, tipoOperacao, TIPOS_OPERACAO, UFS } from './basico.js';
import { ESCOPO_DEMO, gerarDemo } from './demo.js';
import { amostra, autoMap, converter, convertValue, dedupeHeaders, detectHeaderRow, fonte, FONTES, META_COLS } from './fontes.js';
import { csvParaObjetos, referenciaSituacao } from './referencia.js';

export const L = {
  codigoInicial, tipoOperacao, REGRAS_OPERACAO, TIPOS_OPERACAO, MANIFESTACAO, csvParaObjetos, referenciaSituacao, cleanText,
  norm, stripZeros, colLetter, parseNumber, parseDate, isoToSerial, serialToISO, parseCodigo,
  parseCnpj, parseChave, dvChave, chaveValida, decomporChave, UFS, parseReferencia, parsePasta,
  dataDePasta, decodeBytes, looksLikeText, parseDelimited, toCSV, FONTES, META_COLS, fonte,
  dedupeHeaders, detectHeaderRow, autoMap, amostra, convertValue, converter, gerarDemo, lerXmlFiscal,
  xmlParaAoa, linhaXml, pedidoDeTexto, pedidoNaObservacao, XML_COLS, MOD_FRETE, ESCOPO_DEMO
};
