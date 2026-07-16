import { config, onlyDigits } from "./config.js";
import { unzipSync, strFromU8 } from "fflate";

const SEP = " | ";
export const uniqJoin = (arr: (string | null | undefined)[]) =>
  Array.from(new Set(arr.filter((x): x is string => !!x && String(x).trim() !== ""))).join(SEP) ||
  null;

interface DsResult {
  json: any;
  status: number;
  text: string;
}

async function dsRequest(url: string, init: RequestInit): Promise<DsResult> {
  if (!config.datastone.authHeader) {
    throw new Error("Data Stone não configurada (DATASTONE_API_KEY).");
  }
  const resp = await fetch(url, {
    redirect: "manual",
    ...init,
    headers: {
      Authorization: config.datastone.authHeader, // "Token ds_xxx"
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await resp.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!resp.ok) {
    const location = resp.headers.get("location");
    const desc = json?.error?.description ?? json?.detail ?? text.slice(0, 200);
    throw new Error(`Data Stone ${resp.status}${location ? ` → Location: ${location}` : ""}: ${desc}`);
  }
  return { json, status: resp.status, text };
}

// Sonda de diagnóstico: bate numa URL crua e devolve status/Location/corpo,
// sem seguir redirect. Serve pra descobrir o caminho real da API.
export async function probeRaw(url: string, method: "GET" | "POST" = "GET", body?: unknown) {
  const resp = await fetch(url, {
    method,
    redirect: "manual",
    headers: {
      Authorization: config.datastone.authHeader,
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  const text = await resp.text();
  return {
    url,
    status: resp.status,
    location: resp.headers.get("location"),
    contentType: resp.headers.get("content-type"),
    body: text.slice(0, 400),
  };
}

function dsGet(path: string, query: Record<string, string>) {
  const qs = new URLSearchParams(query).toString();
  return dsRequest(`${config.datastone.baseUrl}${path}${qs ? `?${qs}` : ""}`, { method: "GET" });
}

function dsPost(path: string, body: unknown) {
  return dsRequest(`${config.datastone.baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// B2B — DESCOBERTA por filtros (setor, CNAE, UF, porte, faturamento).
// POST /b2b/companies/  (1 crédito B2B na 1ª página; paginação c/ cache = 0)
// ---------------------------------------------------------------------------
export interface B2BFilters {
  estados?: string[];
  localizacoes?: string[];
  setores?: string[];
  atividades_cnae?: string[];
  setores_cnae?: string[];
  tamanhos_empresa?: string[];
  naturezas_juridicas?: number[];
  faixa_receita?: { receita_minima?: number; receita_maxima?: number };
  tem_cnpj?: boolean;
  tem_telefone?: boolean;
  tem_email?: boolean;
}

export async function searchCompaniesB2B(
  filtros: B2BFilters,
  pagina = 1,
  por_pagina = 25,
  chave_cache?: string
) {
  const r = await dsPost("/b2b/companies/", {
    pagina,
    por_pagina,
    ...(chave_cache ? { chave_cache } : {}),
    filtros_empresa: filtros,
  });
  const j = r.json;
  return {
    _status: r.status,
    total: j.total,
    pagina: j.pagina,
    chave_cache: j.chave_cache,
    dados: j.dados ?? [],
  };
}

// Opções válidas dos filtros categóricos (setores, tamanhos, naturezas...).
export async function filterOptions() {
  const r = await dsGet("/b2b/filter-options/", {});
  return r.json;
}

// Lookup de CNAE por descrição ou código (retorna o "code" pra usar nos filtros).
export async function cnaeLookup(q: string) {
  const r = await dsGet("/cnae/", { description: q });
  return r.json;
}

// ---------------------------------------------------------------------------
// B2B — DESCOBERTA DE PESSOAS por cargo/departamento + ICP da empresa (SÍNCRONO).
// Ideal pra achar o decisor de TI dentro das empresas-alvo.
// POST /b2b/persons/
// ---------------------------------------------------------------------------
export interface PersonFilters {
  departamentos?: string[];
  niveis_senioridade?: string[];
  cargos?: string[];
  habilidades?: string[];
  estados?: string[];
  localizacoes?: string[];
  has_email?: boolean;
  has_phone?: boolean;
  has_linkedin?: boolean;
}

export async function searchPeopleB2B(
  filtros_pessoa: PersonFilters,
  filtros_empresa: B2BFilters,
  pagina = 1,
  por_pagina = 25,
  chave_cache?: string
) {
  const r = await dsPost("/b2b/persons/", {
    pagina,
    por_pagina,
    ...(chave_cache ? { chave_cache } : {}),
    filtros_pessoa,
    filtros_empresa,
  });
  const j = r.json;
  return {
    _status: r.status,
    total: j.total,
    chave_cache: j.chave_cache,
    dados: (j.dados ?? []).map((p: any) => ({
      id_pessoa: p.id_pessoa,
      nome: p.nome,
      cargo: p.cargo,
      empresa: p.nome_empresa,
      setor: p.setor,
      tem_email: p.tem_email,
      tem_telefone: p.tem_telefone,
      tem_linkedin: p.tem_linkedin,
    })),
  };
}

// Saldo/créditos (diagnóstico).
export async function getBalance() {
  const r = await dsGet("/balance/", {});
  return { _status: r.status, ...r.json };
}

// ---------------------------------------------------------------------------
// B2C — CONSULTA POR CNPJ (SÍNCRONO). Retorna contatos na hora. Usa crédito B2C.
// GET /companies/?cnpj=...
// ---------------------------------------------------------------------------
const phoneList = (arr: any[]) =>
  (arr ?? [])
    .slice()
    .sort((a, b) => (a?.priority ?? 99) - (b?.priority ?? 99))
    .map((p) => (p?.ddd && p?.number ? `${p.ddd} ${p.number}` : null))
    .filter(Boolean) as string[];

export function mapConsulta(c: any) {
  const partners: any[] = c?.partners ?? [];
  const related: any[] = c?.related_persons ?? [];
  const decisor =
    partners.find((p) => /administrador/i.test(p?.qualification ?? "")) ??
    related.find((p) => /diretor|administrador|presidente|s[oó]cio/i.test(p?.description ?? p?.qualification ?? "")) ??
    partners[0] ??
    related[0];

  const emails = (c?.emails ?? []).map((e: any) => e?.email).filter(Boolean);
  const telefones = [...phoneList(c?.mobile_phones), ...phoneList(c?.land_lines)];

  const decisoresAll = [
    ...partners.map((p) => ({ nome: p?.name, cargo: p?.qualification ?? "Sócio", cpf: p?.cpf ? String(p.cpf) : null })),
    ...related.map((p) => ({ nome: p?.name, cargo: p?.qualification ?? p?.description ?? "Relacionado", cpf: p?.cpf ? String(p.cpf) : null })),
  ].filter((d) => d.nome);
  const seenDec = new Set<string>();
  const decisores = decisoresAll.filter((d) => {
    const k = (d.cpf || d.nome) as string;
    if (seenDec.has(k)) return false;
    seenDec.add(k);
    return true;
  });
  // Só gerentes/supervisores/coordenadores/diretores DAS áreas: financeiro,
  // administrativo, TI e comercial. (Sócios/diretores já vêm em `decisores`.)
  const NIVEL_RE = /gerente|diretor|superintendente|supervisor|coordenador|chefe|encarregado|head\b/i;
  const AREA_RE =
    /financ|administrativ|\badm\b|contabil|controlad|tesouraria|\bt\.?i\b|tecnologia da inform|sistemas|inform[aá]tica|comercial|vendas|marketing|produ[cç][aã]o|opera[cç]|log[ií]stic|almoxarif|suprim|compras|estoque|recursos humanos|\brh\b|pessoal/i;
  const todosFunc = (c?.related_company_members ?? [])
    .map((m: any) => ({
      nome: m?.name,
      cargo: m?.position,
      status: m?.position_status,
      cpf: m?.cpf ? String(m.cpf) : null,
    }))
    .filter((m: any) => m.nome);
  const funcionarios = todosFunc
    .filter((m: any) => NIVEL_RE.test(m.cargo || "") && AREA_RE.test(m.cargo || ""))
    .slice(0, 10);

  return {
    cnpj: String(c?.cnpj ?? ""),
    empresa: c?.company_name ?? c?.trading_name ?? null,
    contato_nome: decisor?.name ?? "Prospecção",
    contato_cargo: decisor?.qualification ?? decisor?.description ?? null,
    decisores,
    funcionarios,
    telefone: uniqJoin(telefones),
    email: uniqJoin(emails),
    descricao_atividade: c?.cnae_description ?? c?.segment ?? null,
    dados_complementares: uniqJoin([
      c?.trading_name ? `Nome fantasia: ${c.trading_name}` : null,
      c?.business_size ? `Porte: ${c.business_size}` : null,
      c?.estimated_revenue ? `Faturamento: ${c.estimated_revenue}` : null,
      c?.employee_count ? `Funcionários: ${c.employee_count}` : null,
      c?.segment ? `Segmento: ${c.segment}` : null,
      c?.city_uf ? `Local: ${c.city_uf}` : null,
      c?.registry_situation ? `Situação: ${c.registry_situation}` : null,
    ]),
  };
}

export async function consultaEmpresa(cnpjInput: string) {
  const cnpj = onlyDigits(cnpjInput);
  if (cnpj.length !== 14) throw new Error(`CNPJ inválido: "${cnpjInput}" (precisa de 14 dígitos)`);
  const r = await dsGet("/companies/", { cnpj });
  const c = Array.isArray(r.json) ? r.json[0] : r.json; // a API devolve [{...}]
  if (!c) throw new Error(`Nenhuma empresa encontrada para o CNPJ ${cnpj}`);
  return { _status: r.status, ...mapConsulta(c) };
}

// CONSULTA PESSOA por CPF (B2C) — telefone/e-mail PESSOAIS do decisor. GET /persons/
export function mapPessoa(p: any) {
  const emails = (p?.emails ?? []).map((e: any) => e?.email).filter(Boolean);
  const telefones = [...phoneList(p?.mobile_phones), ...phoneList(p?.land_lines)];
  return {
    cpf: String(p?.cpf ?? ""),
    nome: p?.name ?? null,
    profissao: p?.cbo_description ?? null,
    renda_estimada: p?.estimated_income ?? null,
    telefone: uniqJoin(telefones),
    email: uniqJoin(emails),
    cidade: p?.addresses?.[0]?.city ?? null,
  };
}

export async function consultaPessoa(cpfInput: string) {
  const cpf = onlyDigits(cpfInput).padStart(11, "0"); // recupera zero à esquerda
  if (cpf.length !== 11) throw new Error(`CPF inválido: "${cpfInput}" (precisa de 11 dígitos)`);
  const r = await dsGet("/persons/", { cpf });
  const p = Array.isArray(r.json) ? r.json[0] : r.json;
  if (!p) throw new Error(`Nenhuma pessoa encontrada para o CPF ${cpf}`);
  return { _status: r.status, ...mapPessoa(p) };
}

// ---------------------------------------------------------------------------
// B2C — BUSCAR EMPRESA sem CNPJ (por razão social, UF, domínio, telefone).
// GET /company/list/
// ---------------------------------------------------------------------------
export async function buscarEmpresas(params: {
  razao_social?: string;
  uf?: string;
  domain?: string;
  phone?: string;
  email?: string;
  cep?: string;
}) {
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v) query[k] = v;
  if (Object.keys(query).length === 0) {
    throw new Error("Informe ao menos um filtro (razao_social, uf, domain, phone, email ou cep).");
  }
  const r = await dsGet("/company/list/", query);
  return r.json;
}

// ---------------------------------------------------------------------------
// PROSPECÇÃO POR REGISTRO OFICIAL (cobre o interior). POST /company/prospect/
//  - export:false → CONTAGEM (grátis)
//  - export:true  → job de extração (assíncrono); resultado em /prospection/{id}/result/
// ---------------------------------------------------------------------------
export interface RegistryFilters {
  name?: string;
  states?: string[];
  cities?: string[];
  cnae_codes?: string[];
  sector_codes?: string[];
  company_type?: string[]; // "ME" | "EPP" | "DEMAIS"
  revenues?: { lower?: string; upper?: string }[];
  estimated_employees?: { lower?: string; upper?: string }[];
  headquarter_type?: "H" | "B";
  nature_codes?: string[];
  simple_type?: "SIM" | "NAO";
}

export async function prospectCount(filters: RegistryFilters) {
  const r = await dsPost("/company/prospect/", { export: false, ...filters });
  return { _status: r.status, ...r.json };
}

export async function prospectExport(filters: RegistryFilters, quantity = 100) {
  const r = await dsPost("/company/prospect/", {
    export: true,
    quantity,
    plan: "3",
    file_formatting: "csv",
    ...filters,
  });
  return { _status: r.status, ...r.json };
}

export async function prospectResult(jobId: string) {
  const r = await dsGet(`/prospection/${jobId}/result/`, {});
  return { _status: r.status, raw: r.json };
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const delim = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
        } else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === delim) { out.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const vals = parseLine(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = (vals[i] ?? "").trim()));
    return obj;
  });
}

// Baixa o zip do resultado, descompacta e lê o CSV → lista de empresas.
export async function prospectResultParsed(jobId: string, limit = 20): Promise<any> {
  let r;
  try {
    r = await dsGet(`/prospection/${jobId}/result/`, {});
  } catch (e) {
    // Enquanto processa, a API responde 400 "Processing not done yet".
    if (e instanceof Error && /not done|processing|aguard|pending|ainda/i.test(e.message)) {
      return { pronto: false };
    }
    throw e;
  }
  const fileUrl: string | undefined = r.json?.file;
  if (!fileUrl) return { _status: r.status, pronto: false, raw: r.json };
  const resp = await fetch(fileUrl);
  if (!resp.ok) throw new Error(`Download do resultado falhou: ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  const files = unzipSync(buf);
  const csvName = Object.keys(files).find((n) => /\.csv$/i.test(n)) ?? Object.keys(files)[0];
  if (!csvName) throw new Error("Zip sem arquivo dentro");
  const rows = parseCsv(strFromU8(files[csvName]));
  return {
    _status: r.status,
    pronto: true,
    arquivo: csvName,
    total: rows.length,
    colunas: rows[0] ? Object.keys(rows[0]) : [],
    empresas: rows.slice(0, limit),
  };
}
