import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const supabase = createServerSupabaseClient(accessToken);
    const { id } = await context.params;

    const body = await request.json();
    const {
      empresa,
      contato_nome,
      telefone,
      email,
      produto,
      origem,
      categoria_lead,
      status,
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
      status?:
        | "novo"
        | "em_cadencia"
        | "aguardando"
        | "reuniao_marcada"
        | "perdido";
      cnpj?: string;
      descricao_atividade?: string;
      dados_complementares?: string;
    };

    const { error } = await supabase
      .from("leads")
      .update({
        ...(empresa !== undefined && { empresa }),
        ...(contato_nome !== undefined && { contato_nome }),
        ...(telefone !== undefined && { telefone }),
        ...(email !== undefined && { email }),
        ...(produto !== undefined && { produto }),
        ...(origem !== undefined && { origem }),
        ...(categoria_lead !== undefined && { categoria_lead }),
        ...(status !== undefined && { status }),
        ...(cnpj !== undefined && { cnpj: cnpj || null }),
        ...(descricao_atividade !== undefined && {
          descricao_atividade: descricao_atividade || null,
        }),
        ...(dados_complementares !== undefined && {
          dados_complementares: dados_complementares || null,
        }),
      })
      .eq("id", id);

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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const supabase = createServerSupabaseClient(accessToken);
    const { id } = await context.params;

    const { error } = await supabase.from("leads").delete().eq("id", id);

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

