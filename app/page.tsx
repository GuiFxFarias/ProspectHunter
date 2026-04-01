"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Lead } from "@/lib/cadence";
import { LeadModal } from "@/components/LeadModal";

type StatusFilter = "todos" | Lead["status"] | "com_agenda";

function categorizeLeads(leads: Lead[]) {
  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth();
  const todayD = now.getDate();

  const overdue: Lead[] = [];
  const dueToday: Lead[] = [];
  const upcoming: Lead[] = [];

  for (const lead of leads) {
    if (!lead.proxima_acao_em) continue;
    if (lead.status === "perdido") continue;

    const d = new Date(lead.proxima_acao_em);

    if (d < now) {
      overdue.push(lead);
      continue;
    }

    const isToday =
      d.getFullYear() === todayY &&
      d.getMonth() === todayM &&
      d.getDate() === todayD;

    if (isToday) {
      dueToday.push(lead);
    } else {
      upcoming.push(lead);
    }
  }

  return { overdue, dueToday, upcoming };
}

export default function Home() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [ownerFilter, setOwnerFilter] = useState<string>("todos");
  const [owners, setOwners] = useState<{ id: string; nome: string | null }[]>(
    []
  );

  const loadLeads = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("proxima_acao_em", { ascending: true });

    if (error) {
      setError(error.message);
      setLeads([]);
    } else {
      setLeads((data as Lead[]) ?? []);
    }
    setLoading(false);
  };

  const refreshLeads = async () => {
    // Atualiza apenas a lista, sem mexer no loading global
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("proxima_acao_em", { ascending: true });

    if (error) {
      setError(error.message);
      setLeads([]);
    } else {
      setLeads((data as Lead[]) ?? []);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.push("/auth/login");
        return;
      }

      await loadLeads();

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nome");
      if (profiles) {
        setOwners(profiles as { id: string; nome: string | null }[]);
      }
    });
  }, [router]);

  const filteredLeads = leads.filter((lead) => {
    // Status filter
    if (statusFilter === "com_agenda") {
      if (lead.proxima_acao_em === null) return false;
    } else if (statusFilter !== "todos") {
      if (lead.status !== statusFilter) return false;
    }

    // Date range filter on proxima_acao_em
    if (dateFrom || dateTo) {
      if (!lead.proxima_acao_em) return false;
      const ts = new Date(lead.proxima_acao_em).getTime();

      if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        if (ts < from) return false;
      }

      if (dateTo) {
        const to = new Date(dateTo).getTime();
        if (ts > to) return false;
      }
    }

    // Owner filter
    if (ownerFilter !== "todos") {
      if (lead.owner_id !== ownerFilter) return false;
    }

    return true;
  });

  const { overdue, dueToday, upcoming } = categorizeLeads(filteredLeads);

  const totalPorFase = filteredLeads.reduce<Record<number, number>>(
    (acc, lead) => {
      acc[lead.fase_cadencia] = (acc[lead.fase_cadencia] || 0) + 1;
      return acc;
    },
    {}
  );

  const totalReunioesMarcadas = filteredLeads.filter(
    (l) => l.status === "reuniao_marcada"
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              Hunter Cadence System
            </h1>
            <p className="text-xs text-zinc-500">
              Pipeline de ligações com cadência estruturada.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/users"
              className="hidden rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 md:inline-flex"
            >
              Usuários
            </Link>
            <Link
              href="/leads/new"
              className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800"
            >
              + Novo lead
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            Erro ao carregar leads: {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <span className="h-4 w-4 animate-spin rounded-full border-[1.5px] border-zinc-300 border-t-zinc-700" />
            <span>Carregando leads...</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="font-medium text-zinc-800">
                    Atrasados: {overdue.length}
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="font-medium text-zinc-800">
                    Hoje: {dueToday.length}
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="font-medium text-zinc-800">
                    Próximos: {upcoming.length}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as StatusFilter)
                    }
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  >
                    <option value="todos">Todos</option>
                    <option value="em_cadencia">Em cadência</option>
                    <option value="aguardando">Aguardando</option>
                    <option value="reuniao_marcada">Agenda marcada</option>
                    <option value="perdido">Perdido</option>
                    <option value="novo">Novo</option>
                    <option value="com_agenda">Com próxima ação</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">Próxima ação entre:</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-32 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                  <span className="text-zinc-500">e</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-32 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                  {(dateFrom || dateTo) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDateFrom("");
                        setDateTo("");
                      }}
                      className="text-[11px] text-zinc-500 hover:text-zinc-800"
                    >
                      Limpar datas
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">Responsável:</span>
                  <select
                    value={ownerFilter}
                    onChange={(e) => setOwnerFilter(e.target.value)}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  >
                    <option value="todos">Todos</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome || `User ${o.id.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
                <p className="text-[11px] font-medium text-zinc-500">
                  Total de leads no filtro
                </p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">
                  {filteredLeads.length}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
                <p className="text-[11px] font-medium text-zinc-500">
                  Agendas marcadas
                </p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">
                  {totalReunioesMarcadas}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs md:col-span-2">
                <p className="text-[11px] font-medium text-zinc-500">
                  Distribuição por fase
                </p>
                <div className="mt-2 flex gap-2">
                  {Object.entries(totalPorFase)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([fase, qtde]) => (
                      <div
                        key={fase}
                        className="flex-1 rounded-md bg-zinc-50 px-2 py-1"
                      >
                        <p className="text-[10px] text-zinc-500">
                          Fase {fase}
                        </p>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-200">
                          <div
                            className="h-1.5 rounded-full bg-zinc-900"
                            style={{
                              width: `${
                                filteredLeads.length > 0
                                  ? (qtde / filteredLeads.length) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs font-medium text-zinc-900">
                          {qtde}
                        </p>
                      </div>
                    ))}
                  {Object.keys(totalPorFase).length === 0 && (
                    <p className="text-[11px] text-zinc-500">
                      Nenhum lead para exibir por fase.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white/90 shadow-sm backdrop-blur">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-2">Contato feito</th>
                    <th className="px-4 py-2">Empresa</th>
                    <th className="px-4 py-2">Contato</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Fase</th>
                    <th className="px-4 py-2">Tentativas hoje</th>
                    <th className="px-4 py-2">Próxima ação</th>
                    <th className="px-4 py-2">Origem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-[11px] text-zinc-800">
                  {(statusFilter === "com_agenda"
                    ? [...overdue, ...dueToday, ...upcoming]
                    : filteredLeads
                  ).map((lead) => {
                    const proxima = lead.proxima_acao_em
                      ? new Date(lead.proxima_acao_em).toLocaleString()
                      : "—";

                    let categoria: string;
                    if (!lead.proxima_acao_em) {
                      categoria = "Sem próxima ação";
                    } else if (overdue.includes(lead)) {
                      categoria = "Atrasado";
                    } else if (dueToday.includes(lead)) {
                      categoria = "Hoje";
                    } else if (upcoming.includes(lead)) {
                      categoria = "Próximo";
                    } else {
                      categoria = "Outro";
                    }

                    return (
                      <tr
                        key={lead.id}
                        className="cursor-pointer transition hover:bg-zinc-50/80"
                        onClick={() => {
                          setSelectedLead(lead);
                          setModalOpen(true);
                        }}
                      >
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-3 w-3 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLead(lead);
                              setModalOpen(true);
                            }}
                          />
                        </td>
                        <td className="px-4 py-2 font-medium text-zinc-900">
                          {lead.empresa}
                        </td>
                        <td className="px-4 py-2 text-zinc-700">
                          {lead.contato_nome}
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium capitalize text-zinc-700">
                            {lead.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-2">{lead.fase_cadencia}</td>
                        <td className="px-4 py-2">
                          {lead.tentativas_no_dia}
                        </td>
                        <td className="px-4 py-2 text-zinc-700">{proxima}</td>
                        <td className="px-4 py-2">
                          <span className="inline-flex rounded-full bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-700">
                            {lead.origem || "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredLeads.length === 0 && (
                      <tr>
                        <td
                          className="px-4 py-4 text-center text-xs text-zinc-500"
                          colSpan={8}
                        >
                          Nenhum lead com ação agendada.
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <LeadModal
        lead={selectedLead}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={refreshLeads}
        onLeadUpdated={(updated) =>
          setLeads((current) =>
            current.map((l) => (l.id === updated.id ? { ...l, ...updated } : l))
          )
        }
        onLeadDeleted={(id) =>
          setLeads((current) => current.filter((l) => l.id !== id))
        }
      />
    </div>
  );
}

