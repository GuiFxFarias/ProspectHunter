import { NextResponse } from "next/server";
import { requireUser } from "@/lib/prospectAuth";
import { consultaEmpresa } from "@/lib/datastone";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const { cnpj } = await request.json();
    if (!cnpj) return NextResponse.json({ error: "cnpj é obrigatório" }, { status: 400 });
    const data = await consultaEmpresa(cnpj);
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro" }, { status: 500 });
  }
}
