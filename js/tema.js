/* Tema da página: 'auto' segue o sistema; 'claro' e 'escuro' ficam salvos neste navegador.
   As cores de cada tema estão nos tokens do bloco <style> (:root e :root[data-theme="dark"]). */
(function () {
  var CHAVE = 'followup_tema', ORDEM = ['auto', 'claro', 'escuro'], NOMES = { auto: 'automático', claro: 'claro', escuro: 'escuro' };
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var atual = 'auto';
  try { atual = localStorage.getItem(CHAVE) || 'auto'; } catch (e) { /* sem armazenamento: fica no automático */ }
  if (ORDEM.indexOf(atual) < 0) atual = 'auto';
  function aplicar() {
    var escuro = atual === 'escuro' || (atual === 'auto' && !!(media && media.matches));
    document.documentElement.setAttribute('data-theme', escuro ? 'dark' : 'light');
    var b = document.getElementById('btnTema'), r = document.getElementById('btnTemaRot');
    if (r) r.textContent = NOMES[atual];
    if (b) b.title = 'Tema: ' + NOMES[atual] + ' (clique para alternar entre automático, claro e escuro)';
  }
  aplicar();
  if (media && media.addEventListener) media.addEventListener('change', function () { if (atual === 'auto') aplicar(); });
  document.addEventListener('DOMContentLoaded', function () {
    aplicar();
    var b = document.getElementById('btnTema');
    if (b) b.addEventListener('click', function () {
      atual = ORDEM[(ORDEM.indexOf(atual) + 1) % ORDEM.length];
      try { localStorage.setItem(CHAVE, atual); } catch (e) { /* segue sem salvar */ }
      aplicar();
    });
  });
})();
