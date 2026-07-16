import { NextResponse } from "next/server";
import { requireUser } from "@/lib/prospectAuth";
import { consultaPessoa } from "@/lib/datastone";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const { cpf } = await request.json();
    if (!cpf) return NextResponse.json({ error: "cpf é obrigatório" }, { status: 400 });
    const data = await consultaPessoa(cpf);
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro" }, { status: 500 });
  }
}
