/* Abas das 4 etapas da trilha do pedido (Pedido, Coleta, Entregue, Lançado): pesquisas e listas.
   A RC (ME5A) saiu da trilha em 22/11/2026: continua guardada, mas não aparece nas telas. */
import { mostrarAba } from '../app.js';
import { L } from '../logica/index.js';
import { avisoFiltroEscopo, colsEscopo } from '../nucleo/acompanhamento.js';
import { consulta } from '../nucleo/banco.js';
import { $, blocoCarregando, h, limpar } from '../nucleo/dom.js';
import { POR_PAGINA, st } from '../nucleo/estado.js';
import { caixaErro, exportarLinhas, fmtInt, tabela } from '../nucleo/formato.js';
import { abrirDetalhe, abrirPedido } from './detalhe.js';
import { q } from '../sql/index.js';

// ------------------------------------------------------------------ ABAS DAS ETAPAS (Pedido, Coleta, Entregue, Lançado)
export function irParaEtapa(id, filtro, texto) {
  st.etapa[id] = { filtro: filtro || ETAPAS[id].filtros[0][0], texto: texto || '', pagina: 0 };
  mostrarAba(id);
}

// Termo de pesquisa: texto livre, número sem zeros à esquerda e dígitos (para chave de acesso)
export function termo(texto) {
  const txt = String(texto || '').trim(), dig = txt.replace(/\D/g, '');
  return { txt, like: q('%' + txt + '%'), num: /^[\d\s.\-/]+$/.test(txt) ? L.stripZeros(dig) : '', dig };
}
// Pesquisa comum às listas de notas (v_nfe com o apelido v)
function condNota(t, extra) {
  if (!t.txt) return 'TRUE';
  const p = [`v.fornecedor ILIKE ${t.like}`, `v.fornecedor_pedido ILIKE ${t.like}`].concat(extra || []);
  if (t.num) p.push(`v.numero = ${q(t.num)}`, `v.pedido = ${q(t.num)}`, `v.pedido_dig = ${q(t.num)}`, `v.pedido_xml = ${q(t.num)}`, `v.num_documento = ${q(t.num)}`,
    `v.doc_miro = ${q(t.num)}`, `list_contains(string_split(coalesce(v.coletas, ''), ', '), ${q(t.num)})`);
  if (t.dig.length >= 10) p.push(`v.chave LIKE ${q('%' + t.dig + '%')}`);
  return `(${p.join(' OR ')})`;
}
export const abrirLinha = (x) => { if (x.chave && /^\d{44}$/.test(x.chave)) abrirDetalhe(x.chave); else if (x.pedido) abrirPedido(x.pedido); };

const ETAPAS = {
  pedido: {
    titulo: 'Pedido de compra', ajuda: 'Uma linha por pedido (ME2N ou pedido de alguma nota), na etapa em que está. Os avisos de pedido listam as notas. Clique para abrir.',
    placeholder: 'Pedido, fornecedor, material ou texto do item',
    filtros: [['aguardando_coleta', 'Aguardando faturamento (sem nota)'], ['conformes', 'Conformes ao processo (todas as notas)'], ['andamento', 'Coletados, ainda não lançados'], ['lancados', 'Lançados'], ['fora_me2n', 'Pedido fora da ME2N'],
      ['sem_nota', 'Recebidos pela ME2N, sem nota no VT IN'], ['todos', 'Todos os pedidos'],
      ['aviso_sem', 'Aviso: nota emitida sem pedido'], ['aviso_div', 'Aviso: pedido divergente'], ['aviso_naoinf', 'Aviso: fornecedor não informou o pedido'], ['aviso_todos', 'Aviso: todos os avisos de pedido']],
    sql(f, t) {
      if (f.startsWith('aviso_')) {
        const nivel = { aviso_sem: 3, aviso_div: 2, aviso_naoinf: 1 }[f];
        return `SELECT ${colsEscopo('v')}v.aviso_pedido, v.aviso_pedido_nivel, v.numero, v.fornecedor, v.data_emissao, v.pedido_xml, v.pedido_dig AS pedido_digitado, v.pedido, v.origem_pedido,
              v.etapa_ordem, v.etapa_follow, v.chave
            FROM v_nfe v WHERE ${nivel ? `v.aviso_pedido_nivel = ${nivel}` : 'v.aviso_pedido IS NOT NULL'} AND ${condNota(t)}
            ORDER BY v.aviso_pedido_nivel DESC, v.lancada, v.data_emissao DESC`;
      }
      const c = [{ aguardando_coleta: 'p.etapa_ordem = 2', andamento: 'p.etapa_ordem IN (3, 4)', lancados: 'p.etapa_ordem = 5', fora_me2n: 'NOT p.na_me2n', conformes: 'p.pedido_conforme_processo', sem_nota: 'p.etapa_ordem IS NULL' }[f] || 'TRUE'];
      if (t.txt) c.push(`(p.fornecedor ILIKE ${t.like}${t.num ? ` OR p.pedido = ${q(t.num)}` : ''} OR EXISTS (SELECT 1 FROM t_me2n m WHERE m.pedido = p.pedido AND (m.texto_breve ILIKE ${t.like}${t.num ? ` OR m.material = ${q(t.num)}` : ''})))`);
      return `SELECT p.etapa_ordem, p.etapa_follow AS etapa_pedido, p.dias_na_etapa, p.pedido, p.fornecedor, p.data_pedido, p.categorias, p.notas, p.notas_entregues, p.notas_lancadas,
            CASE p.aviso_pedido_nivel WHEN 3 THEN 'Sem pedido' WHEN 2 THEN 'Pedido divergente' WHEN 1 THEN 'Fornecedor não informou' END AS aviso_pedido, p.aviso_pedido_nivel,
            CASE p.alerta_transporte_nivel WHEN 3 THEN 'Frete do destinatário sem transportadora' WHEN 2 THEN 'Sem transportadora' WHEN 1 THEN 'Transporte próprio' END AS alerta_transporte, p.alerta_transporte_nivel, p.pedido_conforme_processo
          FROM v_pedido_trilha p WHERE ${c.join(' AND ')} ORDER BY p.alerta_transporte_nivel DESC NULLS LAST, p.dias_na_etapa DESC NULLS LAST, p.pedido`;
    }
  },
  coleta: {
    titulo: 'Coleta', ajuda: 'Data da coleta: Della Volpe; sem ela, emissão do CT-e; sem ela, emissão da NF-e. Frete do destinatário sem transportadora aparece em destaque. Prazo: só para coletas da Della Volpe, pelo status de atraso e pela previsão de entrega dela.',
    placeholder: 'Número da NF, pedido, coleta, transportadora ou fornecedor',
    filtros: [['aguardando_entrega', 'Coletadas, aguardando entrega'], ['atrasada_dv', 'Entrega atrasada (prazo da Della Volpe)'], ['conformes', 'Transportadora informada (conforme)'], ['fob_sem', 'Frete do destinatário sem transportadora'], ['sem_transp', 'Sem transportadora'],
      ['alertas', 'Todos os alertas de transporte'], ['proprio', 'Transporte próprio'], ['todas', 'Todas']],
    sql(f, t) {
      const c = [{ aguardando_entrega: 'NOT v.entregue', atrasada_dv: "v.prazo_dv = 'Atrasada'", conformes: 'v.transporte_conforme', fob_sem: 'v.alerta_transporte_nivel = 3', sem_transp: 'v.alerta_transporte_nivel = 2', alertas: 'v.alerta_transporte IS NOT NULL', proprio: 'v.alerta_transporte_nivel = 1' }[f] || 'TRUE'];
      c.push(condNota(t, [`v.transportadora_xml ILIKE ${t.like}`, `v.transportadora_cte ILIKE ${t.like}`]));
      return `SELECT ${colsEscopo('v')}v.situacao_processo, v.alerta_transporte, v.alerta_transporte_nivel, v.prazo_dv, v.dias_atraso_dv, v.numero, v.fornecedor, v.pedido,
            v.data_coleta, v.previsao_entrega, v.origem_coleta, date_diff('day', v.data_coleta, current_date) AS dias_desde_coleta, v.modalidade_frete,
            coalesce(v.transportadora_xml, v.transportadora_cte, CASE WHEN v.coletas IS NOT NULL THEN 'Della Volpe' END) AS transportadora,
            v.coletas, v.data_entrega, v.status_sla, v.situacao_entrega, v.chave
          FROM v_nfe v WHERE ${c.join(' AND ')}
          ORDER BY ${f === 'atrasada_dv' ? 'v.dias_atraso_dv DESC NULLS LAST, ' : ''}v.alerta_transporte_nivel DESC NULLS LAST, v.entregue, v.data_coleta`;
    }
  },
  entregue: {
    titulo: 'Pedido entregue', ajuda: 'Entregue = nota digitalizada ou lançada. A data mostrada é a da digitalização (pasta do dia), a data oficial do recebimento.',
    placeholder: 'Número da NF, chave, pedido ou fornecedor',
    filtros: [['aguardando_lancamento', 'Entregues, aguardando lançamento'], ['conformes', 'Entregues e digitalizadas (conforme)'], ['aguardando_entrega', 'Ainda não entregues'], ['sem_digit', 'Lançadas sem digitalização'], ['todas', 'Todas']],
    sql(f, t) {
      const c = [{ aguardando_lancamento: 'v.entregue AND NOT v.lancada', conformes: 'v.entrega_conforme', aguardando_entrega: 'NOT v.entregue', sem_digit: 'v.lancada AND v.data_digitalizacao IS NULL' }[f] || 'TRUE'];
      c.push(condNota(t));
      return `SELECT ${colsEscopo('v')}v.situacao_processo, v.situacao_entrega, v.numero, v.serie, v.fornecedor, v.pedido, v.data_emissao, v.data_coleta, v.data_digitalizacao, v.origem_data_dig,
            CASE WHEN v.entregue AND NOT v.lancada THEN date_diff('day', coalesce(v.data_digitalizacao, v.data_coleta), current_date) END AS dias_desde_entrega,
            v.data_entrada, v.classificacao_pasta, v.chave
          FROM v_nfe v WHERE ${c.join(' AND ')} ORDER BY dias_desde_entrega DESC NULLS LAST, v.data_coleta`;
    }
  },
  lancado: {
    titulo: 'Pedido lançado', ajuda: 'Lançada = nota com número de documento ou MIRO no VT IN. O pedido só conta como lançado quando todas as notas dele estão lançadas.',
    placeholder: 'Número da NF, nº documento, MIRO, chave, pedido ou fornecedor',
    filtros: [['lancadas', 'Lançadas'], ['conformes', 'Lançadas e conformes ao processo'], ['aguardando', 'Entregues, aguardando lançamento'], ['todas', 'Todas']],
    sql(f, t) {
      const c = [{ lancadas: 'v.lancada', conformes: "v.lancada AND v.situacao_processo = 'Conforme'", aguardando: 'v.entregue AND NOT v.lancada' }[f] || 'TRUE'];
      c.push(condNota(t));
      return `SELECT ${colsEscopo('v')}v.situacao_processo, v.numero, v.fornecedor, v.pedido, v.data_digitalizacao, v.data_entrada, v.data_miro, v.num_documento, v.doc_miro, v.etapa_vtin,
            date_diff('day', v.data_digitalizacao, v.data_miro) AS dias_entrega_lancamento, v.situacao_entrega, v.chave
          FROM v_nfe v WHERE ${c.join(' AND ')} ORDER BY v.data_miro DESC NULLS FIRST, v.data_digitalizacao`;
    }
  }
};

export async function renderEtapa(id) {
  const def = ETAPAS[id];
  const e = st.etapa[id] || (st.etapa[id] = { filtro: def.filtros[0][0], texto: '', pagina: 0 });
  const box = limpar($('aba-' + id));
  { const av = avisoFiltroEscopo(); if (av) box.append(av); }
  const ordem = ['pedido', 'coleta', 'entregue', 'lancado'].indexOf(id) + 1;
  const sel = h('select', { onchange: (ev) => { e.filtro = ev.target.value; e.pagina = 0; renderEtapa(id); } }, def.filtros.map(([v, t]) => h('option', { value: v, text: t })));
  sel.value = e.filtro;
  const entrada = h('input', { type: 'text', value: e.texto, placeholder: def.placeholder, style: 'flex:1;min-width:260px' });
  const ir = () => { e.texto = entrada.value; e.pagina = 0; renderEtapa(id); };
  entrada.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ir(); });
  box.append(h('div', { class: 'card', style: 'margin-bottom:14px' },
    h('div', { class: 'linha', style: 'margin-bottom:6px' }, h('span', { class: 'tag', text: `Etapa ${ordem} de 4` }), h('h2', { text: def.titulo, style: 'margin:0' })),
    h('p', { class: 'sub', text: def.ajuda }),
    h('div', { class: 'linha' }, sel, entrada, h('button', { class: 'btn primario', text: 'Pesquisar', onclick: ir }),
      e.texto ? h('button', { class: 'btn', text: 'Limpar', onclick: () => { e.texto = ''; e.pagina = 0; renderEtapa(id); } }) : null)));
  const esp = blocoCarregando(e.texto ? `Pesquisando "${e.texto}"…` : 'Carregando a lista…', 8);
  box.append(esp);
  try {
    const r = await consulta(def.sql(e.filtro, termo(e.texto)) + ' LIMIT 20000');
    esp.remove();
    const paginas = Math.max(1, Math.ceil(r.linhas.length / POR_PAGINA));
    if (e.pagina >= paginas) e.pagina = paginas - 1;
    const pag = r.linhas.slice(e.pagina * POR_PAGINA, (e.pagina + 1) * POR_PAGINA);
    const rotFiltro = (def.filtros.find(x => x[0] === e.filtro) || [])[1] || '';
    box.append(h('div', { class: 'linha', style: 'margin-bottom:8px' }, h('h2', { text: `${fmtInt(r.linhas.length)} linha(s)` }), h('span', { class: 'muted', text: rotFiltro + (e.texto ? ` · "${e.texto}"` : '') }),
      h('span', { class: 'espaco' }),
      h('button', { class: 'btn', text: 'Exportar Excel', onclick: () => exportarLinhas(r.cols.filter(c => c !== 'etapa_ordem' && !/_nivel$/.test(c)), r.linhas, `${id}_${e.filtro}`) })));
    box.append(tabela(r.cols, pag, { ocultar: ['etapa_ordem'], tipo: 'NF-e', aoClicar: abrirLinha, vazio: 'Nada encontrado com este filtro.' }));
    box.append(h('div', { class: 'paginacao' },
      h('button', { class: 'btn pequeno', text: '‹ Anterior', disabled: e.pagina === 0, onclick: () => { e.pagina--; renderEtapa(id); } }),
      h('span', { text: `Página ${e.pagina + 1} de ${paginas}` }),
      h('button', { class: 'btn pequeno', text: 'Próxima ›', disabled: e.pagina >= paginas - 1, onclick: () => { e.pagina++; renderEtapa(id); } })));
  } catch (err) { esp.remove(); box.append(caixaErro('Erro na lista', err)); }
}
