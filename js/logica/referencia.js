/* Autoteste: as regras de escopo e situação refeitas em JavaScript, para comparar com o SQL. */
import { parseDelimited } from './arquivos.js';
import { codigoInicial, norm } from './basico.js';

// ---------------------------------------------------------------- autoteste: referência em JavaScript das regras de escopo e situação
export function csvParaObjetos(texto) {
  const { aoa } = parseDelimited(texto);
  if (!aoa.length) return [];
  const cab = aoa[0];
  return aoa.slice(1).map(l => { const o = {}; cab.forEach((c, i) => { o[c] = l[i] === undefined ? '' : l[i]; }); return o; });
}
// Conta as notas por tipo|escopo|situação, recalculando as regras a partir das linhas importadas.
// Digitalização considerada: arquivos da pasta com a chave no nome e planilha de controle.
export function referenciaSituacao(lin, acomp, cfg, hojeISO) {
  const DIA = 86400000;
  const t = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const ultimo = (rows, k) => { const m = new Map(); for (const r of rows) { const c = k(r); if (!c) continue; const a = m.get(c); if (!a || (r._importado_em || '') > (a[0]._importado_em || '')) m.set(c, [r]); else if ((r._importado_em || '') === (a[0]._importado_em || '')) a.push(r); } return m; };
  const centros = cfg.centros || [];
  const proprias = new Set((cfg.raizesProprias || []).filter(r => /^\d{8}$/.test(r)));
  const regras = (cfg.escopo || []).filter(e => e && (e.regra === 'cnpj' ? /^\d{14}$/ : /^\d{8}$/).test(String(e.valor || '')));
  const digit = new Set();
  for (const p of lin.pasta || []) if (p.chave && p.data_pasta) digit.add(p.chave);
  for (const d of lin.digit || []) if (d.chave && d.data_digitalizacao) digit.add(d.chave);
  const natXml = new Map();
  for (const [c, rows] of ultimo(lin.xml || [], r => r.chave)) { const n = rows.map(r => r.natureza).find(Boolean); if (n) natXml.set(c, n); }
  const man = new Map((acomp || []).map(a => [a.chave, a]));
  const corte = /^\d{4}-\d{2}-\d{2}$/.test(cfg.corteBacklog || '') ? cfg.corteBacklog : null;
  const nMista = parseInt(cfg.diasMista, 10);
  const diasMista = Number.isFinite(nMista) && nMista >= 0 ? nMista : 30;
  const cont = {};
  for (const [chave, rows] of ultimo(lin.vtin || [], r => r.chave)) {
    for (const r of rows) {
      if (r.centro && centros.length && !centros.includes(r.centro)) continue;
      const tipo = r.modelo === '55' ? 'NF-e' : (r.modelo === '57' ? 'CT-e' : null);
      if (!tipo) continue;
      const cnpj = r.cnpj_emitente || '', raiz = cnpj.slice(0, 8);
      const nat = norm(r.natureza_operacao || natXml.get(chave) || '');
      const cand = regras.filter(l => (l.regra === 'cnpj' ? cnpj === l.valor : (raiz === l.valor && !proprias.has(l.valor)))
        && (!norm(l.natureza || '') || nat.includes(norm(l.natureza))))
        .sort((a, b) => ((a.regra === 'cnpj' ? 0 : 1) - (b.regra === 'cnpj' ? 0 : 1)) || (a.valor < b.valor ? -1 : (a.valor > b.valor ? 1 : 0)));
      const m = cand[0], a = man.get(chave) || {};
      const idade = r.data_emissao ? Math.round((t(hojeISO) - t(r.data_emissao)) / DIA) : NaN;
      let escopo;
      if (a.escopo_manual === 'incluir') escopo = 'No escopo';
      else if (a.escopo_manual === 'excluir') escopo = 'Fora do escopo';
      else if (m && m.tipo === 'Mista') escopo = digit.has(chave) ? 'No escopo' : (idade > diasMista ? 'Fora do escopo' : 'A classificar');
      else escopo = m ? 'Fora do escopo' : 'No escopo';
      const numdoc = !!r.num_documento && r.num_documento !== '0';
      const lancada = tipo === 'NF-e' ? (numdoc || !!r.doc_miro) : (!!r.doc_miro || /^999/.test(String(r.etapa || '').trim()));
      const cancelada = ['101', '151'].includes(codigoInicial(r.status_sefaz)) || ['3', '20'].includes(codigoInicial(r.status_manifestacao));
      const arquivada = a.arquivada_manual === 'S' || (a.arquivada_manual !== 'N' && !!corte && !!r.data_emissao && r.data_emissao < corte);
      const situacao = cancelada ? 'Cancelada/recusada' : (lancada ? 'Lançada' : (arquivada ? 'Arquivada' : 'Pendente'));
      const k = `${tipo}|${escopo}|${situacao}`;
      cont[k] = (cont[k] || 0) + 1;
    }
  }
  return cont;
}
