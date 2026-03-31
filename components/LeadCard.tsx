import React from "react";
import type { Lead } from "@/lib/cadence";

interface LeadCardProps {
  lead: Lead;
  onClick: () => void;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return date.toLocaleString();
}

function statusColor(status: Lead["status"]): string {
  switch (status) {
    case "em_cadencia":
      return "bg-blue-100 text-blue-800";
    case "aguardando":
      return "bg-yellow-100 text-yellow-800";
    case "reuniao_marcada":
      return "bg-emerald-100 text-emerald-800";
    case "perdido":
      return "bg-red-100 text-red-800";
    case "novo":
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export const LeadCard: React.FC<LeadCardProps> = ({ lead, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            {lead.empresa}
          </p>
          <p className="text-xs text-zinc-600">{lead.contato_nome}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(
            lead.status
          )}`}
        >
          {lead.status}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
        <span>Próxima ação: {formatDateTime(lead.proxima_acao_em)}</span>
        {lead.fase_cadencia && (
          <span>Fase: {lead.fase_cadencia} · Tentativas hoje: {lead.tentativas_no_dia}</span>
        )}
      </div>
    </button>
  );
};

