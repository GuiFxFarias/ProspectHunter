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
  const url = `${config.appBaseUrl}${path}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(
      `Falha de rede no POST ${url}: ${e instanceof Error ? e.message : String(e)}`
    );
  }
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

/** Apaga um lead existente (por CNPJ ou nome) via DELETE /api/leads/[id]. */
export async function deleteLead(args: { cnpj?: string; empresa?: string }) {
  const leads = await findLead(args);
  const lead: any = leads[0];
  if (!lead) return { apagado: false, motivo: "não encontrado" };
  const token = await getAccessToken();
  const url = `${config.appBaseUrl}/api/leads/${lead.id}`;
  const resp = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`DELETE ${url} → ${resp.status}: ${JSON.stringify(json)}`);
  return { apagado: true, empresa: lead.empresa, cnpj: lead.cnpj };
}

/** Atualiza um lead existente (localizado pelo CNPJ) via PATCH /api/leads/[id]. */
export async function updateLeadByCnpj(cnpj: string, patch: Record<string, unknown>) {
  const leads = await findLead({ cnpj });
  const lead: any = leads[0];
  if (!lead) throw new Error(`Lead não encontrado para CNPJ ${cnpj}`);
  const token = await getAccessToken();
  const url = `${config.appBaseUrl}/api/leads/${lead.id}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });
  } catch (e) {
    throw new Error(`Falha de rede no PATCH ${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`PATCH ${url} → ${resp.status}: ${JSON.stringify(json)}`);
  return { id: lead.id, ...json };
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
