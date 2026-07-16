"use client";

import React, { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface Match {
  cnpj: string | number;
  razao_social: string;
  nome_fantasia?: string;
  group_cnae?: string;
  uf?: string;
  city?: string;
}
interface Pessoa {
  nome: string;
  cargo: string;
  cpf: string | null;
}
interface Empresa {
  cnpj: string;
  empresa: string;
  contato_nome: string;
  contato_cargo: string | null;
  decisores: Pessoa[];
  gerentes: Pessoa[];
  telefone_empresa: string | null;
  email_empresa: string | null;
  descricao_atividade: string | null;
  faturamento: string | null;
  local: string | null;
  porte: string | null;
  situacao: string | null;
}
interface Contato {
  nome: string;
  telefone: string | null;
  email: string | null;
  profissao: string | null;
}

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}
async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Erro");
  return json.data ?? json;
}

const Spinner: React.FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
    {children}
  </span>
);

export default function ProspectPage() {
  const [razao, setRazao] = useState("");
  const [uf, setUf] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [contatos, setContatos] = useState<Record<string, Contato>>({});
  const [loading, setLoading] = useState<string>("");
  const [erro, setErro] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  const buscar = async () => {
    if (!razao.trim()) return;
    setErro(""); setMsg(""); setEmpresa(null); setMatches([]); setLoading("busca");
    try {
      const data = await api<Match[]>("/api/prospect/search", { razao_social: razao, uf: uf || undefined });
      setMatches(data);
      if (!data.length) setMsg("Nenhuma empresa encontrada. Tente variar o nome ou o estado.");
    } catch (e: any) { setErro(e.message); } finally { setLoading(""); }
  };

  const abrir = async (cnpj: string | number) => {
    setErro(""); setMsg(""); setContatos({}); setLoading("empresa");
    try {
      const data = await api<Empresa>("/api/prospect/company", { cnpj: String(cnpj) });
      setEmpresa(data);
    } catch (e: any) { setErro(e.message); } finally { setLoading(""); }
  };

  const pegarCelular = async (cpf: string) => {
    setErro(""); setLoading("cpf:" + cpf);
    try {
      const data = await api<Contato>("/api/prospect/person", { cpf });
      setContatos((c) => ({ ...c, [cpf]: data }));
    } catch (e: any) { setErro(e.message); } finally { setLoading(""); }
  };

  const criarLead = async () => {
    if (!empresa) return;
    setErro(""); setMsg(""); setLoading("lead");
    try {
      const enriquecidos = Object.values(contatos);
      const telefones = [
        ...enriquecidos.map((c) => c.telefone),
        empresa.telefone_empresa,
      ];
      const emails = [
        ...enriquecidos.map((c) => c.email),
        empresa.email_empresa,
      ];
      const linhaPessoa = (p: Pessoa, tag: string) => {
        const ct = p.cpf ? contatos[p.cpf] : undefined;
        const contato = ct ? ` — 📱 ${ct.telefone ?? ""}${ct.email ? " · " + ct.email : ""}` : "";
        return `${tag} ${p.nome} (${p.cargo})${contato}`;
      };
      const dados = [
        empresa.local, empresa.faturamento ? `Fat ${empresa.faturamento}` : null, empresa.descricao_atividade,
        ...empresa.decisores.map((d) => linhaPessoa(d, "👑")),
        ...empresa.gerentes.map((g) => linhaPessoa(g, "👔")),
        empresa.telefone_empresa ? `📞 EMPRESA: ${empresa.telefone_empresa}` : null,
      ].filter(Boolean).join(" | ");

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({
          empresa: empresa.empresa,
          contato_nome: `${empresa.contato_nome}${empresa.contato_cargo ? ` (${empresa.contato_cargo})` : ""}`,
          telefone: Array.from(new Set(telefones.filter(Boolean))).join(" | "),
          email: Array.from(new Set(emails.filter(Boolean))).join(" | "),
          cnpj: empresa.cnpj,
          produto: "Statum AI Journey",
          descricao_atividade: empresa.descricao_atividade,
          dados_complementares: dados,
          origem: "Prospeccao",
          categoria_lead: "novo",
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao criar lead");
      setMsg(`✅ Lead "${empresa.empresa}" criado com sucesso!`);
    } catch (e: any) { setErro(e.message); } finally { setLoading(""); }
  };

  const PessoaCard = ({ p, tag }: { p: Pessoa; tag: string }) => {
    const ct = p.cpf ? contatos[p.cpf] : undefined;
    return (
      <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-800">
            <span aria-hidden>{tag}</span>{" "}
            <span className="font-medium text-zinc-900">{p.nome}</span>
            <span className="text-zinc-500"> · {p.cargo}</span>
          </p>
          {p.cpf && !ct && (
            <button
              onClick={() => pegarCelular(p.cpf!)}
              disabled={loading === "cpf:" + p.cpf}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              {loading === "cpf:" + p.cpf ? <Spinner className="h-3 w-3" /> : "📱"} Pegar celular
            </button>
          )}
        </div>
        {ct && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            {ct.telefone && (
              <a
                href={`tel:${ct.telefone.replace(/\D/g, "")}`}
                className="text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-800"
              >
                {ct.telefone}
              </a>
            )}
            {ct.email && (
              <a
                href={`mailto:${ct.email}`}
                className="break-all text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-800"
              >
                {ct.email}
              </a>
            )}
          </div>
        )}
      </div>
    );
  };

  const buscaVazia = matches.length === 0 && !empresa && !msg && !erro && loading !== "busca";

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Prospectar empresa</h1>
            <p className="text-xs text-zinc-500">
              Busque por razão social e crie um lead com decisores e gerentes.
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            ← voltar aos leads
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1 space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Razão social ou nome
              </label>
              <input
                value={razao}
                onChange={(e) => setRazao(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscar()}
                placeholder="ex.: Agrobiotech"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div className="w-20 space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                UF
              </label>
              <input
                value={uf}
                onChange={(e) => setUf(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && buscar()}
                placeholder="opcional"
                maxLength={2}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm uppercase text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <button
              onClick={buscar}
              disabled={loading === "busca" || !razao.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading === "busca" && <Spinner className="h-4 w-4" />}
              Buscar
            </button>
          </div>
        </div>

        {erro && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}
        {msg && (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {msg}
          </div>
        )}

        {buscaVazia && (
          <div className="mt-10 text-center text-sm text-zinc-400">
            Busque uma empresa pelo nome ou razão social para começar.
          </div>
        )}

        {matches.length > 0 && !empresa && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-zinc-500">
              {matches.length} resultado{matches.length === 1 ? "" : "s"} encontrado
              {matches.length === 1 ? "" : "s"}
              {matches.length > 25 ? " (mostrando os 25 primeiros)" : ""}
            </p>
            <ul className="space-y-2">
              {matches.slice(0, 25).map((m) => (
                <li key={String(m.cnpj)}>
                  <button
                    onClick={() => abrir(m.cnpj)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-zinc-300 hover:shadow"
                  >
                    <span>
                      <span className="block text-sm font-medium text-zinc-900">
                        {m.razao_social}
                      </span>
                      {m.nome_fantasia && (
                        <span className="block text-[11px] text-zinc-500">{m.nome_fantasia}</span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {m.group_cnae && <Pill>{m.group_cnae}</Pill>}
                      {(m.city || m.uf) && <Pill>{[m.city, m.uf].filter(Boolean).join("/")}</Pill>}
                      <span className="text-zinc-400">→</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading === "empresa" && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 shadow-sm">
            <Spinner className="h-4 w-4" /> Consultando empresa...
          </div>
        )}

        {empresa && (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">{empresa.empresa}</h2>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {empresa.local && <Pill>{empresa.local}</Pill>}
                  {empresa.faturamento && <Pill>Fat {empresa.faturamento}</Pill>}
                  {empresa.situacao && <Pill>{empresa.situacao}</Pill>}
                </div>
                {empresa.descricao_atividade && (
                  <p className="mt-2 text-[11px] leading-snug text-zinc-600">
                    {empresa.descricao_atividade}
                  </p>
                )}
              </div>
              <button
                onClick={() => setEmpresa(null)}
                className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Trocar
              </button>
            </div>

            <div className="mt-4 space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                👑 Decisores
              </h3>
              <div className="space-y-1.5">
                {empresa.decisores.length > 0 ? (
                  empresa.decisores.map((d, i) => <PessoaCard key={i} p={d} tag="👑" />)
                ) : (
                  <p className="text-[11px] text-zinc-400">Nenhum decisor mapeado.</p>
                )}
              </div>
            </div>

            {empresa.gerentes.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  👔 Gerentes / Supervisores
                </h3>
                <div className="space-y-1.5">
                  {empresa.gerentes.map((g, i) => <PessoaCard key={i} p={g} tag="👔" />)}
                </div>
              </div>
            )}

            {(empresa.telefone_empresa || empresa.email_empresa) && (
              <div className="mt-4 space-y-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  📞 Empresa
                </h3>
                <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 shadow-sm">
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                    {empresa.telefone_empresa && (
                      <a
                        href={`tel:${empresa.telefone_empresa.replace(/\D/g, "")}`}
                        className="text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-800"
                      >
                        {empresa.telefone_empresa}
                      </a>
                    )}
                    {empresa.email_empresa && (
                      <a
                        href={`mailto:${empresa.email_empresa}`}
                        className="break-all text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-800"
                      >
                        {empresa.email_empresa}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={criarLead}
              disabled={loading === "lead"}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
            >
              {loading === "lead" && <Spinner className="h-4 w-4" />}
              Criar lead no ProspectHunter
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
