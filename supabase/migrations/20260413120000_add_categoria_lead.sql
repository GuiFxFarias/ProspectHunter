-- Classificação comercial: lead novo vs lead antigo (independente do status do pipeline).
alter table public.leads
  add column if not exists categoria_lead text not null default 'novo'
  check (categoria_lead in ('novo', 'antigo'));

comment on column public.leads.categoria_lead is 'novo = lead novo; antigo = lead antigo (base legada).';
