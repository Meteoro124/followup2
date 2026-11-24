/* Banco: DuckDB-Wasm (consultas, importação de CSV, views) e IndexedDB (o que fica guardado no navegador). */
import { atualizarStatus } from '../app.js';
import { atualizarContadores } from './acompanhamento.js';
import { cargaFim, cargaIni } from './dom.js';
import { cfgEmUso, DUCKDB_URL, IDB_NOME, st } from './estado.js';
import { tabela } from './formato.js';
import { campos } from '../paginas/detalhe.js';
import { S } from '../sql/index.js';

// ------------------------------------------------------------------ DuckDB
function converterValor(v, tipo, tipoObj) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return Number(v);
  if (/^Decimal/.test(tipo) && typeof v === 'object') {
    try {
      const escala = Math.pow(10, (tipoObj && tipoObj.scale) || 0);
      if (ArrayBuffer.isView(v)) {
        const w = Array.from(new Uint32Array(v.buffer, v.byteOffset, Math.min(4, v.length || 4)));
        let big = 0n;
        for (let i = w.length - 1; i >= 0; i--) big = (big << 32n) + BigInt(w[i]);
        const bits = BigInt(w.length * 32);
        if (big >= (1n << (bits - 1n))) big -= (1n << bits);
        return Number(big) / escala;
      }
      return Number(String(v)) / escala;
    } catch (e) { return String(v); }
  }
  if (/^Date/.test(tipo)) { const d = v instanceof Date ? v : new Date(Number(v)); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
  if (/^Timestamp/.test(tipo)) { const d = v instanceof Date ? v : new Date(Number(v)); return isNaN(d) ? null : d.toISOString().slice(0, 19).replace('T', ' '); }
  if (typeof v === 'object') {
    try { const j = typeof v.toJSON === 'function' ? v.toJSON() : (typeof v.toArray === 'function' ? Array.from(v.toArray()) : v); return JSON.stringify(j, (k, x) => typeof x === 'bigint' ? Number(x) : x); }
    catch (e) { return String(v); }
  }
  return v;
}
function arrowParaLinhas(t) {
  const campos = t.schema.fields;
  const cols = campos.map(f => f.name);
  const tipos = campos.map(f => String(f.type));
  const linhas = [];
  for (const r of t.toArray()) {
    const o = typeof r.toJSON === 'function' ? r.toJSON() : r;
    const out = {};
    cols.forEach((c, i) => { out[c] = converterValor(o[c], tipos[i], campos[i].type); });
    linhas.push(out);
  }
  return { cols, linhas };
}
export async function exec(sql) { cargaIni(); try { return await st.conn.query(sql); } finally { cargaFim(); } }
export async function consulta(sql) { cargaIni(); try { return arrowParaLinhas(await st.conn.query(sql)); } finally { cargaFim(); } }
export async function valor(sql) { const r = await consulta(sql); return r.linhas.length ? r.linhas[0][r.cols[0]] : null; }

export async function iniciarDuckDB() {
  const duckdb = await import(DUCKDB_URL);
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }));
  const worker = new Worker(workerUrl);
  const logger = duckdb.LogLevel ? new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING) : new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  st.db = db;
  st.conn = await db.connect();
  st.versaoDuck = await valor('SELECT version()');
}

let contadorArquivo = 0;
export async function inserirCSV(tabela, csv) {
  const nome = `carga_${Date.now()}_${contadorArquivo++}.csv`;
  await st.db.registerFileText(nome, csv);
  try {
    await exec(`INSERT INTO ${tabela} BY NAME SELECT * FROM read_csv('${nome}', header = true, all_varchar = true, delim = ',', quote = '"', escape = '"')`);
  } finally {
    try { await st.db.dropFile(nome); } catch (e) { /* ignora */ }
  }
}

export async function criarEsquema() { for (const s of S.esquema()) await exec(s); }

export async function recriarViews() {
  st.errosViews = [];
  for (const [nome, sql] of S.views(cfgEmUso())) {
    try { await exec(sql); } catch (e) { st.errosViews.push({ nome, erro: String(e.message || e) }); console.error(nome, e); }
  }
}

// Recalcula as tabelas pré-calculadas (depois de importar ou apagar dados)
export async function materializar() {
  st.errosViews = st.errosViews.filter(e => !/^m_/.test(e.nome));
  for (const [nome, sql] of S.materializacoes()) {
    try { await exec(sql); } catch (e) { st.errosViews.push({ nome, erro: String(e.message || e) }); console.error(nome, e); }
  }
  atualizarStatus();
  atualizarContadores();
}

// ------------------------------------------------------------------ IndexedDB
export function idbAbrir() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NOME, 3);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('lotes')) d.createObjectStore('lotes', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('obs')) d.createObjectStore('obs', { keyPath: 'chave' });
      if (!d.objectStoreNames.contains('escopo')) d.createObjectStore('escopo', { keyPath: 'chave' }); // versão 2 (só migração)
      if (!d.objectStoreNames.contains('acomp')) d.createObjectStore('acomp', { keyPath: 'chave' });
      if (!d.objectStoreNames.contains('contatos')) d.createObjectStore('contatos', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('config')) d.createObjectStore('config', { keyPath: 'k' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idbOp(store, modo, fn) {
  if (!st.idb) return Promise.resolve(null);
  return new Promise((res, rej) => {
    const tx = st.idb.transaction(store, modo);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => res(req ? req.result : null);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}
export const idbTodos = (s) => idbOp(s, 'readonly', o => o.getAll()).then(r => r || []);
export const idbGravar = (s, v) => idbOp(s, 'readwrite', o => o.put(v));
export const idbApagar = (s, k) => idbOp(s, 'readwrite', o => o.delete(k));
export const idbLimpar = (s) => idbOp(s, 'readwrite', o => o.clear());
