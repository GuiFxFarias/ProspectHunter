import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL for admin API");
}

function getAdminClient() {
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Configure it only on the server."
    );
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

// Criar usuário (admin only)
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const supabase = createServerSupabaseClient(accessToken);

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

    const { data: myProfile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !myProfile || myProfile.role !== "admin") {
      return NextResponse.json(
        { error: "Apenas admin pode criar usuários" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, password, nome, role } = body as {
      email?: string;
      password?: string;
      nome?: string;
      role?: "admin" | "user";
    };

    if (!email || !password || !role) {
      return NextResponse.json(
        { error: "email, password e role são obrigatórios" },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();

    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createError || !created.user) {
      return NextResponse.json(
        { error: createError?.message ?? "Erro ao criar usuário" },
        { status: 500 }
      );
    }

    const { error: profileInsertError } = await adminClient
      .from("profiles")
      .insert({
        id: created.user.id,
        nome: nome ?? null,
        role,
      });

    if (profileInsertError) {
      return NextResponse.json(
        { error: profileInsertError.message },
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

