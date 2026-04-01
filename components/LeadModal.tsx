import React, { useEffect, useState } from "react";
import type { Lead, InteractionResultado } from "@/lib/cadence";
import { supabase } from "@/lib/supabase";

interface LeadModalProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onLeadUpdated?: (lead: Lead) => void;
  onLeadDeleted?: (id: string) => void;
}

const RESULTADOS: { value: InteractionResultado; label: string }[] = [
  { value: "nao_atendeu", label: "Não atendeu" },
  { value: "ligar_depois", label: "Ligar depois" },
  { value: "pedir_email", label: "Pedir e-mail" },
  { value: "reuniao_agendada", label: "Reunião agendada" },
  { value: "sem_interesse", label: "Sem interesse" },
];

export const LeadModal: React.FC<LeadModalProps> = ({
  lead,
  open,
  onClose,
  onSaved,
  onLeadUpdated,
  onLeadDeleted,
}) => {
  const [resultado, setResultado] = useState<InteractionResultado>("nao_atendeu");
  const [observacao, setObservacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<
    {
      id: string;
      tipo: string;
      resultado: string;
      observacao: string | null;
      created_at: string;
      fase_cadencia_no_momento: number | null;
      tentativas_no_dia_no_momento: number | null;
    }[]
  >([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editFase, setEditFase] = useState<number | null>(null);
  const [editTentativas, setEditTentativas] = useState<number | null>(null);
  const [savingCadence, setSavingCadence] = useState(false);
  const [customNextAction, setCustomNextAction] = useState<string>("");
  const [meetingDateTime, setMeetingDateTime] = useState<string>("");
  const [editingLead, setEditingLead] = useState(false);
  const [editEmpresa, setEditEmpresa] = useState("");
  const [editContato, setEditContato] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editProduto, setEditProduto] = useState("");
  const [editOrigem, setEditOrigem] = useState<
    "SDR" | "Indicacao" | "Prospeccao" | "Rebote" | ""
  >("");
  const [savingLead, setSavingLead] = useState(false);
  const [deletingLead, setDeletingLead] = useState(false);

  useEffect(() => {
    if (!lead || !open) return;

    setEditingLead(false);
    setEditFase(lead.fase_cadencia);
    setEditTentativas(lead.tentativas_no_dia);
    setEditEmpresa(lead.empresa);
    setEditContato(lead.contato_nome);
    setEditTelefone(lead.telefone ?? "");
    setEditEmail(lead.email ?? "");
    setEditProduto(lead.produto ?? "");
    setEditOrigem(((lead as any).origem as any) ?? "");
    if (lead.proxima_acao_em) {
      const d = new Date(lead.proxima_acao_em);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setCustomNextAction(local);
      setMeetingDateTime(local);
    } else {
      setCustomNextAction("");
      setMeetingDateTime("");
    }

    const loadHistory = async () => {
      setLoadingHistory(true);
      const { data } = await supabase
        .from("interactions")
        .select(
          "id, tipo, resultado, observacao, created_at, fase_cadencia_no_momento, tentativas_no_dia_no_momento"
        )
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false });

      setHistory(
        (data as any[])?.map((row) => ({
          id: row.id,
          tipo: row.tipo,
          resultado: row.resultado,
          observacao: row.observacao,
          created_at: row.created_at,
          fase_cadencia_no_momento: row.fase_cadencia_no_momento ?? null,
          tentativas_no_dia_no_momento:
            row.tentativas_no_dia_no_momento ?? null,
        })) ?? []
      );
      setLoadingHistory(false);
    };

    loadHistory();
  }, [lead, open]);

  const handleSaveLead = async () => {
    if (!lead) return;
    setSavingLead(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: session?.access_token
            ? `Bearer ${session.access_token}`
            : "",
        },
        body: JSON.stringify({
          empresa: editEmpresa,
          contato_nome: editContato,
          telefone: editTelefone,
          email: editEmail,
          produto: editProduto,
          origem: editOrigem || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao atualizar lead");
      }

      setEditingLead(false);
      const updatedLead: Lead = {
        ...lead,
        empresa: editEmpresa,
        contato_nome: editContato,
        telefone: editTelefone || null,
        email: editEmail || null,
        produto: editProduto || null,
      };
      onLeadUpdated?.(updatedLead);
      await onSaved();
    } catch (err: any) {
      setError(err.message || "Erro ao atualizar lead");
    } finally {
      setSavingLead(false);
    }
  };

  const handleDeleteLead = async () => {
    if (!lead) return;
    if (!window.confirm("Tem certeza que deseja excluir este lead?")) return;

    setDeletingLead(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "DELETE",
        headers: {
          Authorization: session?.access_token
            ? `Bearer ${session.access_token}`
            : "",
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao excluir lead");
      }

      onClose();
      onLeadDeleted?.(lead.id);
      await onSaved();
    } catch (err: any) {
      setError(err.message || "Erro ao excluir lead");
    } finally {
      setDeletingLead(false);
    }
  };
  const handleUpdateCadence = async () => {
    if (!lead || editFase == null || editTentativas == null) return;
    setSavingCadence(true);
    setError(null);

    try {
      const { error } = await supabase
        .from("leads")
        .update({
          fase_cadencia: editFase,
          tentativas_no_dia: editTentativas,
        })
        .eq("id", lead.id);

      if (error) {
        throw new Error(error.message);
      }

      await onSaved();
    } catch (err: any) {
      setError(err.message || "Erro ao atualizar cadência");
    } finally {
      setSavingCadence(false);
    }
  };


  if (!open || !lead) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/interactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: session?.access_token
            ? `Bearer ${session.access_token}`
            : "",
        },
        body: JSON.stringify({
          leadId: lead.id,
          resultado,
          observacao,
          proximaAcaoEm:
            resultado === "ligar_depois" && customNextAction
              ? new Date(customNextAction).toISOString()
              : resultado === "reuniao_agendada" && meetingDateTime
              ? new Date(meetingDateTime).toISOString()
              : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao registrar interação");
      }

      setObservacao("");
      setResultado("nao_atendeu");
      await onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Erro ao registrar interação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white px-6 py-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-zinc-900">
              Detalhes do lead
            </h2>
            {editingLead ? (
              <div className="mt-2 grid gap-2 text-[11px] text-zinc-700 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="font-medium text-zinc-800">Empresa</label>
                  <input
                    type="text"
                    value={editEmpresa}
                    onChange={(e) => setEditEmpresa(e.target.value)}
                    className="w-full rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-zinc-800">Contato</label>
                  <input
                    type="text"
                    value={editContato}
                    onChange={(e) => setEditContato(e.target.value)}
                    className="w-full rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-zinc-800">Telefone</label>
                  <input
                    type="text"
                    value={editTelefone}
                    onChange={(e) => setEditTelefone(e.target.value)}
                    className="w-full rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-zinc-800">E-mail</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="font-medium text-zinc-800">Produto</label>
                  <input
                    type="text"
                    value={editProduto}
                    onChange={(e) => setEditProduto(e.target.value)}
                    className="w-full rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="font-medium text-zinc-800">Origem</label>
                  <select
                    value={editOrigem}
                    onChange={(e) =>
                      setEditOrigem(
                        e.target.value as
                          | "SDR"
                          | "Indicacao"
                          | "Prospeccao"
                          | "Rebote"
                          | ""
                      )
                    }
                    className="w-full rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
                  >
                    <option value="">(sem alteração)</option>
                    <option value="SDR">SDR</option>
                    <option value="Indicacao">Indicação</option>
                    <option value="Prospeccao">Prospecção</option>
                    <option value="Rebote">Rebote</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={handleSaveLead}
                    disabled={savingLead}
                    className="mt-2 inline-flex rounded-md bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                  >
                    {savingLead ? "Salvando lead..." : "Salvar lead"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-1 text-xs text-zinc-600">{lead.empresa}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {lead.contato_nome}
                  {lead.email && (
                    <>
                      {" · "}
                      <span className="underline decoration-dotted">
                        {lead.email}
                      </span>
                    </>
                  )}
                  {lead.telefone && (
                    <>
                      {" · "}
                      <span>{lead.telefone}</span>
                    </>
                  )}
                  {lead.produto && (
                    <>
                      {" · "}
                      <span className="italic text-zinc-600">
                        Produto: {lead.produto}
                      </span>
                    </>
                  )}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setEditingLead((prev) => !prev)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {editingLead ? "Cancelar edição" : "Editar lead"}
            </button>
            <button
              type="button"
              onClick={handleDeleteLead}
              disabled={deletingLead}
              className="rounded-md border border-red-200 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {deletingLead ? "Excluindo..." : "Excluir lead"}
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3 text-xs text-zinc-500">
            <div className="space-y-1">
              <span className="block">
                Status: {lead.status}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <span>Fase:</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={editFase ?? ""}
                    onChange={(e) =>
                      setEditFase(
                        e.target.value === "" ? null : Number(e.target.value)
                      )
                    }
                    className="h-6 w-14 rounded border border-zinc-300 px-1 text-xs text-zinc-900"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span>Tentativas hoje:</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={editTentativas ?? ""}
                    onChange={(e) =>
                      setEditTentativas(
                        e.target.value === "" ? null : Number(e.target.value)
                      )
                    }
                    className="h-6 w-16 rounded border border-zinc-300 px-1 text-xs text-zinc-900"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleUpdateCadence}
                disabled={
                  savingCadence || editFase == null || editTentativas == null
                }
                className="mt-2 rounded bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {savingCadence ? "Salvando..." : "Atualizar cadência"}
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-800">
                Resultado
              </label>
              <select
                value={resultado}
                onChange={(e) =>
                  setResultado(e.target.value as InteractionResultado)
                }
                className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              >
                {RESULTADOS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {resultado === "ligar_depois" && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-800">
                  Quando ligar de novo
                </label>
                <input
                  type="datetime-local"
                  value={customNextAction}
                  onChange={(e) => setCustomNextAction(e.target.value)}
                  className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
                <p className="text-[11px] text-zinc-500">
                  Se você não preencher, o sistema usa automaticamente daqui 2 horas.
                </p>
              </div>
            )}

            {resultado === "reuniao_agendada" && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-800">
                  Data e hora da reunião
                </label>
                <input
                  type="datetime-local"
                  value={meetingDateTime}
                  onChange={(e) => setMeetingDateTime(e.target.value)}
                  className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
                <p className="text-[11px] text-zinc-500">
                  Essa data será usada como próxima ação e o lead ficará com status de reunião marcada.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-800">
                Observação
              </label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={4}
                className="block w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="Notas rápidas da ligação..."
              />
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex-1 space-y-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
              <h3 className="text-[11px] font-medium text-zinc-800">
                Histórico de interações
              </h3>
              {loadingHistory ? (
                <p className="text-[11px] text-zinc-500">
                  Carregando histórico...
                </p>
              ) : history.length === 0 ? (
                <p className="text-[11px] text-zinc-500">
                  Nenhuma interação registrada ainda.
                </p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto pr-1 text-[11px]">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="rounded border border-zinc-200 bg-white px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-zinc-800">
                          {item.tipo} · {item.resultado}
                        </span>
                        <span className="text-[10px] text-zinc-800">
                          {new Date(item.created_at).toLocaleString()}
                        </span>
                      </div>
                      {(item.fase_cadencia_no_momento != null ||
                        item.tentativas_no_dia_no_momento != null) && (
                        <p className="mt-0.5 text-[10px] text-zinc-500">
                          {item.fase_cadencia_no_momento != null && (
                            <span>Fase {item.fase_cadencia_no_momento}</span>
                          )}
                          {item.fase_cadencia_no_momento != null &&
                            item.tentativas_no_dia_no_momento != null && (
                              <span> · </span>
                            )}
                          {item.tentativas_no_dia_no_momento != null && (
                            <span>
                              Tentativas no dia:{" "}
                              {item.tentativas_no_dia_no_momento}
                            </span>
                          )}
                        </p>
                      )}
                      {item.observacao && (
                        <p className="mt-1 text-[11px] text-zinc-700">
                          {item.observacao}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
};

