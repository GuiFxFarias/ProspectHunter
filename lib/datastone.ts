// Motor de prospecção Data Stone — server-side (usado pelas rotas /api/prospect/*).
// A chave fica em DATASTONE_API_KEY (ambiente do servidor / Vercel), nunca no client.

const BASE = (process.env.DATASTONE_BASE_URL ?? "https://api.datastone.com.br/v1").replace(/\/$/, "");
const AUTH = process.env.DATASTONE_API_KEY ?? ""; // valor completo, ex.: "Token ds_xxx"

const SEP = " | ";
const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const uniqJoin = (arr: (string | null | undefined)[]) =>
  Array.from(new Set(arr.filter((x): x is string => !!x && String(x).trim() !== ""))).join(SEP) || null;

async function dsRequest(url: string, init: RequestInit) {
  if (!AUTH) throw new Error("Data Stone não configurada (DATASTONE_API_KEY).");
  const resp = await fetch(url, {
    redirect: "manual",
    ...init,
    headers: { Authorization: AUTH, Accept: "application/json", ...(init.headers ?? {}) },
  });
  const text = await resp.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  if (resp.status >= 300 && resp.status < 400) {
    const location = resp.headers.get("location");
    throw new Error(
      `Data Stone redirecionou (${resp.status}) para "${location ?? "?"}". ` +
      `Verifique DATASTONE_BASE_URL (a base atual é "${BASE}") — provavelmente falta ou sobra o sufixo "/v1".`
    );
  }
  if (!resp.ok) {
    const desc = json?.error?.description ?? json?.detail ?? text.slice(0, 200);
    throw new Error(`Data Stone ${resp.status}: ${desc}`);
  }
  return json;
}

const dsGet = (path: string, query: Record<string, string>) => {
  const qs = new URLSearchParams(query).toString();
  return dsRequest(`${BASE}${path}${qs ? `?${qs}` : ""}`, { method: "GET" });
};

const phoneList = (arr: any[]) =>
  (arr ?? [])
    .slice()
    .sort((a, b) => (a?.priority ?? 99) - (b?.priority ?? 99))
    .map((p) => (p?.ddd && p?.number ? `${p.ddd} ${p.number}` : null))
    .filter(Boolean) as string[];

// --- Buscar empresa por razão social / UF (acha o CNPJ) ---
export async function buscarEmpresas(params: {
  razao_social?: string; uf?: string; domain?: string; phone?: string; cep?: string;
}) {
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v) query[k] = v;
  if (!Object.keys(query).length) throw new Error("Informe ao menos um filtro.");
  return dsGet("/company/list/", query);
}

// --- Consulta empresa por CNPJ → decisores + gerentes + telefones ---
const NIVEL_RE = /gerente|diretor|superintendente|supervisor|coordenador|chefe|encarregado|head\b/i;
const AREA_RE =
  /financ|administrativ|\badm\b|contabil|controlad|tesouraria|\bt\.?i\b|tecnologia da inform|sistemas|inform[aá]tica|comercial|vendas|marketing|produ[cç][aã]o|opera[cç]|log[ií]stic|almoxarif|suprim|compras|estoque|recursos humanos|\brh\b|pessoal/i;

export function mapEmpresa(c: any) {
  const partners: any[] = c?.partners ?? [];
  const related: any[] = c?.related_persons ?? [];
  const decisorPrincipal =
    partners.find((p) => /administrador/i.test(p?.qualification ?? "")) ??
    related.find((p) => /diretor|administrador|presidente|s[oó]cio/i.test(p?.description ?? p?.qualification ?? "")) ??
    partners[0] ?? related[0];

  const decisoresAll = [
    ...partners.map((p) => ({ nome: p?.name, cargo: p?.qualification ?? "Sócio", cpf: p?.cpf ? String(p.cpf) : null })),
    ...related.map((p) => ({ nome: p?.name, cargo: p?.qualification ?? p?.description ?? "Relacionado", cpf: p?.cpf ? String(p.cpf) : null })),
  ].filter((d) => d.nome);
  const seen = new Set<string>();
  const decisores = decisoresAll.filter((d) => {
    const k = (d.cpf || d.nome) as string;
    if (seen.has(k)) return false; seen.add(k); return true;
  });

  const gerentes = (c?.related_company_members ?? [])
    .map((m: any) => ({ nome: m?.name, cargo: m?.position, cpf: m?.cpf ? String(m.cpf) : null, status: m?.position_status }))
    .filter((m: any) => m.nome && NIVEL_RE.test(m.cargo || "") && AREA_RE.test(m.cargo || ""))
    .slice(0, 12);

  return {
    cnpj: String(c?.cnpj ?? ""),
    empresa: c?.company_name ?? c?.trading_name ?? null,
    contato_nome: decisorPrincipal?.name ?? "Prospecção",
    contato_cargo: decisorPrincipal?.qualification ?? decisorPrincipal?.description ?? null,
    decisores,
    gerentes,
    telefone_empresa: uniqJoin([...phoneList(c?.mobile_phones), ...phoneList(c?.land_lines)]),
    email_empresa: uniqJoin((c?.emails ?? []).map((e: any) => e?.email)),
    descricao_atividade: c?.cnae_description ?? c?.segment ?? null,
    faturamento: c?.estimated_revenue ?? null,
    local: c?.city_uf ?? null,
    porte: c?.business_size ?? null,
    situacao: c?.registry_situation ?? null,
  };
}

export async function consultaEmpresa(cnpjInput: string) {
  const cnpj = onlyDigits(cnpjInput);
  if (cnpj.length !== 14) throw new Error("CNPJ precisa de 14 dígitos.");
  const json = await dsGet("/companies/", { cnpj });
  const c = Array.isArray(json) ? json[0] : json;
  if (!c) throw new Error("Empresa não encontrada.");
  return mapEmpresa(c);
}

// --- Consulta pessoa por CPF → contato pessoal ---
export async function consultaPessoa(cpfInput: string) {
  const cpf = onlyDigits(cpfInput).padStart(11, "0");
  if (cpf.length !== 11) throw new Error("CPF precisa de 11 dígitos.");
  const json = await dsGet("/persons/", { cpf });
  const p = Array.isArray(json) ? json[0] : json;
  if (!p) throw new Error("Pessoa não encontrada.");
  return {
    cpf,
    nome: p?.name ?? null,
    profissao: p?.cbo_description ?? null,
    telefone: uniqJoin([...phoneList(p?.mobile_phones), ...phoneList(p?.land_lines)]),
    email: uniqJoin((p?.emails ?? []).map((e: any) => e?.email)),
    cidade: p?.addresses?.[0]?.city ?? null,
  };
}
