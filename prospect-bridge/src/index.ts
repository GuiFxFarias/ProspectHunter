import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchCompanies, requestCompanyEnrich } from "./datastone.js";
import { createLead, logInteraction, findLead } from "./appClient.js";

const server = new McpServer({ name: "prospect-bridge", version: "0.1.0" });

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: `Erro: ${e instanceof Error ? e.message : String(e)}` }],
});

// 1) Descobrir empresas por filtros (Data Stone, SÍNCRONO). Traz firmografia
//    (setor, faixa_faturamento, faixa_funcionarios, cidade) + flags de contato.
server.tool(
  "search_companies",
  "Busca empresas na Data Stone por filtros (estado, cidade, setor, porte, receita). Síncrono. Retorna firmografia + id_empresa/cnpj, mas NÃO os telefones/e-mails (isso vem do enriquecimento).",
  {
    estados: z.array(z.string()).optional().describe('UF, ex.: ["SP"]'),
    localizacoes: z.array(z.string()).optional().describe('"Cidade, UF" (deixe estados vazio se usar)'),
    setores: z.array(z.string()).optional(),
    atividades_cnae: z.array(z.string()).optional(),
    tamanhos_empresa: z.array(z.string()).optional().describe('Ex.: ["51-200","201-500"]'),
    receita_minima: z.number().optional(),
    receita_maxima: z.number().optional(),
    tem_telefone: z.boolean().optional(),
    tem_email: z.boolean().optional(),
    pagina: z.number().optional(),
    por_pagina: z.number().optional(),
    chave_cache: z.string().optional().describe("Reaproveita a busca sem gastar crédito"),
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
      return ok(await searchCompanies(filtros, pagina ?? 1, por_pagina ?? 20, chave_cache));
    } catch (e) {
      return fail(e);
    }
  }
);

// 2) Disparar enriquecimento (ASSÍNCRONO). Os contatos chegam no webhook.
server.tool(
  "enrich_company",
  "Dispara o enriquecimento de uma empresa por CNPJ na Data Stone. É ASSÍNCRONO: retorna id_processamento e os contatos (telefone/e-mail/sócios) chegam depois no webhook (/api/datastone/webhook). Requer DATASTONE_WEBHOOK_URL público.",
  {
    cnpj: z.string().optional(),
    id_empresa: z.number().optional().describe("id vindo de search_companies"),
  },
  async ({ cnpj, id_empresa }) => {
    try {
      return ok(await requestCompanyEnrich({ cnpj, id_empresa }));
    } catch (e) {
      return fail(e);
    }
  }
);

// 3) Verificar duplicidade antes de inserir.
server.tool(
  "find_lead",
  "Procura leads já existentes por CNPJ ou nome da empresa. Use antes de create_lead para não duplicar.",
  {
    cnpj: z.string().optional(),
    empresa: z.string().optional(),
  },
  async (args) => {
    try {
      return ok(await findLead(args));
    } catch (e) {
      return fail(e);
    }
  }
);

// 4) Criar lead (via API route: inicializa cadência e seta owner_id).
server.tool(
  "create_lead",
  "Cria um lead no ProspectHunter via /api/leads (cadência + owner_id automáticos). Coloque o resumo da pesquisa em dados_complementares.",
  {
    empresa: z.string(),
    contato_nome: z.string().describe('Nome do decisor. Se não houver ainda, use "Prospecção".'),
    telefone: z.string().optional().describe('Múltiplos separados por " | "'),
    email: z.string().optional().describe('Múltiplos separados por " | "'),
    cnpj: z.string().optional(),
    produto: z.string().optional().describe('Ex.: "Statum AI Journey"'),
    descricao_atividade: z.string().optional(),
    dados_complementares: z
      .string()
      .optional()
      .describe("Resumo da pesquisa: porte, faturamento, sinais de IA, ângulo de abordagem."),
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

// 5) Registrar interação de cadência (dispara applyCallResultado no app).
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
    proximaAcaoEm: z.string().optional().describe("ISO date — ligar_depois / reuniao_agendada"),
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
