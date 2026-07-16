import "./env.js"; // DEVE ser o primeiro import: carrega o .env antes de config.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  consultaEmpresa,
  consultaPessoa,
  buscarEmpresas,
  getBalance,
  probeRaw,
  searchCompaniesB2B,
  searchPeopleB2B,
  filterOptions,
  cnaeLookup,
  prospectCount,
  prospectExport,
  prospectResult,
  prospectResultParsed,
  type RegistryFilters,
} from "./datastone.js";
import { createLead, logInteraction, findLead, updateLeadByCnpj, deleteLead } from "./appClient.js";
import { autoProspect } from "./autoprospect.js";

const server = new McpServer({ name: "prospect-bridge", version: "0.1.0" });

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: `Erro: ${e instanceof Error ? e.message : String(e)}` }],
});

// Diagnóstico: saldo/créditos.
server.tool("check_balance", "Consulta saldo/créditos da conta Data Stone.", {}, async () => {
  try {
    return ok(await getBalance());
  } catch (e) {
    return fail(e);
  }
});

server.tool(
  "ds_probe",
  "Diagnóstico: bate numa URL crua da Data Stone e devolve status/Location/corpo (sem seguir redirect).",
  { url: z.string(), method: z.enum(["GET", "POST"]).optional() },
  async ({ url, method }) => {
    try {
      return ok(await probeRaw(url, method ?? "GET"));
    } catch (e) {
      return fail(e);
    }
  }
);

// B2C — consulta síncrona por CNPJ. Traz contatos na hora (usa crédito B2C).
server.tool(
  "consulta_empresa",
  "Consulta uma empresa por CNPJ na Data Stone (B2C, SÍNCRONO). Retorna decisor, telefones, e-mails, porte, faturamento e atividade — pronto pra virar lead. Usa 1 crédito B2C.",
  { cnpj: z.string().describe("CNPJ da empresa (com ou sem máscara)") },
  async ({ cnpj }) => {
    try {
      return ok(await consultaEmpresa(cnpj));
    } catch (e) {
      return fail(e);
    }
  }
);

// B2B — DESCOBERTA por filtros (setor/CNAE/UF/porte/faturamento). Usa crédito B2B.
server.tool(
  "search_companies",
  "Descobre empresas por filtros (B2B): estados, setores, atividades_cnae, tamanhos_empresa e faixa de faturamento. Retorna CNPJ + firmografia (sem contatos). Use pra montar listas de prospect por ICP. 1 crédito B2B na 1ª página; paginação com chave_cache = grátis.",
  {
    estados: z.array(z.string()).optional().describe('UFs, ex.: ["SP","MG","GO"]'),
    setores: z.array(z.string()).optional(),
    atividades_cnae: z.array(z.string()).optional().describe("Códigos CNAE"),
    setores_cnae: z.array(z.string()).optional(),
    tamanhos_empresa: z.array(z.string()).optional(),
    naturezas_juridicas: z.array(z.number()).optional(),
    receita_minima: z.number().optional().describe("Faturamento mínimo em R$"),
    receita_maxima: z.number().optional().describe("Faturamento máximo em R$"),
    tem_telefone: z.boolean().optional(),
    tem_email: z.boolean().optional(),
    pagina: z.number().optional(),
    por_pagina: z.number().optional(),
    chave_cache: z.string().optional(),
  },
  async (a) => {
    try {
      const { receita_minima, receita_maxima, pagina, por_pagina, chave_cache, ...rest } = a;
      const filtros = {
        ...rest,
        ...(receita_minima != null || receita_maxima != null
          ? { faixa_receita: { receita_minima, receita_maxima } }
          : {}),
      };
      return ok(await searchCompaniesB2B(filtros, pagina ?? 1, por_pagina ?? 25, chave_cache));
    } catch (e) {
      return fail(e);
    }
  }
);

// B2B — DESCOBERTA DE PESSOAS (decisor de TI) dentro do ICP. Usa crédito B2B.
server.tool(
  "search_people",
  "Descobre PESSOAS por cargo/departamento (ex.: TI) dentro de empresas do ICP (setor, região, faturamento). Ideal pra achar o decisor de tecnologia. Retorna nome + cargo + empresa. 1 crédito B2B na 1ª página; paginação com chave_cache = grátis.",
  {
    departamentos: z.array(z.string()).optional().describe('Ex.: ["Tecnologia"]'),
    niveis_senioridade: z.array(z.string()).optional().describe('Ex.: ["Diretor","Gerente"]'),
    cargos: z.array(z.string()).optional().describe('Ex.: ["Diretor de TI","Gerente de TI"]'),
    estados: z.array(z.string()).optional().describe('UFs da empresa, ex.: ["SP","MG","GO"]'),
    setores: z.array(z.string()).optional(),
    atividades_cnae: z.array(z.string()).optional(),
    tamanhos_empresa: z.array(z.string()).optional(),
    receita_minima: z.number().optional(),
    receita_maxima: z.number().optional(),
    has_email: z.boolean().optional(),
    has_phone: z.boolean().optional(),
    pagina: z.number().optional(),
    por_pagina: z.number().optional(),
    chave_cache: z.string().optional(),
  },
  async (a) => {
    try {
      const filtros_pessoa = {
        departamentos: a.departamentos,
        niveis_senioridade: a.niveis_senioridade,
        cargos: a.cargos,
        has_email: a.has_email,
        has_phone: a.has_phone,
      };
      const filtros_empresa = {
        estados: a.estados,
        setores: a.setores,
        atividades_cnae: a.atividades_cnae,
        tamanhos_empresa: a.tamanhos_empresa,
        ...(a.receita_minima != null || a.receita_maxima != null
          ? { faixa_receita: { receita_minima: a.receita_minima, receita_maxima: a.receita_maxima } }
          : {}),
      };
      return ok(
        await searchPeopleB2B(filtros_pessoa, filtros_empresa, a.pagina ?? 1, a.por_pagina ?? 25, a.chave_cache)
      );
    } catch (e) {
      return fail(e);
    }
  }
);

// Apoio: opções válidas de filtros e lookup de CNAE.
server.tool(
  "ds_filter_options",
  "Retorna as opções válidas dos filtros categóricos B2B (setores, tamanhos, naturezas jurídicas).",
  {},
  async () => {
    try {
      return ok(await filterOptions());
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "cnae_lookup",
  "Busca códigos CNAE por descrição (ex.: 'usina de açúcar'). Retorna o code pra usar em search_companies.",
  { descricao: z.string() },
  async ({ descricao }) => {
    try {
      return ok(await cnaeLookup(descricao));
    } catch (e) {
      return fail(e);
    }
  }
);

// B2C — consulta PESSOA por CPF: telefone/e-mail pessoais do decisor.
server.tool(
  "consulta_pessoa",
  "Consulta uma pessoa por CPF (B2C). Retorna telefone e e-mail PESSOAIS + profissão. Use com o CPF do decisor (vem em consulta_empresa.decisores) pra saber de quem é o contato. Usa 1 crédito B2C.",
  { cpf: z.string().describe("CPF do decisor (11 dígitos)") },
  async ({ cpf }) => {
    try {
      return ok(await consultaPessoa(cpf));
    } catch (e) {
      return fail(e);
    }
  }
);

// B2C — buscar empresa sem CNPJ (por razão social, UF, domínio, telefone).
server.tool(
  "buscar_empresas",
  "Busca empresas na Data Stone sem CNPJ (por razão social, UF, domínio, telefone, e-mail ou CEP). Use pra achar o CNPJ e depois consulta_empresa.",
  {
    razao_social: z.string().optional(),
    uf: z.string().optional().describe('Sigla, ex.: "SP"'),
    domain: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    cep: z.string().optional(),
  },
  async (args) => {
    try {
      return ok(await buscarEmpresas(args));
    } catch (e) {
      return fail(e);
    }
  }
);

// PIPELINE COMPLETO num comando: descobre (≤teto) → enriquece decisor+TI → cria leads.
server.tool(
  "autoprospect",
  "Faz TUDO de uma vez: filtra empresas do ICP (setor/CNAE/UF/faturamento ≤teto), acha o decisor (admin) e TI, pega telefone da empresa + celular do decisor, e cria os leads no ProspectHunter. Retorna só o resumo. 'name' é um termo obrigatório na razão social (ex.: 'INDUSTRIA').",
  {
    name: z.string().describe('Termo na razão social, ex.: "INDUSTRIA", "AGRICOLA", "ALIMENTOS"'),
    estados: z.array(z.string()).optional().describe('["SP","MG","GO"]'),
    sector_codes: z.array(z.string()).optional().describe('["INDUSTRIA"]'),
    cnae_codes: z.array(z.string()).optional(),
    receita_min: z.number().optional(),
    receita_max: z.number().optional().describe("Teto de faturamento em R$ (ex.: 1000000000 = 1BI)"),
    quantity: z.number().optional().describe("Quantos leads criar (default 10)"),
    produto: z.string().optional(),
  },
  async (a) => {
    try {
      return ok(await autoProspect(a));
    } catch (e) {
      return fail(e);
    }
  }
);

// PROSPECÇÃO POR REGISTRO (cobre o interior) — contagem grátis + extração por job.
function buildRegistry(a: any): RegistryFilters {
  const f: RegistryFilters = {};
  if (a.name) f.name = a.name;
  if (a.estados) f.states = a.estados;
  if (a.cities) f.cities = a.cities;
  if (a.cnae_codes) f.cnae_codes = a.cnae_codes;
  if (a.sector_codes) f.sector_codes = a.sector_codes;
  if (a.company_type) f.company_type = a.company_type;
  if (a.simple_type) f.simple_type = a.simple_type;
  if (a.receita_min != null || a.receita_max != null) {
    f.revenues = [{ lower: a.receita_min?.toString(), upper: a.receita_max?.toString() }];
  }
  return f;
}

const registrySchema = {
  estados: z.array(z.string()).optional().describe('UFs, ex.: ["SP","MG","GO"]'),
  cities: z.array(z.string()).optional().describe('"Cidade - UF"'),
  cnae_codes: z.array(z.string()).optional(),
  sector_codes: z.array(z.string()).optional().describe('Ex.: ["INDUSTRIA","COMÉRCIO"]'),
  company_type: z.array(z.enum(["ME", "EPP", "DEMAIS"])).optional(),
  simple_type: z.enum(["SIM", "NAO"]).optional(),
  receita_min: z.number().optional().describe("Faturamento mínimo em R$"),
  receita_max: z.number().optional().describe("Faturamento máximo em R$"),
  name: z.string().optional(),
} as const;

server.tool(
  "prospect_count",
  "Conta quantas empresas do registro oficial batem nos filtros (setor, CNAE, UF, faturamento). GRÁTIS (não gasta crédito). Use pra dimensionar o ICP antes de extrair.",
  registrySchema,
  async (a) => {
    try {
      return ok(await prospectCount(buildRegistry(a)));
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "prospect_export",
  "Inicia a extração das empresas do registro que batem nos filtros (job assíncrono). Retorna job_id; depois use prospect_result. Inclui contatos dos sócios.",
  { ...registrySchema, quantity: z.number().optional().describe("Quantas empresas extrair (default 100)") },
  async (a) => {
    try {
      const { quantity, ...rest } = a;
      return ok(await prospectExport(buildRegistry(rest), quantity ?? 100));
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "prospect_result",
  "Busca o resultado de um job de prospecção (prospect_export) pelo job_id. Retorna a URL do arquivo (zip).",
  { job_id: z.string() },
  async ({ job_id }) => {
    try {
      return ok(await prospectResult(job_id));
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "prospect_result_csv",
  "Baixa, descompacta e lê o CSV do resultado de um job (prospect_export). Retorna as empresas já em lista (com colunas do registro). Use limit pra controlar quantas linhas voltam.",
  { job_id: z.string(), limit: z.number().optional().describe("Quantas empresas retornar (default 20)") },
  async ({ job_id, limit }) => {
    try {
      return ok(await prospectResultParsed(job_id, limit ?? 20));
    } catch (e) {
      return fail(e);
    }
  }
);

// Dedupe no ProspectHunter.
server.tool(
  "find_lead",
  "Procura leads já existentes por CNPJ ou nome da empresa. Use antes de create_lead para não duplicar.",
  { cnpj: z.string().optional(), empresa: z.string().optional() },
  async (args) => {
    try {
      return ok(await findLead(args));
    } catch (e) {
      return fail(e);
    }
  }
);

// Cria lead via /api/leads (cadência + owner_id automáticos).
server.tool(
  "create_lead",
  "Cria um lead no ProspectHunter via /api/leads (cadência + owner_id automáticos). Coloque o resumo da pesquisa em dados_complementares.",
  {
    empresa: z.string(),
    contato_nome: z.string().describe('Nome do decisor. Se não houver, use "Prospecção".'),
    telefone: z.string().optional().describe('Múltiplos separados por " | "'),
    email: z.string().optional().describe('Múltiplos separados por " | "'),
    cnpj: z.string().optional(),
    produto: z.string().optional().describe('Ex.: "Statum AI Journey"'),
    descricao_atividade: z.string().optional(),
    dados_complementares: z.string().optional(),
    categoria_lead: z.enum(["novo", "antigo"]).optional(),
  },
  async (args) => {
    try {
      return ok(await createLead(args));
    } catch (e) {
      return fail(e);
    }
  }
);

// Atualiza um lead existente (localizado pelo CNPJ).
server.tool(
  "update_lead",
  "Atualiza um lead existente (achado pelo CNPJ). Use pra completar telefone/e-mail/contato depois de enriquecer o decisor.",
  {
    cnpj: z.string(),
    telefone: z.string().optional(),
    email: z.string().optional(),
    contato_nome: z.string().optional(),
    dados_complementares: z.string().optional(),
    produto: z.string().optional(),
  },
  async ({ cnpj, ...patch }) => {
    try {
      return ok(await updateLeadByCnpj(cnpj, patch));
    } catch (e) {
      return fail(e);
    }
  }
);

// Apaga um lead (pelo CNPJ).
server.tool(
  "delete_lead",
  "Apaga um lead do ProspectHunter por CNPJ ou nome da empresa. Use pra limpar leads criados por engano.",
  { cnpj: z.string().optional(), empresa: z.string().optional() },
  async (args) => {
    try {
      return ok(await deleteLead(args));
    } catch (e) {
      return fail(e);
    }
  }
);

// Registra interação de cadência.
server.tool(
  "log_interaction",
  "Registra uma interação de cadência num lead existente (dispara a lógica de cadência do app).",
  {
    leadId: z.string(),
    resultado: z.enum([
      "nao_atendeu",
      "ligar_depois",
      "pedir_email",
      "sem_interesse",
      "reuniao_agendada",
    ]),
    observacao: z.string().optional(),
    proximaAcaoEm: z.string().optional(),
  },
  async (args) => {
    try {
      return ok(await logInteraction(args));
    } catch (e) {
      return fail(e);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("prospect-bridge MCP rodando (stdio).");
