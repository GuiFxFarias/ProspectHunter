import { config } from "./config.js";
import { getAccessToken, getAuthedClient } from "./supabaseAuth.js";

export interface CreateLeadInput {
  empresa: string;
  contato_nome: string;
  telefone?: string | null;
  email?: string | null;
  produto?: string | null;
  cnpj?: string | null;
  descricao_atividade?: string | null;
  dados_complementares?: string | null;
  categoria_lead?: "novo" | "antigo";
  origem?: "SDR" | "Indicacao" | "Prospeccao" | "Rebote";
}

export type InteractionResultado =
  | "nao_atendeu"
  | "ligar_depois"
  | "pedir_email"
  | "sem_interesse"
  | "reuniao_agendada";

async function post(path: string, body: unknown) {
  const token = await getAccessToken();
  const resp = await fetch(`${config.appBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`POST ${path} → ${resp.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

/** Cria um lead usando a API route (que inicializa cadência e seta owner_id). */
export async function createLead(input: CreateLeadInput) {
  return post("/api/leads", {
    origem: "Prospeccao",
    categoria_lead: "novo",
    ...input,
  });
}

/** Registra uma interação de cadência (dispara a lógica applyCallResultado). */
export async function logInteraction(args: {
  leadId: string;
  resultado: InteractionResultado;
  observacao?: string;
  proximaAcaoEm?: string;
}) {
  return post("/api/interactions", args);
}

/**
 * Busca leads existentes para evitar duplicidade (leitura direta, RLS via token
 * do prospector). Casa por CNPJ (dígitos) ou por empresa (ilike).
 */
export async function findLead(args: { cnpj?: string; empresa?: string }) {
  const supabase = await getAuthedClient();
  let query = supabase
    .from("leads")
    .select("id, empresa, cnpj, contato_nome, telefone, email, status")
    .limit(10);

  if (args.cnpj) {
    const digits = args.cnpj.replace(/\D/g, "");
    query = query.or(`cnpj.eq.${args.cnpj},cnpj.eq.${digits}`);
  } else if (args.empresa) {
    query = query.ilike("empresa", `%${args.empresa}%`);
  } else {
    throw new Error("Informe cnpj ou empresa para buscar.");
  }

  const { data, error } = await query;
  if (error) throw new Error(`find_lead: ${error.message}`);
  return data ?? [];
}
