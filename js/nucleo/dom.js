/* Interface: criação de elementos, avisos, janelas, cópia, download e indicadores de carregamento. */

// ------------------------------------------------------------------ DOM
export const $ = (id) => document.getElementById(id);
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const k of Object.keys(props)) {
    const v = props[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const limpar = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const esperar = (ms) => new Promise(r => setTimeout(r, ms));

export function toast(msg, erro) {
  const t = h('div', { class: 't' + (erro ? ' erro' : ''), text: msg });
  $('toast').append(t);
  setTimeout(() => t.remove(), erro ? 7000 : 3500);
}
export function ocupado(msg) { $('ocupadoMsg').textContent = msg || 'Processando…'; $('ocupado').hidden = false; return esperar(30); }
export function livre() { $('ocupado').hidden = true; }

// ------------------------------------------------------------------ INDICADORES DE CARREGAMENTO
// Barra fina no topo da tela: aparece sozinha enquanto qualquer consulta ao banco estiver rodando.
let cargasAtivas = 0, cargaTimer = null;
export function cargaIni() { if (++cargasAtivas === 1) { clearTimeout(cargaTimer); $('barraCarga').hidden = false; } }
export function cargaFim() { if (cargasAtivas > 0 && --cargasAtivas === 0) { clearTimeout(cargaTimer); cargaTimer = setTimeout(() => { if (!cargasAtivas) $('barraCarga').hidden = true; }, 150); } }
// Ícones (traço simples, cor do texto)
const ICO = {"painel": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/>", "busca": "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m20 20-3.5-3.5\"/>", "relogio": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>", "importar": "<path d=\"M12 15V3m0 0-4 4m4-4 4 4\"/><path d=\"M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4\"/>", "sql": "<ellipse cx=\"12\" cy=\"5\" rx=\"8\" ry=\"3\"/><path d=\"M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5\"/><path d=\"M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3\"/>", "config": "<path d=\"M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1\"/><circle cx=\"15\" cy=\"6\" r=\"2\"/><circle cx=\"9\" cy=\"12\" r=\"2\"/><circle cx=\"17\" cy=\"18\" r=\"2\"/>", "camadas": "<path d=\"m12 3 9 5-9 5-9-5 9-5Z\"/><path d=\"m3 13 9 5 9-5\"/>", "recarregar": "<path d=\"M20 11a8 8 0 1 0-2.3 5.7\"/><path d=\"M20 4v7h-7\"/>", "lua": "<path d=\"M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z\"/>", "alerta": "<path d=\"M12 4 2.5 20h19L12 4Z\"/><path d=\"M12 10v4M12 17.5v.01\"/>", "caminhao": "<path d=\"M3 6h11v10H3zM14 10h4l3 3v3h-7\"/><circle cx=\"7\" cy=\"17.5\" r=\"1.8\"/><circle cx=\"17\" cy=\"17.5\" r=\"1.8\"/>", "check": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m8 12.5 2.5 2.5L16 9.5\"/>", "etiqueta": "<path d=\"M3 12V4h8l10 10-8 8L3 12Z\"/><circle cx=\"7.5\" cy=\"8.5\" r=\"1.3\"/>", "doc": "<path d=\"M6 3h8l4 4v14H6z\"/><path d=\"M14 3v4h4M9 12h6M9 16h6\"/>"};
export function ico(nome) { const sp = h('span', { style: 'display:contents' }); sp.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[nome] || ''}</svg>`; return sp; }
// Esqueleto: blocos cinza animados no lugar do conteúdo que ainda está carregando
export const esq = (cls, estilo) => h('span', { class: 'esq ' + (cls || 't'), style: estilo || null });
export const esqCartao = (linhas, grafico) => [esq('t', 'width:45%'), esq('n'), Array.from({ length: linhas ?? 1 }, (_, i) => esq('t', `width:${78 - i * 14}%`)), grafico ? esq('g') : null];
export const esqTabela = (n) => Array.from({ length: n || 6 }, (_, i) => esq('linha-tab', `opacity:${1 - i * 0.1}`));
export function carregandoLinha(texto) { return h('div', { class: 'carregando-linha', role: 'status' }, h('span', { class: 'spinner pequeno' }), h('span', { class: 'msg', text: texto || 'Carregando…' })); }
export function blocoCarregando(texto, linhas) { return h('div', { class: 'card', 'aria-busy': 'true', style: 'margin-bottom:14px' }, carregandoLinha(texto), esqTabela(linhas || 6)); }
export function slot(classe, esqueleto) { return h('div', { class: classe, 'aria-busy': 'true' }, esqueleto || esqCartao(1)); }
export function encher(el, ...kids) { limpar(el); el.removeAttribute('aria-busy'); el.append(...kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false)); return el; }
// Título de quadro: só o nome; a explicação fica no "i" ao lado (aparece ao passar o mouse). "extra" vai depois do "i" (ex.: contagem).
export function titulo(texto, ajuda, extra) {
  return h('div', { class: 'titulo-cartao' }, h('h3', { text: texto }),
    ajuda ? h('span', { class: 'ajuda', role: 'img', title: ajuda, 'aria-label': 'Sobre este quadro: ' + ajuda, text: 'i' }) : null, extra || null);
}
export function clicavel(el, fn, titulo) {
  if (!fn) return el;
  el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); if (titulo) el.title = titulo;
  el.addEventListener('click', fn); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  return el;
}
// Botão com rodinha enquanto a ação roda
export async function comCarga(btn, fn) {
  if (btn) { btn.classList.add('carregando'); btn.disabled = true; }
  try { return await fn(); } finally { if (btn) { btn.classList.remove('carregando'); btn.disabled = false; } }
}

export function abrirModal(conteudo, pequeno) {
  const box = limpar($('modalBox'));
  box.className = 'modal-box' + (pequeno ? ' pequeno' : '');
  box.append(conteudo);
  $('modal').hidden = false;
}
export function fecharModal() { $('modal').hidden = true; limpar($('modalBox')); }

export function confirmar(titulo, texto, rotuloOk) {
  return new Promise(res => {
    abrirModal(h('div', { class: 'stack' },
      h('h2', { text: titulo }), h('p', { class: 'sub', text: texto }),
      h('div', { class: 'linha' }, h('span', { class: 'espaco' }),
        h('button', { class: 'btn', text: 'Cancelar', onclick: () => { fecharModal(); res(false); } }),
        h('button', { class: 'btn primario', text: rotuloOk || 'Confirmar', onclick: () => { fecharModal(); res(true); } }))), true);
  });
}

export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast('Copiado.'); return; } catch (e) { /* segue */ }
  const ta = h('textarea', { style: 'position:fixed;left:-9999px' }); ta.value = texto; document.body.append(ta); ta.select();
  try { document.execCommand('copy'); toast('Copiado.'); } catch (e) { toast('Não foi possível copiar.', true); }
  ta.remove();
}

export function baixar(nome, conteudo, tipo) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nome }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
