-- Campos para importação de bases (planilha CNPJ / razão social / atividade / metadados).
alter table public.leads
  add column if not exists cnpj text;

alter table public.leads
  add column if not exists descricao_atividade text;

alter table public.leads
  add column if not exists dados_complementares text;

comment on column public.leads.cnpj is 'CNPJ formatado ou só dígitos; importação de bases.';
comment on column public.leads.descricao_atividade is 'Descrição da atividade (Receita Federal / prospecção).';
comment on column public.leads.dados_complementares is 'Texto livre: matriz/filial, porte, faturamento, data abertura, etc.';
