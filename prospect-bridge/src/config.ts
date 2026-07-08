function required(name: string, ...fallbacks: string[]): string {
  for (const key of [name, ...fallbacks]) {
    const v = process.env[key];
    if (v) return v;
  }
  throw new Error(`Variável de ambiente ausente: ${name}`);
}

export const config = {
  appBaseUrl: required("APP_BASE_URL").replace(/\/$/, ""),
  // Aceita tanto os nomes do app (NEXT_PUBLIC_*) quanto os simples.
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
  supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"),
  prospectorEmail: required("PROSPECTOR_EMAIL"),
  prospectorPassword: required("PROSPECTOR_PASSWORD"),
  datastone: {
    baseUrl: (process.env.DATASTONE_BASE_URL ?? "https://api.datastone.com.br").replace(/\/$/, ""),
    // Valor COMPLETO do header Authorization (ex.: "Token ds_xxx").
    authHeader: process.env.DATASTONE_API_KEY ?? "",
    // URL pública que a Data Stone chama quando o enriquecimento termina.
    webhookUrl: process.env.DATASTONE_WEBHOOK_URL ?? "",
  },
};

export function onlyDigits(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}
