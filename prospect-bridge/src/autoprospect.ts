import { onlyDigits } from "./config.js";
import {
  prospectExport,
  prospectResultParsed,
  consultaEmpresa,
  consultaPessoa,
  uniqJoin,
  type RegistryFilters,
} from "./datastone.js";
import { createLead, findLead } from "./appClient.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Regex pra achar cargo/CBO de TI entre os funcionários mapeados.
const TI_RE =
  /(analista de sistemas|tecnologia da informacao|desenvolvedor|programador|infraestrutura|banco de dados|suporte tecnic|gerente de ti|coordenador de ti|21[0-9]{4}|317[0-9]{3})/i;
const DECISOR_RE = /administrador|diretor|presidente|s[oó]cio/i;

export interface AutoProspectOpts {
  name: string; // termo obrigatório (busca parcial na razão social), ex.: "INDUSTRIA"
  estados?: string[];
  sector_codes?: string[];
  cnae_codes?: string[];
  receita_min?: number;
  receita_max?: number;
  quantity?: number;
  produto?: string;
}

/**
 * Pipeline completo, tudo dentro do bridge:
 * export ≤teto → parse CSV → por empresa: dedupe → consulta_empresa (decisor+empresa)
 * → consulta_pessoa (celular do decisor) → acha TI nos funcionários → create_lead.
 * Retorna só um resumo (os dados pesados ficam no servidor).
 */
export async function autoProspect(opts: AutoProspectOpts) {
  const quantity = opts.quantity ?? 10;

  const filtros: RegistryFilters = {
    name: opts.name,
    states: opts.estados,
    sector_codes: opts.sector_codes,
    cnae_codes: opts.cnae_codes,
    ...(opts.receita_min != null || opts.receita_max != null
      ? { revenues: [{ lower: opts.receita_min?.toString(), upper: opts.receita_max?.toString() }] }
      : {}),
  };

  // 1) dispara extração (pega mais que o alvo pra ter folga no dedupe)
  const job: any = await prospectExport(filtros, Math.max(quantity * 3, 30));
  const jobId = String(job?.id ?? job?._raw?.id ?? "");
  if (!jobId) throw new Error("Falha ao iniciar extração (sem job id).");

  // 2) polling até o CSV ficar pronto
  let parsed: any = null;
  for (let i = 0; i < 30; i++) {
    const r = await prospectResultParsed(jobId, 500);
    if (r.pronto) { parsed = r; break; }
    await sleep(2500);
  }
  if (!parsed) throw new Error(`Extração ${jobId} não ficou pronta a tempo.`);

  const rows: any[] = parsed.empresas ?? [];
  const criados: any[] = [];
  const ignorados: any[] = [];

  // 3) por empresa: enriquece e cria
  for (const row of rows) {
    if (criados.length >= quantity) break;
    const cnpj = onlyDigits(row.cnpj);
    if (cnpj.length !== 14) continue;

    try {
      const dup = await findLead({ cnpj });
      if (dup.length) { ignorados.push({ empresa: row.trading_name, motivo: "já é lead" }); continue; }
    } catch { /* segue mesmo se o dedupe falhar */ }

    let emp: any;
    try {
      emp = await consultaEmpresa(cnpj);
    } catch (e: any) {
      ignorados.push({ empresa: row.trading_name, motivo: `consulta falhou: ${e?.message}` });
      continue;
    }

    const decisores: any[] = emp.decisores ?? [];
    const admin =
      decisores.find((d) => DECISOR_RE.test(d.cargo || "") && d.cpf && onlyDigits(d.cpf).length <= 11) ??
      decisores.find((d) => d.cpf && onlyDigits(d.cpf).length <= 11);

    let decisorNome = emp.contato_nome;
    let decisorCargo = emp.contato_cargo;
    let celDecisor: string | null = null;
    let emailDecisor: string | null = null;

    if (admin?.cpf) {
      try {
        const p = await consultaPessoa(admin.cpf);
        decisorNome = p.nome ?? decisorNome;
        decisorCargo = admin.cargo ?? decisorCargo;
        celDecisor = p.telefone;
        emailDecisor = p.email;
      } catch { /* mantém dados da empresa */ }
    }

    const ti = (emp.funcionarios ?? []).find((f: any) => TI_RE.test(f.cargo || ""));

    const telefone = uniqJoin([celDecisor, emp.telefone]);
    const email = uniqJoin([emailDecisor, emp.email]);
    const dados = uniqJoin([
      emp.dados_complementares,
      celDecisor ? `📱 CELULAR DECISOR (${decisorNome}${decisorCargo ? " - " + decisorCargo : ""}): ${celDecisor}${emailDecisor ? " | " + emailDecisor : ""}` : null,
      `📞 EMPRESA: ${emp.telefone ?? "-"}`,
      ti ? `TI: ${ti.nome} (${ti.cargo})` : "TI: não mapeado no registro",
    ]);

    try {
      await createLead({
        empresa: emp.empresa ?? row.trading_name,
        contato_nome: `${decisorNome}${decisorCargo ? ` (${decisorCargo})` : ""}`,
        telefone,
        email,
        cnpj,
        produto: opts.produto,
        descricao_atividade: emp.descricao_atividade,
        dados_complementares: dados,
      });
      criados.push({
        empresa: emp.empresa ?? row.trading_name,
        cnpj,
        decisor: decisorNome,
        cargo: decisorCargo,
        cel_decisor: celDecisor,
        tel_empresa: emp.telefone,
        ti: ti ? `${ti.nome} (${ti.cargo})` : null,
        faturamento: (String(emp.dados_complementares).match(/Faturamento: ([^|]+)/)?.[1] ?? "").trim(),
      });
    } catch (e: any) {
      ignorados.push({ empresa: emp.empresa ?? row.trading_name, motivo: `create falhou: ${e?.message}` });
    }
  }

  return { job_id: jobId, criados: criados.length, ignorados: ignorados.length, leads: criados, ignorados_detalhe: ignorados };
}
