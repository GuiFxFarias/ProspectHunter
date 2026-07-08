import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";

/**
 * Autentica como o usuário "prospector" (dono dos leads) e mantém um
 * access token válido. Esse token é enviado no header Authorization das
 * chamadas às API routes do Next.js — então o owner_id vira sempre esse usuário.
 */
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { autoRefreshToken: true, persistSession: false },
    });
  }
  return client;
}

let cachedToken: string | null = null;
let expiresAt = 0; // epoch segundos

export async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < expiresAt - 60) return cachedToken;

  const supabase = getClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: config.prospectorEmail,
    password: config.prospectorPassword,
  });
  if (error || !data.session) {
    throw new Error(`Falha ao autenticar no Supabase: ${error?.message ?? "sem sessão"}`);
  }
  cachedToken = data.session.access_token;
  expiresAt = data.session.expires_at ?? now + 3600;
  return cachedToken;
}

/** Cliente Supabase já autenticado como o prospector — usado só para LEITURA (find_lead). */
export async function getAuthedClient(): Promise<SupabaseClient> {
  const token = await getAccessToken();
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}
