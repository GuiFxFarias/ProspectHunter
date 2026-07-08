import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Webhook da Data Stone (enriquecimento assíncrono de empresas).
 *
 * A Data Stone chama esta rota quando termina o enrich disparado pelo
 * prospect-bridge. O payload traz os contatos (telefones, e-mails, sócios).
 * Aqui a gente acha o lead pelo CNPJ e preenche esses campos.
 *
 * Segurança: como é um endpoint público, exige ?token=... igual ao
 * DATASTONE_WEBHOOK_SECRET. A URL cadastrada na Data Stone deve incluir o token:
 *   https://SEU-DOMINIO/api/datastone/webhook?token=SEGREDO
 *
 * Escrita: usa a SERVICE ROLE do Supabase (server-only) porque a chamada vem
 * da Data Stone, sem sessão de usuário. Configure SUPABASE_SERVICE_ROLE_KEY
 * no ambiente (Vercel) — NUNCA exponha como NEXT_PUBLIC_.
 *
 * ⚠️ Rode um enrich real uma vez, veja o payload logado (console) e ajuste
 * `mapEnriched` se algum caminho de campo estiver diferente.
 */

const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const SEP = " | ";
const uniqJoin = (arr: (string | null | undefined)[]) =>
  Array.from(new Set(arr.filter((x): x is string => !!x && String(x).trim() !== ""))).join(SEP) ||
  null;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

interface MappedContact {
  cnpj: string;
  contato_nome: string | null;
  telefone: string | null;
  email: string | null;
  descricao_atividade: string | null;
  dados_complementares: string | null;
}

function mapEnriched(company: any): MappedContact {
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
    cnpj: onlyDigits(company?.cnpj),
    contato_nome: decisor?.nome ?? null,
    telefone: uniqJoin(telefones),
    email: uniqJoin(emails),
    descricao_atividade: company?.cnae_principal?.descricao ?? company?.setor ?? null,
    dados_complementares: uniqJoin([
      company?.razao_social ? `Razão social: ${company.razao_social}` : null,
      company?.faixa_faturamento ? `Faturamento: ${company.faixa_faturamento}` : null,
      company?.faixa_funcionarios ? `Funcionários: ${company.faixa_funcionarios}` : null,
      company?.numero_funcionarios ? `Funcionários: ${company.numero_funcionarios}` : null,
      company?.website ? `Site: ${company.website}` : null,
    ]),
  };
}

export async function POST(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    const secret = process.env.DATASTONE_WEBHOOK_SECRET;
    if (secret && token !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const payload: any = await request.json();
    console.log("[datastone webhook] payload:", JSON.stringify(payload));

    // A Data Stone entrega um array `contatos` (individual ou bulk).
    const companies: any[] = Array.isArray(payload?.contatos)
      ? payload.contatos
      : Array.isArray(payload?.dados)
        ? payload.dados
        : [payload];

    const supabase = serviceClient();
    const results: Array<{ cnpj: string; updated: boolean; reason?: string }> = [];

    for (const raw of companies) {
      const m = mapEnriched(raw);
      if (!m.cnpj || m.cnpj.length !== 14) {
        results.push({ cnpj: m.cnpj, updated: false, reason: "cnpj inválido" });
        continue;
      }

      // leads.cnpj pode estar em dígitos (bridge) ou mascarado (import antigo).
      const masked = m.cnpj.replace(
        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
        "$1.$2.$3/$4-$5"
      );
      const { data: lead } = await supabase
        .from("leads")
        .select("id, contato_nome, telefone, email, descricao_atividade, dados_complementares")
        .or(`cnpj.eq.${m.cnpj},cnpj.eq.${masked}`)
        .limit(1)
        .maybeSingle();

      if (!lead) {
        results.push({ cnpj: m.cnpj, updated: false, reason: "lead não encontrado" });
        continue;
      }

      const patch: Record<string, unknown> = {};
      if (m.contato_nome && (!lead.contato_nome || lead.contato_nome === "Prospecção")) {
        patch.contato_nome = m.contato_nome;
      }
      if (m.telefone && !lead.telefone) patch.telefone = m.telefone;
      if (m.email && !lead.email) patch.email = m.email;
      if (m.descricao_atividade && !lead.descricao_atividade) {
        patch.descricao_atividade = m.descricao_atividade;
      }
      if (m.dados_complementares) {
        patch.dados_complementares = uniqJoin([lead.dados_complementares, m.dados_complementares]);
      }

      if (Object.keys(patch).length === 0) {
        results.push({ cnpj: m.cnpj, updated: false, reason: "nada a atualizar" });
        continue;
      }

      const { error } = await supabase.from("leads").update(patch).eq("id", lead.id);
      results.push({ cnpj: m.cnpj, updated: !error, reason: error?.message });
    }

    return NextResponse.json({ ok: true, results });
  } catch (error: any) {
    console.error("[datastone webhook] erro:", error);
    return NextResponse.json({ error: error?.message ?? "Erro inesperado" }, { status: 500 });
  }
}
