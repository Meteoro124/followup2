/* Filtro de período (emissão de / até) usado no painel e nas pendências. */
import { h } from './dom.js';
import { st } from './estado.js';
import { q } from '../sql/index.js';

// ------------------------------------------------------------------ PAINEL
export function condPeriodo(col) {
  const c = [];
  if (st.periodo.de) c.push(`${col} >= DATE ${q(st.periodo.de)}`);
  if (st.periodo.ate) c.push(`${col} <= DATE ${q(st.periodo.ate)}`);
  return c.length ? c.join(' AND ') : 'TRUE';
}

export function blocoPeriodo(aoMudar) {
  const de = h('input', { type: 'date', value: st.periodo.de });
  const ate = h('input', { type: 'date', value: st.periodo.ate });
  const aplicar = () => { st.periodo.de = de.value; st.periodo.ate = ate.value; aoMudar(); };
  const preset = (dias) => () => {
    if (dias === null) { st.periodo.de = ''; st.periodo.ate = ''; }
    else { const d = new Date(Date.now() - dias * 86400000); st.periodo.de = d.toISOString().slice(0, 10); st.periodo.ate = ''; }
    aoMudar();
  };
  return h('div', { class: 'linha' },
    h('span', { class: 'muted', text: 'Emissão de' }), de, h('span', { class: 'muted', text: 'até' }), ate,
    h('button', { class: 'btn', text: 'Aplicar', onclick: aplicar }),
    h('button', { class: 'btn pequeno', text: '30 dias', onclick: preset(30) }),
    h('button', { class: 'btn pequeno', text: '90 dias', onclick: preset(90) }),
    h('button', { class: 'btn pequeno', text: 'Tudo', onclick: preset(null) }));
}
