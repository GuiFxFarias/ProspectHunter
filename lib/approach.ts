// Guia de abordagem da Statum AI Journey — por setor (vertical) e por persona.
// Objetivo da ligação: QUALIFICAR (dor/momento/decisor) + AGENDAR um diagnóstico.

export interface PersonaGuia {
  persona: string;
  abertura: string;
  perguntas: string[];
  gancho: string;
  cta: string;
}

export function detectVertical(desc: string | null | undefined): {
  label: string;
  angulo: string;
} {
  const d = (desc || "").toLowerCase();
  if (/superm|varej|mercad|atacad/.test(d))
    return {
      label: "Supermercado / Varejo",
      angulo:
        "IA em previsão de demanda, precificação, prevenção de perdas e ruptura de estoque.",
    };
  if (/usina|a[çc]ú?car|etanol|[áa]lcool|cana/.test(d))
    return {
      label: "Usina / Sucroenergético",
      angulo: "IA em planejamento de safra, produção agroindustrial, manutenção e previsão.",
    };
  if (/fertiliz|adubo|defensivo|semente|agropecu|agr[íi]cola|\bagro/.test(d))
    return {
      label: "Agro / Insumos",
      angulo: "IA em previsão de demanda, formulação, logística e relacionamento com o produtor.",
    };
  if (/hospital|cl[íi]nic|sa[úu]de|m[ée]dic|farmac/.test(d))
    return {
      label: "Saúde",
      angulo: "IA em fluxo de atendimento, agendamento, faturamento e gestão de leitos.",
    };
  if (/ensino|educa|faculdade|universi|escola/.test(d))
    return {
      label: "Ensino",
      angulo: "IA em captação de alunos, redução de evasão e automação da secretaria.",
    };
  if (/sab[ãa]o|detergente|qu[íi]mic|tinta|verniz|fertiliz/.test(d))
    return {
      label: "Indústria Química",
      angulo: "IA em formulação, controle de qualidade, previsão de demanda e produção.",
    };
  if (/aliment|frigor[íi]f|bebida|latic[íi]n/.test(d))
    return {
      label: "Indústria de Alimentos",
      angulo: "IA em produção, previsão de demanda, redução de perdas e trade marketing.",
    };
  if (/m[áa]quin|implement|metal|forja|autope[çc]|f[áa]brica|ind[úu]str|pl[áa]stic|embalag|cer[âa]mic|t[êe]xtil|tecel/.test(d))
    return {
      label: "Indústria / Manufatura",
      angulo:
        "IA em chão de fábrica, qualidade, manutenção preditiva, previsão de demanda e redução de perdas.",
    };
  return {
    label: "Empresa",
    angulo: "IA aplicada a um processo real da operação — automação, uso de dados e eficiência.",
  };
}

export function guiaPorCargo(cargo: string | null | undefined): PersonaGuia {
  const c = (cargo || "").toLowerCase();

  if (/administrador|s[óo]cio|presidente|diretor|proprietari/.test(c))
    return {
      persona: "Dono / Diretor (decisor)",
      abertura:
        "Sei que seu tempo é curto, então vou direto: a gente ajuda empresas do seu porte a finalmente colocar IA pra rodar em UM processo real, com resultado medível — sem virar projeto eterno.",
      perguntas: [
        "Hoje vocês já usam algo de IA na operação, ou ainda é tudo no manual/planilha?",
        "Qual processo mais te tira o sono em tempo ou custo?",
        "Essa decisão de testar algo novo é só sua ou tem mais alguém envolvido?",
      ],
      gancho:
        "A Statum AI Journey pega um processo hoje manual e transforma em IA rodando de verdade — em semanas, não em anos.",
      cta: "Faz sentido marcarmos 30 minutos pra eu te mostrar, com um caso parecido com o seu, onde daria pra começar? Sem compromisso.",
    };

  if (/\bti\b|tecnologia|sistemas|inform[áa]tica|dados/.test(c))
    return {
      persona: "TI / Sistemas (aliado técnico)",
      abertura:
        "Te liguei porque vocês estão avaliando IA e eu queria entender o lado técnico com quem entende — como estão os sistemas e os dados hoje.",
      perguntas: [
        "Quais sistemas vocês usam (ERP, planilhas, algo próprio)?",
        "Os dados da operação estão organizados/acessíveis ou espalhados?",
        "Já tentaram algo de IA/automação antes? O que travou?",
      ],
      gancho: "A gente implementa IA integrando com o que já existe (inclusive legado), sem obrigar a trocar tudo.",
      cta: "Posso marcar uma call técnica rápida pra olharmos a arquitetura e ver o que é viável primeiro?",
    };

  if (/comercial|vendas|marketing/.test(c))
    return {
      persona: "Comercial / Vendas",
      abertura:
        "Trabalho com IA aplicada ao comercial — te liguei porque dá pra vender mais com o mesmo time usando IA.",
      perguntas: [
        "Como vocês decidem hoje quais clientes priorizar / o que repor?",
        "A previsão de demanda é no feeling ou tem método?",
        "Onde o time comercial mais perde tempo?",
      ],
      gancho: "IA em previsão de demanda e priorização de clientes costuma ser o primeiro ganho rápido e visível.",
      cta: "Te mostro num diagnóstico como ficaria pra vocês — 30 minutos, topa?",
    };

  if (/financ|administrativ|contabil|controlad|\badm\b/.test(c))
    return {
      persona: "Financeiro / Administrativo",
      abertura: "A gente tira da mão da equipe aquele monte de processo administrativo repetitivo, usando IA.",
      perguntas: [
        "Quais tarefas administrativas consomem mais tempo da equipe?",
        "Tem muito retrabalho ou conferência manual?",
        "O que já quiseram automatizar e não conseguiram?",
      ],
      gancho: "Normalmente o primeiro processo que automatizamos com IA já libera horas da equipe no primeiro mês.",
      cta: "Posso te mostrar num diagnóstico rápido onde daria pra começar aí? 30 minutos.",
    };

  if (/produ|opera|log[íi]stic|almoxarif|suprim|compras|estoque|qualidade|manuten/.test(c))
    return {
      persona: "Produção / Operações",
      abertura:
        "Trabalho com IA no chão de fábrica e na operação — dá pra reduzir perda e parada usando os dados que vocês já geram.",
      perguntas: [
        "Onde vocês mais perdem (retrabalho, parada de máquina, estoque)?",
        "Os apontamentos de produção são no papel/Excel ou num sistema?",
        "Manutenção hoje é corretiva ou preditiva?",
      ],
      gancho: "IA em previsão (demanda, manutenção) e qualidade costuma dar retorno rápido na operação.",
      cta: "Marca 30 minutos comigo que eu te mostro onde começaria na sua operação?",
    };

  return {
    persona: "Contato",
    abertura: "A gente ajuda empresas do seu porte a colocar IA pra rodar num processo real, com resultado medível.",
    perguntas: [
      "Como funciona hoje esse processo na sua área?",
      "Onde vocês mais sentem dor de tempo ou custo?",
      "Quem seria a pessoa certa pra falar sobre isso aí dentro?",
    ],
    gancho: "A Statum AI Journey transforma um processo manual em IA rodando de verdade.",
    cta: "Consigo te mostrar num diagnóstico de 30 minutos — topa marcar?",
  };
}
