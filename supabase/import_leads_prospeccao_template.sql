-- =============================================================================
-- Importação de leads (planilha CNPJ / razão social / telefones / e-mails)
-- ProHunter / Hunter Cadence
-- =============================================================================
--
-- ANTES DE RODAR:
-- 1) Aplique as migrations (inclui colunas cnpj, descricao_atividade, dados_complementares).
-- 2) Substitua OWNER_UUID abaixo pelo id do usuário em auth.users (dono dos leads).
--    Ex.: select id, email from auth.users;
--
-- CONVENÇÃO DE MÚLTIPLOS TELEFONES / E-MAILS NO MESMO CAMPO:
--   Use o separador " | " (pipe com espaço) entre valores.
--   Ex.: '11 39014563 | 11 99566120'
--   Ex.: 'vendas@empresa.com.br | contato@empresa.com.br'
-- A tela do sistema quebra por " | ", ";" ou quebra de linha e lista cada item.
--
-- CAMPOS:
--   empresa              = Razão social
--   contato_nome         = Nome do contato (na planilha só empresa → use "—" ou "Prospecção")
--   telefone             = Todos fixos + celulares concatenados com " | "
--   email                = Todos os e-mails com " | "
--   cnpj                 = Coluna CNPJ
--   descricao_atividade  = Descrição da atividade
--   dados_complementares = Matriz/filial, data abertura + faturamento, porte (texto livre)
--   produto              = opcional (deixe null na importação se não usar)
--
-- =============================================================================

begin;

-- Substitua este UUID:
-- \set owner_id 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'  -- (só psql)

insert into public.leads (
  empresa,
  contato_nome,
  telefone,
  email,
  cnpj,
  descricao_atividade,
  dados_complementares,
  produto,
  origem,
  categoria_lead,
  status,
  fase_cadencia,
  tentativas_no_dia,
  proxima_acao_em,
  owner_id
) values
-- Exemplo 1: um telefone e um e-mail (BENTO & CIA LTDA – dados ilustrativos)
(
  'BENTO & CIA LTDA',
  'Prospecção',
  '11 39014563',
  'vendas@bentocia.com.br',
  '00.412.493/0010-11',
  'Transporte rodoviário de carga, exceto produtos perigosos e mudanças, intermunicipal, interestadual e internacional.',
  'MATRIZ · Abertura/faturamento: 20/12/2012 – DE R$ 1 MILHÃO ATÉ R$ 5 MILHÕES · Porte: DE 50 A 99 FUNCIONÁRIOS',
  null,
  'Prospeccao',
  'antigo',
  'em_cadencia',
  1,
  0,
  now(),
  'REPLACE_WITH_YOUR_USER_UUID'::uuid
),
-- Exemplo 2: vários telefones e e-mails (CONSUGE AGROPECUARIA LTDA – dados ilustrativos)
(
  'CONSUGE AGROPECUARIA LTDA',
  'Prospecção',
  '34 32315635 | 34 32174509 | 34 32150257 | 34 991283416 | 34 995164223 | 34 993371455',
  'consuge@terra.com.br | breno_negri@terra.com.br | lydia@consuge.com.br',
  null,
  'Serviços advocatícios (exemplo – ajuste conforme sua planilha).',
  'MATRIZ · Porte e faturamento conforme planilha',
  null,
  'Prospeccao',
  'antigo',
  'em_cadencia',
  1,
  0,
  now(),
  'REPLACE_WITH_YOUR_USER_UUID'::uuid
);

commit;

-- Para gerar mais linhas a partir do Excel/Sheets:
-- - Exporte CSV com UTF-8.
-- - Monte cada linha VALUES (...) com strings entre aspas simples; aspas internas duplicadas ('').
-- - Ou use uma planilha + script (Node/Python) que gera este INSERT a partir das colunas.
