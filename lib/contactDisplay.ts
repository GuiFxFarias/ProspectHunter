/**
 * Telefones e e-mails podem vir concatenados no mesmo campo (importação).
 * Convenção recomendada: separador " | " (pipe com espaços).
 * Também aceita ";" e quebras de linha.
 */
export function splitContactValues(
  raw: string | null | undefined
): string[] {
  if (!raw?.trim()) return [];
  const parts = raw
    .split(/\s*(?:\||;)\s*|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [raw.trim()];
}
