import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { LeadStatus } from "@/lib/cadence";

const ALLOWED_STATUS: LeadStatus[] = [
  "novo",
  "em_cadencia",
  "aguardando",
  "reuniao_marcada",
  "perdido",
];

export async function PATCH(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const supabase = createServerSupabaseClient(accessToken);
    const body = await request.json();
    const { leadIds, status } = body as {
      leadIds?: string[];
      status?: LeadStatus;
    };

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { error: "leadIds é obrigatório e deve conter ao menos um item" },
        { status: 400 }
      );
    }

    if (!status || !ALLOWED_STATUS.includes(status)) {
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
    }

    const { error } = await supabase
      .from("leads")
      .update({ status })
      .in("id", leadIds);

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
