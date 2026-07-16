import { createServerSupabaseClient } from "@/lib/supabase";

// Garante que a requisição vem de um usuário logado (mesmo padrão de /api/leads).
export async function requireUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const supabase = createServerSupabaseClient(accessToken);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
