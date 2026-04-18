import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { initialCadenceState } from "@/lib/cadence";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const supabase = createServerSupabaseClient(accessToken);

    const body = await request.json();
    const {
      empresa,
      contato_nome,
      telefone,
      email,
      produto,
      origem,
      categoria_lead,
      cnpj,
      descricao_atividade,
      dados_complementares,
    } = body as {
      empresa?: string;
      contato_nome?: string;
      telefone?: string;
      email?: string;
      produto?: string;
      origem?: "SDR" | "Indicacao" | "Prospeccao" | "Rebote";
      categoria_lead?: "novo" | "antigo";
      cnpj?: string;
      descricao_atividade?: string;
      dados_complementares?: string;
    };

    if (!empresa || !contato_nome) {
      return NextResponse.json(
        { error: "empresa e contato_nome são obrigatórios" },
        { status: 400 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Usuário não autenticado" },
        { status: 401 }
      );
    }

    const cadence = initialCadenceState();

    const categoria =
      categoria_lead === "antigo" || categoria_lead === "novo"
        ? categoria_lead
        : "novo";

    const { error } = await supabase.from("leads").insert({
      empresa,
      contato_nome,
      telefone: telefone ?? null,
      email: email ?? null,
      cnpj: cnpj ?? null,
      descricao_atividade: descricao_atividade ?? null,
      dados_complementares: dados_complementares ?? null,
      produto: produto ?? null,
      origem: origem ?? "Prospeccao",
      categoria_lead: categoria,
      status: cadence.status,
      fase_cadencia: cadence.fase_cadencia,
      tentativas_no_dia: cadence.tentativas_no_dia,
      proxima_acao_em: cadence.proxima_acao_em,
      owner_id: user.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Erro inesperado" },
      { status: 500 }
    );
  }
}

