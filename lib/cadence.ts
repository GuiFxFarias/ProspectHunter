export type LeadStatus =
  | "novo"
  | "em_cadencia"
  | "aguardando"
  | "reuniao_marcada"
  | "perdido";

export type InteractionResultado =
  | "nao_atendeu"
  | "ligar_depois"
  | "pedir_email"
  | "sem_interesse"
  | "reuniao_agendada";

/** Lead novo vs lead antigo (base de contatos), distinto do status do pipeline. */
export type LeadCategoria = "novo" | "antigo";

export interface Lead {
  id: string;
  empresa: string;
  contato_nome: string;
  telefone: string | null;
  email: string | null;
  /** CNPJ (importação de bases). */
  cnpj?: string | null;
  /** Descrição da atividade (ex.: planilha Receita). */
  descricao_atividade?: string | null;
  /** Matriz/filial, porte, faturamento, etc. */
  dados_complementares?: string | null;
  produto: string | null;
  status: LeadStatus;
  fase_cadencia: number;
  tentativas_no_dia: number;
  proxima_acao_em: string | null; // ISO string from Supabase
  owner_id?: string | null;
  origem?: "SDR" | "Indicacao" | "Prospeccao" | "Rebote";
  categoria_lead?: LeadCategoria | null;
  created_at: string;
  updated_at: string;
}

export interface CadenceUpdate {
  status?: LeadStatus;
  fase_cadencia?: number;
  tentativas_no_dia?: number;
  proxima_acao_em?: string | null;
}

// 0 = domingo, 1 = segunda, ..., 6 = sábado
function getNextWeekday(from: Date, targetWeekday: number): Date {
  const result = new Date(from);
  const current = result.getDay();
  let diff = targetWeekday - current;
  if (diff <= 0) {
    diff += 7;
  }
  result.setDate(result.getDate() + diff);
  return result;
}

export function initialCadenceState(): CadenceUpdate {
  const now = new Date().toISOString();
  return {
    status: "em_cadencia",
    fase_cadencia: 1,
    tentativas_no_dia: 0,
    proxima_acao_em: now,
  };
}

export function applyCallResultado(
  lead: Lead,
  resultado: InteractionResultado
): CadenceUpdate {
  const now = new Date();

  switch (resultado) {
    case "nao_atendeu": {
      const tentativas = lead.tentativas_no_dia + 1;

      // Less than 3 attempts in the same day: schedule in 20 minutes
      if (tentativas < 3) {
        const next = new Date(now.getTime() + 20 * 60 * 1000);
        return {
          status: "em_cadencia",
          fase_cadencia: lead.fase_cadencia,
          tentativas_no_dia: tentativas,
          proxima_acao_em: next.toISOString(),
        };
      }

      // Exactly 3 attempts: reset count, increment cadence phase
      const nextFase = lead.fase_cadencia + 1;

      if (nextFase <= 3) {
        // Fase 1 = segunda, fase 2 = quarta, fase 3 = sexta
        const targetWeekdayMap: Record<number, number> = {
          1: 1, // segunda
          2: 3, // quarta
          3: 5, // sexta
        };
        const targetWeekday = targetWeekdayMap[nextFase];
        const nextDate = getNextWeekday(now, targetWeekday);

        return {
          status: "em_cadencia",
          fase_cadencia: nextFase,
          tentativas_no_dia: 0,
          proxima_acao_em: nextDate.toISOString(),
        };
      }

      // After phase 3, we lose the lead
      return {
        status: "perdido",
        fase_cadencia: nextFase,
        tentativas_no_dia: 0,
        proxima_acao_em: null,
      };
    }


    case "ligar_depois": {
      const next = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      return {
        status: lead.status === "perdido" ? "em_cadencia" : lead.status,
        fase_cadencia: lead.fase_cadencia,
        tentativas_no_dia: lead.tentativas_no_dia,
        proxima_acao_em: next.toISOString(),
      };
    }

    case "pedir_email": {
      // For MVP: mark as awaiting and stop automatic cadence.
      // "Pending email action" can be represented by this status
      // and the last interaction record.
      return {
        status: "aguardando",
        proxima_acao_em: null,
      };
    }

    case "sem_interesse": {
      return {
        status: "perdido",
        proxima_acao_em: null,
      };
    }

    case "reuniao_agendada": {
      // Quando marcar reunião, o lead entra em status de reunião marcada
      // e a próxima ação passa a ser a data da reunião (setada na API).
      return {
        status: "reuniao_marcada",
        proxima_acao_em: lead.proxima_acao_em,
        fase_cadencia: lead.fase_cadencia,
        tentativas_no_dia: lead.tentativas_no_dia,
      };
    }
  }
}

