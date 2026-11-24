/* Gerador de dados fictícios (para avaliar a página e para o autoteste). */
import { linhaXml, XML_COLS } from './arquivos.js';
import { dvChave, isoToSerial } from './basico.js';

// ---------------------------------------------------------------- gerador de dados fictícios
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gerarDemo(hojeISO, seed) {
  const R = rng(seed || 3001);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const chance = (p) => R() < p;
  const hoje = Date.UTC(+hojeISO.slice(0, 4), +hojeISO.slice(5, 7) - 1, +hojeISO.slice(8, 10));
  const DIA = 86400000;
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const add = (isoD, n) => iso(Date.UTC(+isoD.slice(0, 4), +isoD.slice(5, 7) - 1, +isoD.slice(8, 10)) + n * DIA);
  const futuro = (isoD) => isoD > hojeISO;
  const br = (isoD) => `${isoD.slice(8, 10)}/${isoD.slice(5, 7)}/${isoD.slice(0, 4)}`;
  const ponto = (isoD) => `${isoD.slice(8, 10)}.${isoD.slice(5, 7)}.${isoD.slice(0, 4)}`;
  const compacta = (isoD) => isoD.replace(/-/g, '');
  const MESES = ['01 - Janeiro', '02 - Fevereiro', '03 - Março', '04 - Abril', '05 - Maio', '06 - Junho', '07 - Julho', '08 - Agosto', '09 - Setembro', '10 - Outubro', '11 - Novembro', '12 - Dezembro'];

  function montarChave(aamm, cnpj, modelo, serie, numero) {
    const base = '51' + aamm + cnpj + modelo + String(serie).padStart(3, '0') + String(numero).padStart(9, '0') + '1' + String(ri(10000000, 99999999));
    return base + dvChave(base);
  }
  const cnpjFake = () => String(ri(10, 99)) + String(ri(100000, 999999)) + '0001' + String(ri(10, 99));

  const fornecedores = [];
  for (let i = 1; i <= 40; i++) {
    fornecedores.push({
      nome: `FORNECEDOR FICTÍCIO ${String(i).padStart(2, '0')} LTDA`, cnpj: cnpjFake(), cod: String(100000 + i),
      seq: ri(1000, 90000), serie: chance(0.8) ? 1 : ri(2, 5),
      perfil: i <= 14 ? '' : (i <= 28 ? 'K' : (i <= 36 ? 'F' : 'U'))
    });
  }
  // dois fornecedores com numeração igual, para gerar número+série repetidos
  fornecedores[5].seq = fornecedores[6].seq; fornecedores[5].serie = fornecedores[6].serie = 1;
  const transportadoras = [
    { nome: 'TRANSPORTADORA FICTÍCIA DV LTDA', cnpj: cnpjFake(), seq: 50000, dv: true },
    { nome: 'TRANSPORTADORA FICTÍCIA BETA LTDA', cnpj: cnpjFake(), seq: 12000 },
    { nome: 'TRANSPORTADORA FICTÍCIA GAMA LTDA', cnpj: cnpjFake(), seq: 7000 }
  ];
  const materiais = ['PARAFUSO SEXTAVADO M12', 'ROLAMENTO 6205 2RS', 'CORREIA DENTADA HTD', 'OLEO HIDRAULICO 68 BALDE 20L', 'LUVA NITRILICA PAR', 'FILTRO DE AR INDUSTRIAL', 'VALVULA ESFERA 2 POL', 'SERVICO DE MANUTENCAO MECANICA', 'ENZIMA ALFA-AMILASE IBC', 'ACIDO SULFURICO 98% TAMBOR', 'CABO ELETRICO 10MM2 ROLO', 'DISJUNTOR TRIPOLAR 40A', 'GAXETA GRAFITADA 1/2', 'TELA FILTRANTE INOX'];
  const grupos = ['C01 - ALMOXARIFADO', 'C02 - MANUTENCAO', 'C04 - LOGISTICA', 'C05 - CAPEX'];

  const vtin = [], mb51 = [], me2n = [], me5a = [], digit = [], pasta = [], dvRows = [];
  let pedSeq = 4501300000, rcSeq = 10450000, docSeq = 4904900000, coletaSeq = 880000, docnumSeq = 7100000, miroSeq = 5106000000;
  const inicio = iso(hoje - 100 * DIA);
  const CORTE_NOVO_PADRAO = add(hojeISO, -13);

  const nfes = [];
  const NNF = 420;
  for (let i = 0; i < NNF; i++) {
    const f = (i % 37 === 3) ? fornecedores[5] : (i % 37 === 4 ? fornecedores[6] : pick(fornecedores));
    const numero = f.seq++;
    const dPedido = add(inicio, ri(0, 92));
    const pedido = String(pedSeq++);
    const categoria = chance(0.06) ? pick(['', 'K', 'F', 'U']) : f.perfil;
    const nItens = ri(1, 3);
    const itens = [];
    for (let k = 1; k <= nItens; k++) itens.push({ item: String(k * 10), material: String(ri(1000000, 1009999)), texto: pick(materiais), qtd: ri(1, 40), preco: ri(20, 3000) });
    const temRc = chance(0.7);
    const rc = temRc ? String(rcSeq++) : '';
    const dRc = temRc ? add(dPedido, -ri(1, 18)) : null;
    const viaDV = chance(0.35);
    let dCriacaoColeta = null, dColeta = null, dEntrega = null, dPrev = null;
    let dEmissao;
    if (viaDV) {
      dCriacaoColeta = add(dPedido, ri(1, 6)); dColeta = add(dCriacaoColeta, ri(0, 4));
      dEmissao = add(dColeta, -ri(0, 1)); dPrev = add(dColeta, 5); dEntrega = add(dColeta, ri(2, 9));
    } else dEmissao = add(dPedido, ri(2, 20));
    if (futuro(dEmissao) || (dColeta && futuro(dColeta))) continue;
    const chegada = dEntrega || add(dEmissao, ri(2, 8));
    let dDigit = futuro(chegada) ? null : add(chegada, ri(0, 3));
    if (dDigit && futuro(dDigit)) dDigit = null;
    if (dDigit && chance(0.08)) dDigit = null;
    let dEntrada = dDigit && chance(0.9) ? add(dDigit, ri(0, 4)) : null;
    if (dEntrada && futuro(dEntrada)) dEntrada = null;
    let dLanc = dEntrada && chance(0.8) ? add(dEntrada, ri(0, 9)) : null;
    if (dLanc && futuro(dLanc)) dLanc = null;
    if (!dEntrada && dDigit && chance(0.04)) dLanc = add(dDigit, ri(1, 5)); // lançada sem entrada 101
    if (dLanc && futuro(dLanc)) dLanc = null;
    // XML: onde o fornecedor informou o pedido, modalidade do frete e transportadora
    const rp = R();
    const pedXml = rp < 0.55 ? 'item' : (rp < 0.65 ? 'compra' : (rp < 0.75 ? 'obs' : (rp < 0.93 ? '' : 'divergente')));
    const semPedido = pedXml === '' && !viaDV && chance(0.45); // nenhuma fonte traz o pedido: nota recém-emitida, ainda não chegou
    if (semPedido) { dDigit = null; dEntrada = null; dLanc = null; }
    let modFrete = '1', transp = transportadoras[0];
    if (!viaDV) {
      const rf = R();
      transp = null;
      if (rf < 0.06) modFrete = '1';                     // frete do destinatário sem transportadora (destaque máximo)
      else if (rf < 0.11) modFrete = '0';                // sem transportadora
      else if (rf < 0.19) modFrete = pick(['3', '4']);   // transporte próprio
      else if (rf < 0.21) modFrete = '9';                // sem transporte
      else { modFrete = pick(['0', '0', '1', '2']); transp = pick(transportadoras.slice(1)); }
    }
    const semCompra = chance(0.03); // remessa (CFOP x.9xx): não precisa de pedido
    const temXml = chance(0.9);
    const chave = montarChave(dEmissao.slice(2, 4) + dEmissao.slice(5, 7), f.cnpj, '55', f.serie, numero);
    const valor = itens.reduce((s, it) => s + it.qtd * it.preco, 0);
    nfes.push({ f, numero, chave, pedido, categoria, itens, rc, dRc, dPedido, viaDV, dCriacaoColeta, dColeta, dEntrega, dPrev, dEmissao, dDigit, dEntrada, dLanc, valor, pedXml, semPedido, modFrete, transp, semCompra, temXml });
  }

  // ---- Entregas parciais: alguns pedidos com 2 notas do mesmo fornecedor (a 2ª nota leva outros itens do mesmo pedido).
  // Sem sorteio novo: só troca o pedido, a data do pedido e a numeração dos itens da 2ª nota (o resto da demo não muda).
  {
    const ultimaPorFornecedor = new Map();
    let pares = 0;
    for (const b of nfes) {
      if (pares >= 8) break;
      const a = ultimaPorFornecedor.get(b.f);
      if (a && a.categoria === b.categoria && !a.semPedido && !b.semPedido && b.dPedido >= a.dPedido && b.dPedido <= add(a.dPedido, 30)) {
        b.pedido = a.pedido; b.dPedido = a.dPedido;
        b.itens.forEach((it, k) => { it.item = String((a.itens.length + k + 1) * 10); });
        ultimaPorFornecedor.delete(b.f);
        pares++;
      } else ultimaPorFornecedor.set(b.f, b);
    }
  }

  // ---- VT IN
  const hVtin = ['Status', 'Status manifestação', 'Etapa atual', 'Nº documento', 'Id - Chave de acesso', 'Nome 1', 'CNPJ emitente', 'Data documento', 'Valor total', 'Data 1ª Fat.', 'Doc. material', 'Data lançamento', 'Doc. fatura', 'Data lançamento', 'Pedido', 'Centro', 'Natureza da operação', 'Status SEFAZ'];
  vtin.push(hVtin);
  // Sorteios das situações novas (cancelada, backlog, acompanhamento) com outra semente, para não mudar o resto da demo
  const R2 = rng(77), chance2 = (p) => R2() < p;
  for (const n of nfes) {
    const lanc = !!n.dLanc;
    const etapa = lanc ? '' : (chance(0.3) ? 'DP - Determinação do Processo' : '');
    let manif = pick(['5', '5', '5', '1', '0']), sefaz = '100 - Autorizado o uso da NF-e';
    if (!lanc && chance2(0.04)) { sefaz = '101 - Cancelamento de NF-e homologado'; n.cancelada = true; }
    else if (!lanc && chance2(0.02)) { manif = '03'; n.cancelada = true; }
    vtin.push([lanc ? '@08@' : '@09@', manif, etapa, lanc ? String(docnumSeq++) : '0', n.chave, n.f.nome, n.f.cnpj,
      isoToSerial(n.dEmissao), n.valor, '693595-', '', '', lanc ? String(miroSeq++) : '', lanc ? isoToSerial(n.dLanc) : '', !n.semPedido && chance(0.1) ? n.pedido : '', '3001',
      'Compra para industrialização', sefaz]);
  }
  // Backlog de 2025 (antes da data de corte): pendências antigas que saem da lista diária
  const backlog = [];
  for (let i = 0; i < 16; i++) {
    const f = fornecedores[i % fornecedores.length], dE = `2025-${String(9 + (i % 4)).padStart(2, '0')}-${String(3 + i).padStart(2, '0')}`;
    const lanc = i % 4 === 0, chave = montarChave(dE.slice(2, 4) + dE.slice(5, 7), f.cnpj, '55', f.serie, f.seq++);
    if (!lanc) backlog.push(chave);
    vtin.push([lanc ? '@08@' : '@09@', '5', '', lanc ? String(docnumSeq++) : '0', chave, f.nome, f.cnpj, isoToSerial(dE), ri(200, 8000) + 0.5, '693595-', '', '',
      lanc ? String(miroSeq++) : '', lanc ? isoToSerial(add(dE, 20)) : '', '', '3001', 'Compra para industrialização', '100 - Autorizado o uso da NF-e']);
  }
  // NF-e de transportadoras sem relatório: parte delas ganha um CT-e emitido logo após a NF-e (a data da coleta vem dele)
  const filaTransp = new Map();
  for (const n of nfes) if (n.transp && !n.viaDV) { if (!filaTransp.has(n.transp.nome)) filaTransp.set(n.transp.nome, []); filaTransp.get(n.transp.nome).push(n); }
  const ctes = [];
  for (let i = 0; i < 260; i++) {
    const t = i % 5 === 0 ? transportadoras[0] : pick(transportadoras.slice(1));
    const numero = t.seq++;
    let dEmissao = add(inicio, ri(0, 99));
    const nfesCte = [];
    const fila = filaTransp.get(t.nome);
    if (!t.dv && fila && fila.length && chance(0.7)) {
      const n = fila.shift(), d = add(n.dEmissao, ri(0, 1));
      if (!futuro(d)) { dEmissao = d; nfesCte.push(n.chave); }
    }
    const chave = montarChave(dEmissao.slice(2, 4) + dEmissao.slice(5, 7), t.cnpj, '57', 1, numero);
    const r = R();
    const idade = (hoje - Date.UTC(+dEmissao.slice(0, 4), +dEmissao.slice(5, 7) - 1, +dEmissao.slice(8, 10))) / DIA;
    let etapa, docnum = '0', miro = '', dMiro = '';
    if (r < (idade > 12 ? 0.7 : 0.35)) { etapa = '999 - Finalizado com êxito'; docnum = String(docnumSeq++); miro = String(miroSeq++); dMiro = isoToSerial(add(dEmissao, ri(2, 12))); }
    else if (r < 0.85) etapa = 'A10 - Atribuição de Pedido de Compras Entr. de Frete';
    else etapa = pick(['DP - Determinação do Processo', '']);
    if (dMiro && dMiro > isoToSerial(hojeISO)) dMiro = isoToSerial(hojeISO);
    ctes.push({ t, numero, chave, dEmissao, nfes: nfesCte });
    vtin.push(['@09@', '0', etapa, docnum, chave, t.nome, t.cnpj, isoToSerial(dEmissao), ri(300, 9000) + 0.5, '693595-', '', '', miro, dMiro, '', '3001']);
  }
  for (let i = 0; i < 12; i++) { // notas de outro centro (devem sumir com o filtro)
    const f = pick(fornecedores); const dE = add(inicio, ri(0, 95));
    vtin.push(['@09@', '5', '', '0', montarChave(dE.slice(2, 4) + dE.slice(5, 7), f.cnpj, '55', 1, f.seq++), f.nome, f.cnpj, isoToSerial(dE), ri(100, 5000), '693595-', '', '', '', '', '', '3002']);
  }
  // Notas de empresas "Fora do escopo": CNPJs inventados (raízes 90000001 a 90000005), cobertos pelas regras de ESCOPO_DEMO
  let mistaOverride = null;
  const foraEscopo = [
    { nome: 'ETANOL FICTÍCIO LTDA', cnpj: '90000001000' + String(ri(100, 199)), modelo: '55', n: 18, nat: 'Compra para industrialização' },
    { nome: 'CAVACO FICTÍCIO LTDA', cnpj: '90000002000' + String(ri(100, 199)), modelo: '55', n: 10, nat: 'Compra para industrialização' },
    { nome: 'AGRÍCOLA FICTÍCIA (MILHO)', cnpj: '90000003000100', modelo: '55', n: 8, nat: 'Transferência merc. adq. recebida de terceiros' },
    { nome: 'AGRÍCOLA FICTÍCIA (OUTRAS COMPRAS)', cnpj: '90000003000100', modelo: '55', n: 3, nat: 'Venda de mercadoria' },
    { nome: 'FRETE DE PRODUTO FICTÍCIO LTDA', cnpj: '90000004000' + String(ri(100, 199)), modelo: '57', n: 20, nat: '' },
    { nome: 'TRANSPORTADORA MISTA FICTÍCIA LTDA', cnpj: '90000005000' + String(ri(100, 199)), modelo: '57', n: 14, nat: '' },
    { nome: 'TRANSPORTADORA NOVA FICTÍCIA', cnpj: '99' + String(ri(100000, 999999)) + '0001' + String(ri(10, 99)), modelo: '57', n: 3, nat: '', recente: true }
  ];
  for (const e of foraEscopo) {
    let seq = ri(1000, 50000);
    for (let i = 0; i < e.n; i++) {
      const dE = e.recente ? add(hojeISO, -ri(2, 20)) : (e.modelo === '57' && e.nome.includes('MISTA') ? add(hojeISO, -ri(0, 70)) : add(inicio, ri(0, 99)));
      if (futuro(dE)) continue;
      const lanc = chance(0.5), etapa = e.modelo === '57' ? (lanc ? '999 - Finalizado com êxito' : 'A10 - Atribuição de Pedido de Compras Entr. de Frete') : '';
      let dL = add(dE, ri(1, 10)); if (futuro(dL)) dL = hojeISO;
      const chave = montarChave(dE.slice(2, 4) + dE.slice(5, 7), e.cnpj, e.modelo, 1, seq++);
      if (e.nome.includes('MISTA') && !lanc && !mistaOverride) mistaOverride = chave;
      vtin.push(['@09@', '5', etapa, lanc ? String(docnumSeq++) : '0', chave, e.nome, e.cnpj, isoToSerial(dE),
        ri(5000, 90000) + 0.5, '693595-', '', '', lanc ? String(miroSeq++) : '', lanc ? isoToSerial(dL) : '', '', '3001', e.nat]);
    }
  }

  // ---- ME2N (com linha de total) e ME5A
  const hMe2n = ['Documento de compras', 'Item', 'Tipo doc.compras', 'Ctg.class.cont.', 'Código de eliminação', 'Grupo de compradores', 'Data do documento', 'Fornecedor/centro fornecedor', 'Material', 'Texto breve', 'Centro', 'Depósito', 'Qtd.do pedido', 'A ser fornecido (quantidade)', 'A ser faturado (quantidade)', 'Valor líquido do pedido', 'Requisição de compra', 'Item da requisição'];
  me2n.push(hMe2n);
  me2n.push(['', '', '', '', '', '', '', '', '', '', '', '', 0, '', '', 0, '', '']);
  const totalLinha = me2n[1];
  const hMe5a = ['Requisição de compra', 'Item de requisição', 'Data da solicitação', 'Grupo de compradores', 'Criado por', 'Status de processamento', 'Pedido', 'Item do pedido', 'Material', 'Texto breve', 'Quantidade solicitada', 'Centro'];
  me5a.push(hMe5a);
  me5a.push(['', '', '', '', '', '', '', '', '', '', 0, '']);
  for (const n of nfes) {
    if (chance(0.03)) continue; // pedido fora da extração da ME2N
    const grupo = pick(grupos);
    for (const it of n.itens) {
      const entregue = !!n.dEntrada;
      me2n.push([n.pedido, it.item, n.categoria === 'U' ? 'FO' : 'NB', n.categoria, '', grupo, isoToSerial(n.dPedido), `${n.f.cod} ${n.f.nome}`, it.material, it.texto, '3001', n.categoria === '' ? 'AL01' : '',
        it.qtd, entregue ? 0 : it.qtd, n.dLanc ? 0 : it.qtd, it.qtd * it.preco, n.rc, n.rc ? it.item : '']);
      totalLinha[12] += it.qtd; totalLinha[15] += it.qtd * it.preco;
      if (n.rc) me5a.push([n.rc, it.item, compacta(n.dRc), grupo, pick(['MAT. MANUTEN', 'JSILVA', 'PCOSTA', 'ALMOX01']), 'B', n.pedido, it.item, it.material, it.texto, it.qtd, '3001']);
    }
  }
  for (let i = 0; i < 70; i++) { // RCs abertas, sem pedido
    const d = add(hojeISO, -ri(0, 75));
    me5a.push([String(rcSeq++), '10', compacta(d), chance(0.2) ? '' : pick(grupos), chance(0.2) ? 'MAT. MANUTEN' : pick(['JSILVA', 'PCOSTA', 'ALMOX01']), 'N', '', '', String(ri(1000000, 1009999)), pick(materiais), ri(1, 20), '3001']);
  }

  // ---- MB51 (entradas, estornos, ruído de movimentos internos e de outro centro)
  const hMb51 = ['Material', 'Centro', 'Depósito', 'Tipo de movimento', 'Doc.material', 'Item doc.material', 'Ano doc.material', 'Data de lançamento', 'Quantidade', 'Texto breve material', 'Centro custo', 'Pedido', 'Item do pedido', 'Fornecedor', 'Referência', 'Montante em MI', 'Nome do usuário'];
  mb51.push(hMb51);
  const refDe = (n) => `${String(n.numero).padStart(9, '0')}-${String(n.f.serie).padStart(3, '0')}`;
  for (const n of nfes) {
    if (!n.dEntrada) continue;
    const doc = String(docSeq++);
    n.itens.forEach((it, k) => {
      mb51.push([it.material, '3001', n.categoria === '' ? 'AL01' : '', '101', doc, String(k + 1), n.dEntrada.slice(0, 4), ponto(n.dEntrada), it.qtd, it.texto, n.categoria === 'K' ? 'CC-' + ri(100, 140) : '', n.pedido, it.item, n.f.cod,
        chance(0.02) ? '' : refDe(n), (it.qtd * it.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), pick(['ALMOX01', 'ALMOX02', 'FISCAL01'])]);
    });
    if (chance(0.025)) { // estorno
      const doc2 = String(docSeq++);
      n.itens.forEach((it, k) => mb51.push([it.material, '3001', '', '102', doc2, String(k + 1), n.dEntrada.slice(0, 4), ponto(add(n.dEntrada, 1)), it.qtd, it.texto, '', n.pedido, it.item, n.f.cod, refDe(n), (it.qtd * it.preco).toFixed(2).replace('.', ','), 'ALMOX01']));
    }
  }
  for (let i = 0; i < 520; i++) { // movimentos internos: não são entradas
    const d = add(inicio, ri(0, 99));
    mb51.push([String(ri(1000000, 1009999)), '3001', 'AL01', pick(['201', '261', '311', '551', '261']), String(docSeq++), '1', d.slice(0, 4), ponto(d), ri(1, 10), pick(materiais), 'CC-' + ri(100, 140), '', '', '', '', '', 'ALMOX01']);
  }
  for (let i = 0; i < 40; i++) { // entradas de outro centro
    const d = add(inicio, ri(0, 99));
    mb51.push([String(ri(1000000, 1009999)), '3002', 'AL01', '101', String(docSeq++), '1', d.slice(0, 4), ponto(d), ri(1, 10), pick(materiais), '', String(pedSeq++), '10', '100099', `${String(ri(1000, 9999)).padStart(9, '0')}-001`, '100,00', 'OUTRO01']);
  }

  // ---- digitalização: planilha antiga (até o corte) e pasta (sempre)
  digit.push(['DATA', 'CHAVE', 'PEDIDO', 'SETOR']);
  pasta.push(['FullName', 'Name', 'LastWriteTime']);
  const raiz = 'C:\\Users\\usuario\\OneDrive - Empresa\\Almoxarifado\\Notas Digitalizadas';
  const grupoPasta = (cat) => (cat === '' ? 'Estoque' : 'Débito Direto');
  for (const n of nfes) {
    if (!n.dDigit) continue;
    const pastaClasse = chance(0.03) ? (grupoPasta(n.categoria) === 'Estoque' ? 'Débito Direto' : 'Estoque') : grupoPasta(n.categoria);
    const mes = MESES[Number(n.dDigit.slice(5, 7)) - 1];
    let dir, nome;
    if (n.dDigit < CORTE_NOVO_PADRAO) {
      dir = `${raiz}\\${pastaClasse}\\${n.dDigit.slice(0, 4)}\\${mes}\\${n.dDigit.slice(8, 10)}.${n.dDigit.slice(5, 7)}`;
      nome = chance(0.3) ? `NF ${n.numero} ${n.f.nome.split(' ').slice(0, 2).join(' ')}.pdf` : `NF ${n.numero}.pdf`;
      if (chance(0.92)) digit.push([isoToSerial(n.dDigit), n.chave, chance(0.97) ? n.pedido : '', pastaClasse.toUpperCase()]);
    } else {
      dir = `${raiz}\\${pastaClasse}\\${n.dDigit.slice(0, 4)}\\${mes}\\${n.dDigit}`;
      nome = `NFE ${n.numero} - ${n.chave} - ${n.pedido}.pdf`;
    }
    const modif = br(chance(0.3) ? add(n.dDigit, ri(1, 20)) : n.dDigit) + ` ${String(ri(7, 17)).padStart(2, '0')}:${String(ri(0, 59)).padStart(2, '0')}:00`;
    pasta.push([`${dir}\\${nome}`, nome, modif]);
  }
  // duplicatas na planilha manual
  for (let i = 0; i < 3 && digit.length > 10; i++) digit.push(digit[ri(1, digit.length - 1)].slice());

  // ---- CT-e da transportadora da planilha (Della Volpe fictícia) e coletas
  dvRows.push(['NR_COLETA', 'DATA_CRIACAO', 'DATA_COLETA', 'CHAVE_NFE', 'CHAVE_CTE', 'COLETA_PEDIDO', 'REMETENTE', 'PESO_KG', 'VOLUMES', 'PREVISAO_ENTREGA', 'DATA_ENTREGA', 'STATUS_SLA']);
  const ctesDV = ctes.filter(c => c.t.dv);
  let ic = 0, emTransito = 0;
  const viaDV = nfes.filter(n => n.viaDV);
  for (let i = 0; i < viaDV.length;) {
    const grupoN = viaDV.slice(i, i + ri(1, 3)); i += grupoN.length;
    const coleta = String(coletaSeq++);
    const cte = (ic < ctesDV.length && chance(0.85)) ? ctesDV[ic++] : null;
    if (cte) grupoN.forEach(n => cte.nfes.push(n.chave));
    for (const n of grupoN) {
      const atrasado = n.dEntrega && n.dPrev && n.dEntrega > n.dPrev;
      const entregaOk = n.dEntrega && !futuro(n.dEntrega) ? br(n.dEntrega) : '';
      // Metade das coletas em trânsito com a previsão de entrega já vencida: exemplo de "entrega atrasada" pelo prazo da Della Volpe
      const prev = !entregaOk && (emTransito++ % 2 === 0) ? add(hojeISO, -3 * emTransito) : n.dPrev;
      dvRows.push([coleta, br(n.dCriacaoColeta), br(n.dColeta), n.chave, cte ? cte.chave : '', n.pedido.padStart(35, '0'), n.f.nome, ri(50, 9000), ri(1, 30), br(prev), entregaOk, entregaOk ? (atrasado ? 'ATRASADO' : 'NO PRAZO') : 'EM TRANSITO']);
    }
  }
  for (let i = 0; i < 60; i++) { // coletas em aberto
    const d = add(hojeISO, -ri(0, 40));
    dvRows.push([String(coletaSeq++), br(d), '', '', '', pick(['DS2511' + ri(100, 999), 'NF ' + ri(10000, 99999), String(pedSeq++).padStart(35, '0')]), 'REMETENTE FICTÍCIO ' + ri(1, 9), '', '', '', '', 'AGUARDANDO COLETA']);
  }

  // ---- XML exportados do VT IN (NF-e e CT-e)
  const xml = [XML_COLS.map(c => c[1])];
  const CNPJ_DEST = '11222333000181'; // destinatário fictício
  const linhaXml = (o) => xml.push(XML_COLS.map(([k]) => (o[k] === undefined ? '' : o[k])));
  let divSeq = 4509900000;
  for (const n of nfes) {
    if (!n.temXml) continue;
    const pedDiv = String(divSeq++);
    const ped = n.pedXml === 'divergente' ? pedDiv : n.pedido;
    linhaXml({
      chave: n.chave, tipo_doc: 'NF-e', data_emissao: n.dEmissao, cnpj_emitente: n.f.cnpj, emitente: n.f.nome, cnpj_destinatario: CNPJ_DEST,
      natureza: n.semCompra ? 'REMESSA PARA CONSERTO' : 'VENDA DE MERCADORIA', cfops: n.semCompra ? '5915' : (chance(0.7) ? '5102' : '6102'),
      valor: n.valor, mod_frete: n.modFrete, tem_transportadora: n.transp ? 'S' : 'N', transportadora: n.transp ? n.transp.nome : '', cnpj_transportadora: n.transp ? n.transp.cnpj : '',
      pedidos_itens: (n.pedXml === 'item' || n.pedXml === 'divergente') ? ped : '',
      itens_pedido: (n.pedXml === 'item' || n.pedXml === 'divergente') ? n.itens.map(it => `${ped}/${it.item}`).join(' ') : '',
      pedido_compra: n.pedXml === 'compra' ? n.pedido : '', pedido_obs: n.pedXml === 'obs' ? n.pedido : '',
      arquivo_xml: `NFe${n.chave}.xml`
    });
  }
  for (const c of ctes) {
    if (!chance(0.85)) continue;
    linhaXml({ chave: c.chave, tipo_doc: 'CT-e', data_emissao: c.dEmissao, cnpj_emitente: c.t.cnpj, emitente: c.t.nome, natureza: 'PRESTACAO DE SERVICO DE TRANSPORTE',
      cfops: '5353', valor: ri(300, 9000) + 0.5, chaves_nfe: c.nfes.join(' '), arquivo_xml: `CTe${c.chave}.xml` });
  }

  // ---- acompanhamento manual de exemplo (próxima ação, contatos, vencimento, projeto, arquivamento e decisão de escopo)
  const manual = { acomp: [], contatos: [] };
  const agora = new Date(hoje + 12 * 3600000).toISOString();
  const ac = (chave, o) => manual.acomp.push(Object.assign({ chave, escopo_manual: '', vencimento_manual: '', proxima_acao_data: '', proxima_acao_texto: '', canal_recebimento: '', tipo_operacao_manual: '', projeto: '', arquivada_manual: '', atualizado_em: agora }, o));
  let cid = 1;
  const ct = (chave, data, quem, texto) => manual.contatos.push({ id: `demo-${cid++}`, chave, data, quem, texto, registrado_em: agora });
  const pend = nfes.filter(n => !n.dLanc && !n.cancelada && !futuro(n.dEmissao));
  if (pend[0]) { ac(pend[0].chave, { proxima_acao_data: hojeISO, proxima_acao_texto: 'Cobrar o comprador: pedido sem saldo para a entrada' }); ct(pend[0].chave, add(hojeISO, -3), 'Compras', 'E-mail pedindo ajuste da quantidade do pedido'); }
  if (pend[1]) { ac(pend[1].chave, { proxima_acao_data: add(hojeISO, -2), proxima_acao_texto: 'Confirmar a entrega com o fornecedor', canal_recebimento: 'E-mail' }); ct(pend[1].chave, add(hojeISO, -6), 'Fornecedor', 'Informou embarque para a semana seguinte'); ct(pend[1].chave, add(hojeISO, -2), 'Portaria', 'Caminhão ainda não chegou'); }
  if (pend[2]) ac(pend[2].chave, { proxima_acao_data: add(hojeISO, 3), proxima_acao_texto: 'Enviar o DANFE ao fiscal' });
  if (pend[3]) { ac(pend[3].chave, { canal_recebimento: 'E-mail' }); ct(pend[3].chave, add(hojeISO, -1), 'Fiscal', 'Nota recebida por e-mail; aguardando o material'); }
  if (pend[4]) ac(pend[4].chave, { vencimento_manual: add(pend[4].dEmissao, 45) });
  pend.slice(5, 9).forEach(n => ac(n.chave, { projeto: 'Projeto silos (fictício)' }));
  if (pend[9]) ac(pend[9].chave, { arquivada_manual: 'S' });
  if (pend[10]) ac(pend[10].chave, { tipo_operacao_manual: 'Conserto' });
  if (backlog[0]) ac(backlog[0], { arquivada_manual: 'N', proxima_acao_data: add(hojeISO, -1), proxima_acao_texto: 'Nota antiga ainda em aberto: confirmar com o fiscal' });
  if (mistaOverride) { ac(mistaOverride, { escopo_manual: 'incluir' }); ct(mistaOverride, add(hojeISO, -5), 'Compras', 'Frete de peças da manutenção: fica no acompanhamento'); }

  return { vtin, mb51, me2n, me5a, digit, pasta, dv: dvRows, xml, manual };
}

// Regras "Fora do escopo" dos dados fictícios. Valem só enquanto houver dados fictícios carregados e só cobrem
// os CNPJs inventados acima (raízes 90000001 a 90000005). A lista real da empresa vem do arquivo de configuração.
const D22 = '2026-11-22';
export const ESCOPO_DEMO = [
  { regra: 'raiz', valor: '90000001', nome: 'Etanol fictício', tipo: 'Fornecedor', motivo: 'Produto (cavaco, etanol, DDGS)', natureza: '', incluido_em: D22 },
  { regra: 'raiz', valor: '90000002', nome: 'Cavaco fictício', tipo: 'Fornecedor', motivo: 'Produto (cavaco, etanol, DDGS)', natureza: '', incluido_em: D22 },
  { regra: 'cnpj', valor: '90000003000100', nome: 'Agrícola fictícia (transferência de milho)', tipo: 'Fornecedor', motivo: 'Milho', natureza: 'Transferência merc. adq. recebida de terceiros', incluido_em: D22 },
  { regra: 'raiz', valor: '90000004', nome: 'Frete de produto fictício', tipo: 'Transportadora', motivo: 'Frete de produto', natureza: '', incluido_em: D22 },
  { regra: 'raiz', valor: '90000005', nome: 'Transportadora mista fictícia', tipo: 'Mista', motivo: 'Classificação por CT-e', natureza: '', incluido_em: D22 }
];
