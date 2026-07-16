/**
 * `dados_complementares` chega como texto livre (às vezes gerado por IA), tipicamente
 * concatenando fatos da empresa e blocos "👑 DECISOR", "👔 GERENTES", "Também",
 * "📞 EMPRESA" e "Ângulo ...", unidos por " | " — mas nomes/telefones/e-mails de
 * pessoas diferentes acabam grudados no mesmo bloco. Este parser extrai cada pessoa
 * (nome, cargo, telefones, e-mail) independentemente de onde o texto foi cortado.
 */

export interface PessoaContato {
  nome: string;
  cargo?: string;
  telefones: string[];
  email?: string;
}

export interface SecaoPessoas {
  titulo: string;
  icon?: string;
  pessoas: PessoaContato[];
}

export interface ParsedComplementares {
  infoGeral: string[];
  secoes: SecaoPessoas[];
  tambem: PessoaContato[];
  empresa: { telefones: string[]; email?: string } | null;
  angulo: { titulo: string; texto: string } | null;
}

const NAME_RE = String.raw`\p{Lu}[\p{L}'.-]*(?:\s+(?:d[aeo]s?|e|\p{Lu}[\p{L}'.-]*))*`;
const EMAIL_SRC = String.raw`[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}`;
const PHONE_CHARS = String.raw`[\d\s/.\-·()+]`;

const PERSON_RE = new RegExp(
  `(${NAME_RE})\\s*\\(([^)]+)\\)\\s*:\\s*(\\d${PHONE_CHARS}*\\d)(?:\\s+(${EMAIL_SRC}))?`,
  "gu"
);
const NAME_ONLY_RE = new RegExp(`(${NAME_RE})\\s*\\(([^)]+)\\)`, "gu");
const EMAIL_RE = new RegExp(EMAIL_SRC, "u");

const HEADER_RE =
  /(👑|👔|📱|📞)?\s*(DECISOR(?:ES)?|GERENTES?(?:\s*\([^)]*\))?|EMPRESA|Também|Ângulo[^:|]*)\s*:/giu;

function splitPhones(raw: string): string[] {
  return raw
    .split(/\s*[/·]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripPipes(raw: string): string {
  return raw.replace(/\s*\|\s*/g, " ").trim();
}

export function parseComplementares(raw: string | null | undefined): ParsedComplementares {
  const empty: ParsedComplementares = {
    infoGeral: [],
    secoes: [],
    tambem: [],
    empresa: null,
    angulo: null,
  };
  if (!raw?.trim()) return empty;

  const text = raw.replace(/\r?\n/g, " ").replace(/[ \t]{2,}/g, " ").trim();
  const headers = [...text.matchAll(HEADER_RE)];

  const firstStart = headers[0]?.index ?? text.length;
  const infoGeral = text
    .slice(0, firstStart)
    .split(/\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const secoes: SecaoPessoas[] = [];
  const tambem: PessoaContato[] = [];
  let empresa: ParsedComplementares["empresa"] = null;
  let angulo: ParsedComplementares["angulo"] = null;

  headers.forEach((m, i) => {
    const icon = m[1];
    const label = m[2].trim();
    const start = (m.index ?? 0) + m[0].length;
    const end = headers[i + 1]?.index ?? text.length;
    const content = text.slice(start, end);

    if (/^EMPRESA$/i.test(label)) {
      const clean = stripPipes(content);
      const email = clean.match(EMAIL_RE)?.[0];
      const phonesRaw = email ? clean.replace(email, "") : clean;
      empresa = { telefones: splitPhones(phonesRaw), email };
      return;
    }

    if (/^Também$/i.test(label)) {
      const pessoas = [...content.matchAll(NAME_ONLY_RE)].map((pm) => ({
        nome: pm[1].trim(),
        cargo: pm[2].trim(),
        telefones: [] as string[],
      }));
      tambem.push(...pessoas);
      return;
    }

    if (/^Ângulo/i.test(label)) {
      angulo = { titulo: label, texto: stripPipes(content) };
      return;
    }

    const titulo = /^GERENTE/i.test(label)
      ? "Gerentes / Supervisores"
      : /^DECISOR/i.test(label)
        ? "Decisor"
        : label;

    const pessoas = [...content.matchAll(PERSON_RE)].map((pm) => ({
      nome: pm[1].trim(),
      cargo: pm[2].trim(),
      telefones: splitPhones(pm[3]),
      email: pm[4]?.trim(),
    }));

    if (pessoas.length > 0) {
      secoes.push({ titulo, icon, pessoas });
    }
  });

  return { infoGeral, secoes, tambem, empresa, angulo };
}
