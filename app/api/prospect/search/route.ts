import { NextResponse } from "next/server";
import { requireUser } from "@/lib/prospectAuth";
import { buscarEmpresas } from "@/lib/datastone";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const body = await request.json();
    const data = await buscarEmpresas(body);
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro" }, { status: 500 });
  }
}
