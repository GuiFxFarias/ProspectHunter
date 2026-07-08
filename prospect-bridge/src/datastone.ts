import { config, onlyDigits } from "./config.js";

const SEP = " | ";
export const uniqJoin = (arr: (string | null | undefined)[]) =>
  Array.from(new Set(arr.filter((x): x is string => !!x && String(x).trim() !== ""))).join(SEP) ||
  null;

async function dsFetch(path: string, body: unknown) {
  if (!config.datastone.authHeader) {
    throw new Error("Data Stone não configurada (DATASTONE_API_KEY).");
  }
  const url = `${config.datastone.baseUrl}${path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: config.datastone.authHeader, // ex.: "Token ds_xxx"
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const desc = json?.error?.description ?? json?.detail ?? JSON.stringify(json);
    throw new Error(`Data Stone ${resp.status}: ${desc}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// BUSCA (síncrona) — descoberta de empresas por filtros. Retorna firmografia,
// NÃO os contatos. Bom para montar listas por setor/estado/porte.
// POST /b2b/companies/
// ---------------------------------------------------------------------------
export interface CompanyFilters {
  nome_empresa?: string[];
  localizacoes?: string[]; // "Cidade, UF" (deixe estados vazio se usar)
  estados?: string[]; // UF
  setores?: string[];
  atividades_cnae?: string[];
  tamanhos_empresa?: string[]; // "11-50", "51-200"...
  faixa_receita?: { receita_minima?: number; receita_maxima?: number };
  tem_cnpj?: boolean;
  tem_telefone?: boolean;
  tem_email?: boolean;
}

export async function searchCompanies(
  filtros: CompanyFilters,
  pagina = 1,
  por_pagina = 20,
  chave_cache?: string
) {
  const json = await dsFetch("/b2b/companies/", {
    pagina,
    por_pagina,
    ...(chave_cache ? { chave_cache } : {}),
    filtros_empresa: filtros,
  });
  return {
    total: json.total as number,
    pagina: json.pagina as number,
    chave_cache: json.chave_cache as string | undefined,
    dados: (json.dados ?? []) as Array<{
      id_empresa: number;
      cnpj: string;
      nome_empresa: string;
      localizacao: string;
      setor: string;
      faixa_funcionarios: string;
      faixa_faturamento: string;
      tem_telefone: boolean;
      tem_email: boolean;
      tem_linkedin: boolean;
    }>,
  };
}

// ---------------------------------------------------------------------------
// ENRIQUECIMENTO (assíncrono) — dispara e recebe o resultado via WEBHOOK.
// Retorna 202 com id_processamento; os contatos chegam depois no url_webhook.
// POST /b2b/companies/enrich
// ---------------------------------------------------------------------------
export async function requestCompanyEnrich(input: {
  cnpj?: string;
  id_empresa?: number;
  urlWebhook?: string;
}) {
  const urlWebhook = input.urlWebhook ?? config.datastone.webhookUrl;
  if (!urlWebhook) {
    throw new Error(
      "Sem url_webhook: o enriquecimento é assíncrono e precisa de uma URL pública (DATASTONE_WEBHOOK_URL)."
    );
  }
  const contato: Record<string, unknown> = {};
  if (input.cnpj) contato.cnpj = onlyDigits(input.cnpj);
  if (input.id_empresa) contato.id_empresa = input.id_empresa;
  if (!contato.cnpj && !contato.id_empresa) {
    throw new Error("Informe cnpj ou id_empresa para enriquecer.");
  }

  const json = await dsFetch("/b2b/companies/enrich", { contato, url_webhook: urlWebhook });
  return {
    sucesso: json.sucesso as boolean,
    mensagem: json.mensagem as string,
    id_processamento: json.id_processamento as string,
    quantidade: json.quantidade as number,
    url_webhook: json.url_webhook as string,
  };
}

// ---------------------------------------------------------------------------
// MAPEAMENTO do payload do webhook → campos do lead. Reutilize esta função na
// rota /api/datastone/webhook do seu app (é o que preenche telefone/e-mail).
// Ajuste os caminhos conforme o payload real que chegar no webhook.
// ---------------------------------------------------------------------------
export function mapEnrichedToLead(company: any) {
  const socios: any[] = company?.socios ?? company?.administradores ?? [];
  const decisor =
    socios.find((s) => /admin/i.test(s?.qualificacao ?? s?.cargo ?? "")) ?? socios[0];

  const telefones = (company?.telefones ?? [])
    .map((t: any) => (typeof t === "string" ? t : [t?.ddd, t?.numero].filter(Boolean).join(" ")))
    .filter(Boolean);
  const emails = (company?.emails ?? [])
    .map((e: any) => (typeof e === "string" ? e : e?.email))
    .filter(Boolean);

  return {
    cnpj: onlyDigits(company?.cnpj ?? ""),
    contato_nome: decisor?.nome ?? "Prospecção",
    telefone: uniqJoin(telefones),
    email: uniqJoin(emails),
    descricao_atividade: company?.cnae_principal?.descricao ?? company?.setor ?? null,
    dados_complementares: uniqJoin([
      company?.razao_social ? `Razão social: ${company.razao_social}` : null,
      company?.faixa_faturamento ? `Faturamento: ${company.faixa_faturamento}` : null,
      company?.faixa_funcionarios ? `Funcionários: ${company.faixa_funcionarios}` : null,
      company?.numero_funcionarios ? `Funcionários: ${company.numero_funcionarios}` : null,
      company?.localizacao ?? ([company?.cidade, company?.estado].filter(Boolean).join("/") || null),
      company?.website ? `Site: ${company.website}` : null,
    ]),
  };
}
