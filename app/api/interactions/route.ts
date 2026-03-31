import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { applyCallResultado, type InteractionResultado, type Lead } from "@/lib/cadence";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leadId, resultado, observacao, proximaAcaoEm } = body as {
      leadId?: string;
      resultado?: InteractionResultado;
      observacao?: string;
      proximaAcaoEm?: string;
    };

    if (!leadId || !resultado) {
      return NextResponse.json(
        { error: "leadId e resultado são obrigatórios" },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const supabase = createServerSupabaseClient(accessToken);

    // Fetch current lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single<Lead>();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead não encontrado" },
        { status: 404 }
      );
    }

    // Store interaction (only ligacao for now)
    const { error: interactionError } = await supabase
      .from("interactions")
      .insert({
        lead_id: leadId,
        tipo: "ligacao",
        resultado,
        observacao: observacao ?? null,
        fase_cadencia_no_momento: lead.fase_cadencia,
        tentativas_no_dia_no_momento: lead.tentativas_no_dia,
      });

    if (interactionError) {
      return NextResponse.json(
        { error: interactionError.message },
        { status: 500 }
      );
    }

    // Apply business logic
    let cadenceUpdate = applyCallResultado(lead, resultado);

    // If user set a custom next action for "ligar_depois" or meeting date for "reuniao_agendada", override it
    if (
      (resultado === "ligar_depois" || resultado === "reuniao_agendada") &&
      proximaAcaoEm
    ) {
      cadenceUpdate = {
        ...cadenceUpdate,
        proxima_acao_em: proximaAcaoEm,
      };
    }

    const { error: updateError } = await supabase
      .from("leads")
      .update({
        status: cadenceUpdate.status ?? lead.status,
        fase_cadencia: cadenceUpdate.fase_cadencia ?? lead.fase_cadencia,
        tentativas_no_dia:
          cadenceUpdate.tentativas_no_dia ?? lead.tentativas_no_dia,
        proxima_acao_em: cadenceUpdate.proxima_acao_em,
      })
      .eq("id", leadId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Erro inesperado" },
      { status: 500 }
    );
  }
}

