/* Aba Importar dados: leitura dos arquivos, mapeamento das colunas, lotes e dados fictícios. */
import { atualizarStatus, mostrarAba } from '../app.js';
import { L } from '../logica/index.js';
import { adicionarContato, atualizarContadores, removerContato } from '../nucleo/acompanhamento.js';
import { consulta, exec, idbApagar, idbGravar, idbTodos, inserirCSV, materializar, recriarViews } from '../nucleo/banco.js';
import { $, abrirModal, baixar, blocoCarregando, confirmar, copiar, esperar, fecharModal, h, limpar, livre, ocupado, toast } from '../nucleo/dom.js';
import { st } from '../nucleo/estado.js';
import { caixaErro, fmtInt, hojeISO } from '../nucleo/formato.js';
import { q, S } from '../sql/index.js';

// ------------------------------------------------------------------ IMPORTAÇÃO
const PS_LISTA = 'Get-ChildItem -Path "C:\\CAMINHO\\Notas Digitalizadas" -Recurse -File |\n  Select-Object FullName, Name, LastWriteTime |\n  Export-Csv -Path "$env:USERPROFILE\\Desktop\\lista_digitalizadas.csv" -NoTypeInformation -Encoding UTF8';

export async function renderImportar() {
  const box = limpar($('aba-importar'));
  let contagens = {};
  const esp = blocoCarregando('Contando as linhas de cada fonte…', 4);
  box.append(esp);
  try {
    const r = await consulta(L.FONTES.map(f => `SELECT ${q(f.id)} AS f, count(*)::INTEGER AS n FROM s_${f.id}`).join(' UNION ALL '));
    r.linhas.forEach(x => { contagens[x.f] = x.n; });
  } catch (e) { box.append(caixaErro('Erro ao contar as linhas', e)); }
  esp.remove();
  const temDemo = st.lotes.some(l => l.demo);
  const ult = st.lotes[st.lotes.length - 1];
  // Cartão verde "Base de dados" (veio da página inicial): quantas importações estão guardadas e a última
  box.append(h('div', { class: 'cartao-cta linha', style: 'margin-bottom:16px;gap:16px 24px;align-items:center' },
    h('div', { style: 'flex:1;min-width:280px' },
      h('span', { class: 'selo' }, h('i'), 'Base de dados'),
      h('div', { class: 'grande', text: fmtInt(st.lotes.length) }),
      h('p', { text: `importação(ões) guardadas neste navegador${ult ? ' · última em ' + new Date(ult.importado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''}.` }),
      h('p', { text: 'Aceita .xlsx, .xls, .csv e .txt (inclusive o "xls" em texto do SAP). Cada arquivo vira um lote com data e hora; para cada chave vale o lote mais recente. Os arquivos não saem deste computador.' })),
    h('div', { class: 'linha' },
      h('button', { class: 'btn-lima', text: 'Carregar dados fictícios', onclick: carregarDemo }),
      temDemo ? h('button', { class: 'btn-contorno', text: 'Remover dados fictícios', onclick: removerDemo }) : null)));

  const grade = h('div', { class: 'fontes-card' });
  box.append(grade);
  for (const f of L.FONTES) {
    const lotes = st.lotes.filter(l => l.fonte === f.id);
    const ultimo = lotes[lotes.length - 1];
    const input = f.xml
      ? h('input', { type: 'file', accept: '.xml', multiple: true, onchange: (e) => { const arqs = Array.from(e.target.files); e.target.value = ''; if (arqs.length) prepararImportacaoXml(f, arqs); } })
      : h('input', { type: 'file', accept: '.xlsx,.xls,.xlsm,.csv,.txt', onchange: (e) => { const arq = e.target.files[0]; e.target.value = ''; if (arq) prepararImportacao(f, arq); } });
    grade.append(h('div', { class: 'card fonte' },
      h('h3', { text: f.nome }), h('p', { class: 'sub', style: 'margin:0', text: f.descricao }),
      h('div', { class: 'cont' }, h('span', null, h('b', { text: fmtInt(contagens[f.id] || 0) }), ' linhas vigentes'), h('span', null, h('b', { text: String(lotes.length) }), ' lote(s)'),
        ultimo ? h('span', { text: 'último: ' + new Date(ultimo.importado_em).toLocaleString('pt-BR') }) : null),
      f.id === 'pasta' ? h('div', { style: 'margin-bottom:10px' }, h('p', { class: 'sub', style: 'margin:0 0 4px', text: 'Gere a listagem no computador da empresa (PowerShell), troque o caminho e importe o CSV:' }),
        h('div', { class: 'ps mono', text: PS_LISTA }), h('button', { class: 'btn pequeno', style: 'margin-top:4px', text: 'Copiar comando', onclick: () => copiar(PS_LISTA) })) : null,
      h('div', { class: 'linha' }, h('label', { class: 'btn primario' }, f.xml ? 'Escolher arquivos XML…' : 'Escolher arquivo…', input),
        // XML: também dá para escolher uma pasta inteira (com subpastas); só os .xml são lidos
        f.xml ? h('label', { class: 'btn' }, 'Escolher pasta…', h('input', { type: 'file', webkitdirectory: true, directory: true, multiple: true,
          onchange: (e) => { const arqs = Array.from(e.target.files); e.target.value = ''; if (arqs.length) prepararImportacaoXml(f, arqs); } })) : null,
        f.xml ? null : h('button', { class: 'btn pequeno', text: 'Baixar exemplo fictício', onclick: () => baixarExemplo(f) }))));
  }

  const hist = st.lotes.slice().reverse();
  box.append(h('div', { class: 'card', style: 'margin-top:16px' }, h('h3', { text: 'Histórico de importações' }),
    h('p', { class: 'sub', text: 'Remover um lote desfaz aquela importação; a versão anterior de cada chave volta a valer.' }),
    (() => {
      const t = h('table', { class: 'tabela' }, h('thead', null, h('tr', null, ['Fonte', 'Arquivo', 'Importado em', 'Linhas', 'Descartadas', ''].map((x, i) => h('th', { class: i === 3 || i === 4 ? 'num' : null, text: x })))));
      const tb = h('tbody');
      hist.forEach(l => tb.append(h('tr', null, h('td', { text: (L.fonte(l.fonte) || {}).nome || l.fonte }), h('td', { text: l.arquivo + (l.demo ? ' (fictício)' : '') }),
        h('td', { class: 'nowrap', text: new Date(l.importado_em).toLocaleString('pt-BR') }), h('td', { class: 'num', text: fmtInt(l.linhas) }),
        h('td', { class: 'num', text: fmtInt(l.descartadas || 0) }), h('td', null, h('button', { class: 'btn pequeno perigo', text: 'Remover', onclick: () => removerLote(l) })))));
      if (!hist.length) tb.append(h('tr', null, h('td', { colspan: 6, class: 'muted', text: 'Nenhuma importação ainda.' })));
      t.append(tb);
      return h('div', { class: 'tabela-wrap', style: 'max-height:360px' }, t);
    })()));
}

async function lerArquivo(arquivo) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (L.looksLikeText(bytes)) {
    const { aoa, delim } = L.parseDelimited(L.decodeBytes(bytes));
    const nomeDelim = { '\t': 'tabulação', ';': 'ponto e vírgula', ',': 'vírgula', '|': 'barra vertical' }[delim];
    return [{ nome: `texto (separador: ${nomeDelim})`, aoa, inicio: 0 }];
  }
  if (!window.XLSX) throw new Error('A biblioteca de leitura de Excel (SheetJS) não carregou. Verifique o acesso a cdn.sheetjs.com ou salve o arquivo como CSV.');
  const wb = XLSX.read(bytes, { type: 'array', dense: true });
  return wb.SheetNames.map(n => {
    const ws = wb.Sheets[n];
    const ref = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0 } };
    return { nome: n, aoa: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }), inicio: ref.s.r };
  });
}

function melhorAba(abas, f) {
  let melhor = 0, nota = -1;
  abas.forEach((a, i) => { const hr = L.detectHeaderRow(a.aoa, f); const n = L.autoMap(L.dedupeHeaders(a.aoa[hr] || []), f); const sc = Object.values(n).filter(x => x >= 0).length; if (sc > nota) { nota = sc; melhor = i; } });
  return melhor;
}

// Vários XML viram uma "planilha" (uma linha por arquivo) e seguem o mesmo caminho das outras fontes.
// Para não travar com milhares de arquivos: lê em blocos, interpreta cada XML na hora e descarta o texto
// (só a linha extraída fica na memória), e devolve o controle à tela a cada ~50 ms para mostrar o progresso.
const XML_BLOCO = 16;
async function prepararImportacaoXml(f, arquivos) {
  const todosArq = Array.from(arquivos);
  const lista = todosArq.filter(a => /\.xml$/i.test(a.name));
  const ignorados = todosArq.length - lista.length;
  if (!lista.length) { toast('Nenhum arquivo .xml entre os escolhidos.', true); return; }
  await ocupado(`Lendo ${fmtInt(lista.length)} arquivo(s) XML…`);
  const aoa = [L.XML_COLS.map(c => c[1])];
  const comErro = [];
  const t0 = performance.now();
  let pausa = performance.now();
  for (let i = 0; i < lista.length; i += XML_BLOCO) {
    const bloco = lista.slice(i, i + XML_BLOCO);
    const textos = await Promise.all(bloco.map(a => a.arrayBuffer().then(b => L.decodeBytes(new Uint8Array(b)), () => null)));
    for (let k = 0; k < bloco.length; k++) {
      if (textos[k] === null) { comErro.push(bloco[k].name); continue; }
      try { aoa.push(L.linhaXml(textos[k], bloco[k].name)); } catch (e) { comErro.push(bloco[k].name); }
      textos[k] = null; // libera o texto do arquivo
    }
    if (performance.now() - pausa > 50) {
      const feitos = Math.min(i + XML_BLOCO, lista.length);
      const resta = Math.round((performance.now() - t0) / feitos * (lista.length - feitos) / 1000);
      $('ocupadoMsg').textContent = `Lendo XML ${fmtInt(feitos)} de ${fmtInt(lista.length)}…${resta > 2 ? ` (faltam cerca de ${resta} s)` : ''}`;
      await esperar(0);
      pausa = performance.now();
    }
  }
  livre();
  if (comErro.length) toast(`${fmtInt(comErro.length)} arquivo(s) não puderam ser lidos: ${comErro.slice(0, 3).join(', ')}${comErro.length > 3 ? '…' : ''}`, true);
  if (ignorados) toast(`${fmtInt(ignorados)} arquivo(s) que não são .xml foram ignorados.`);
  if (aoa.length === 1) { toast('Nenhum XML pôde ser lido.', true); return; }
  const lidos = aoa.length - 1;
  const nome = lista.length === 1 ? lista[0].name : `${fmtInt(lidos)} arquivos XML${comErro.length ? ` (${fmtInt(comErro.length)} com erro de leitura)` : ''}`;
  prepararImportacao(f, { name: nome }, [{ nome: 'XML', aoa, inicio: 0 }]);
}

async function prepararImportacao(f, arquivo, abasProntas) {
  let abas = abasProntas;
  if (!abas) {
    await ocupado(`Lendo ${arquivo.name}…`);
    try { abas = await lerArquivo(arquivo); } catch (e) { livre(); toast('Erro ao ler o arquivo: ' + e.message, true); return; }
    livre();
  }
  const estado = { aba: melhorAba(abas, f) };
  const corpo = h('div');
  const desenhar = (linhaCab) => {
    limpar(corpo);
    const aba = abas[estado.aba];
    const hr = linhaCab !== undefined ? linhaCab : L.detectHeaderRow(aba.aoa, f);
    const headers = L.dedupeHeaders(aba.aoa[hr] || []);
    const mapa = L.autoMap(headers, f);
    const linhasDados = aba.aoa.length - hr - 1;
    const seletores = {};
    const selAba = abas.length > 1 ? h('select', { onchange: (e) => { estado.aba = Number(e.target.value); desenhar(); } }, abas.map((a, i) => h('option', { value: String(i), text: a.nome }))) : null;
    if (selAba) selAba.value = String(estado.aba);
    const inpCab = h('input', { type: 'number', min: '1', value: String(hr + 1 + aba.inicio), style: 'width:80px', onchange: (e) => desenhar(Math.max(0, Number(e.target.value) - 1 - aba.inicio)) });
    const btnImportar = h('button', { class: 'btn primario', text: 'Importar', onclick: () => confirmarImportacao() });
    const atualizarBotao = () => { btnImportar.disabled = f.campos.some(c => c.obrigatorio && Number(seletores[c.id].value) < 0); };
    const tb = h('tbody');
    for (const c of f.campos) {
      const s = h('select', { onchange: () => { exemplo(c, s); atualizarBotao(); } }, h('option', { value: '-1', text: '— não usar —' }), headers.map((t, i) => h('option', { value: String(i), text: `${L.colLetter(i)} · ${t}` })));
      s.value = String(mapa[c.id]);
      seletores[c.id] = s;
      const ex = h('td', { class: 'muted', style: 'font-size:12px' });
      const exemplo = (campo, sel) => { ex.textContent = L.amostra(aba.aoa, hr, Number(sel.value), 3).join('  ·  ') || '—'; };
      exemplo(c, s);
      tb.append(h('tr', null, h('td', null, c.rotulo, c.obrigatorio ? h('span', { class: 'obrig', text: ' *' }) : null), h('td', null, s), ex));
    }
    atualizarBotao();
    const resultado = h('div');
    const confirmarImportacao = async () => {
      const m = {}; f.campos.forEach(c => { m[c.id] = Number(seletores[c.id].value); });
      await ocupado('Convertendo e gravando…');
      try {
        const r = await importarLote(f, aba, hr, m, arquivo.name, false);
        await ocupado('Montando o modelo…'); await materializar();
        livre();
        limpar(corpo);
        corpo.append(h('h2', { text: 'Importação concluída' }), resumoImportacao(r),
          h('div', { class: 'linha', style: 'margin-top:14px' }, h('span', { class: 'espaco' }), h('button', { class: 'btn primario', text: 'Fechar', onclick: () => { fecharModal(); renderImportar(); } })));
      } catch (e) { livre(); limpar(resultado); resultado.append(caixaErro('Erro na importação', e)); }
    };
    corpo.append(
      h('h2', { text: `Importar: ${f.nome}` }),
      h('p', { class: 'sub', text: `${arquivo.name} · ${fmtInt(linhasDados)} linha(s) abaixo do cabeçalho` }),
      h('div', { class: 'linha', style: 'margin-bottom:10px' }, selAba ? [h('span', { class: 'muted', text: 'Aba:' }), selAba] : null,
        h('span', { class: 'muted', text: 'Linha do cabeçalho:' }), inpCab, h('span', { class: 'muted', style: 'font-size:12px', text: '(detectada pelos nomes das colunas)' })),
      h('div', { class: 'aviso info', style: 'margin-bottom:10px', text: 'Confira a coluna de cada campo pelos exemplos. Campos com * são obrigatórios; os demais podem ficar sem coluna.' }),
      h('div', { class: 'tabela-wrap map-tab', style: 'max-height:420px' }, h('table', { class: 'tabela' }, h('thead', null, h('tr', null, h('th', { text: 'Campo' }), h('th', { text: 'Coluna do arquivo' }), h('th', { text: 'Exemplos' }))), tb)),
      resultado,
      h('div', { class: 'linha', style: 'margin-top:14px' }, h('span', { class: 'espaco' }), h('button', { class: 'btn', text: 'Cancelar', onclick: fecharModal }), btnImportar));
  };
  desenhar();
  abrirModal(corpo);
}

function resumoImportacao(r) {
  const itens = [h('li', { text: `${fmtInt(r.lidas)} linha(s) lida(s), ${fmtInt(r.rows.length)} importada(s).` })];
  Object.entries(r.descartes).forEach(([k, n]) => itens.push(h('li', { text: `${fmtInt(n)} descartada(s): ${k}.` })));
  Object.entries(r.avisos).forEach(([k, n]) => itens.push(h('li', { text: `${fmtInt(n)} aviso(s) — ${k}.` })));
  return h('ul', { style: 'margin:6px 0 0;padding-left:20px' }, itens);
}

async function importarLote(f, aba, hr, mapa, nomeArquivo, demo) {
  const r = L.converter(aba.aoa, hr, mapa, f);
  if (!r.rows.length) throw new Error('Nenhuma linha válida. Confira a linha do cabeçalho e a coluna dos campos obrigatórios.');
  const agora = new Date();
  const id = `${f.id}-${agora.getTime()}-${Math.floor(Math.random() * 1000)}`;
  const importado = agora.toISOString();
  r.rows.forEach(x => { x._lote = id; x._importado_em = importado; x._arquivo = nomeArquivo; x._linha = String(Number(x._linha) + (aba.inicio || 0)); });
  const csv = L.toCSV(f.colunas.concat(L.META_COLS), r.rows);
  await inserirCSV(f.tabela, csv);
  const lote = { id, fonte: f.id, arquivo: nomeArquivo, importado_em: importado, linhas: r.rows.length, descartadas: Object.values(r.descartes).reduce((a, b) => a + b, 0), demo: !!demo, csv };
  try { await idbGravar('lotes', lote); } catch (e) { toast('Importado, mas não foi possível gravar no navegador (a importação some ao fechar): ' + e.message, true); }
  st.lotes.push(lote);
  atualizarStatus();
  return r;
}

async function removerLote(l) {
  if (!(await confirmar('Remover este lote?', `${l.arquivo} (${fmtInt(l.linhas)} linhas). A versão anterior de cada chave volta a valer.`, 'Remover'))) return;
  const f = L.fonte(l.fonte);
  await exec(`DELETE FROM ${f.tabela} WHERE _lote = ${q(l.id)}`);
  await idbApagar('lotes', l.id);
  st.lotes = st.lotes.filter(x => x.id !== l.id);
  await ocupado('Montando o modelo…'); if (l.demo) await remontarModelo(); else await materializar(); livre();
  renderImportar();
}

// Quando os dados fictícios entram ou saem, as regras "Fora do escopo" fictícias também entram ou saem: o modelo inteiro é refeito.
async function remontarModelo() { await recriarViews(); atualizarStatus(); atualizarContadores(); }

export async function carregarDemo() {
  if (st.lotes.some(l => l.demo) && !(await confirmar('Dados fictícios já carregados', 'Carregar outra vez vai criar novos lotes fictícios por cima dos atuais.', 'Carregar'))) return;
  await ocupado('Gerando e importando os dados fictícios…');
  try {
    const demo = L.gerarDemo(hojeISO(), 3001);
    for (const f of L.FONTES) {
      const aoa = demo[f.id];
      const hr = L.detectHeaderRow(aoa, f);
      await importarLote(f, { aoa, inicio: 0 }, hr, L.autoMap(L.dedupeHeaders(aoa[hr]), f), 'DADOS FICTÍCIOS', true);
      await esperar(10);
    }
    for (const a of demo.manual.acomp) {
      const reg = Object.assign({}, a, { demo: true });
      await exec(`DELETE FROM acomp WHERE chave = ${q(a.chave)}`);
      await exec(`INSERT INTO acomp (${S.ACOMP_COLS.join(', ')}) VALUES (${S.ACOMP_COLS.map(c => S.sqlVal(reg[c])).join(', ')})`);
      st.acomp.set(a.chave, reg);
      await idbGravar('acomp', reg);
    }
    for (const c of demo.manual.contatos) await adicionarContato(c.chave, c.data, c.quem, c.texto, true);
    await ocupado('Montando o modelo…');
    await remontarModelo();
    livre();
    toast('Dados fictícios carregados.');
    mostrarAba('painel');
  } catch (e) { livre(); toast('Erro ao carregar os dados fictícios: ' + e.message, true); console.error(e); }
}

async function removerDemo() {
  if (!(await confirmar('Remover os dados fictícios?', 'Os lotes reais continuam.', 'Remover'))) return;
  await ocupado('Removendo…');
  for (const l of st.lotes.filter(x => x.demo)) {
    await exec(`DELETE FROM ${L.fonte(l.fonte).tabela} WHERE _lote = ${q(l.id)}`);
    await idbApagar('lotes', l.id);
  }
  st.lotes = st.lotes.filter(x => !x.demo);
  for (const [chave, a] of Array.from(st.acomp.entries())) {
    if (!a.demo) continue;
    await exec(`DELETE FROM acomp WHERE chave = ${q(chave)}`);
    await idbApagar('acomp', chave);
    st.acomp.delete(chave);
  }
  for (const c of (await idbTodos('contatos')).filter(x => x.demo)) await removerContato(c.id);
  await remontarModelo();
  livre(); atualizarStatus(); renderImportar();
}

function baixarExemplo(f) {
  const aoa = L.gerarDemo(hojeISO(), 3001)[f.id];
  if (window.XLSX) {
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Planilha1');
    XLSX.writeFile(wb, `exemplo_ficticio_${f.id}.xlsx`);
  } else {
    baixar(`exemplo_ficticio_${f.id}.csv`, '\uFEFF' + aoa.map(r => r.map(c => c === null || c === undefined ? '' : String(c).replace(/;/g, ',')).join(';')).join('\r\n'), 'text/csv');
  }
}
