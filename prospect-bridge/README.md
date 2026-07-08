# prospect-bridge

MCP server que liga a pesquisa de prospecção do Cowork/Claude ao **ProspectHunter**
(Next.js + Supabase) e à **Data Stone** (dados B2B).

## Fluxo

```
pesquiso a empresa (web)
      │  cnpj
      ▼
create_lead ──────────────► grava lead + resumo no Supabase (via /api/leads)
      │
      ▼
enrich_company (cnpj) ─────► Data Stone (ASSÍNCRONO) → responde 202
                                   │
                    (segundos depois, webhook)
                                   ▼
      /api/datastone/webhook ◄──── Data Stone entrega telefones/e-mails/sócios
                                   │
                                   ▼
                            PATCH no lead (contato, telefone, e-mail)
```

Os contatos **não voltam na hora** — o enrich da Data Stone é assíncrono e entrega
o resultado no webhook. Por isso a integração tem duas metades: o **MCP server**
(dispara) e a **rota `/api/datastone/webhook`** no app (recebe e grava).

## Ferramentas (MCP)

| Tool | O que faz |
|---|---|
| `search_companies({estados, setores, tamanhos_empresa, receita_*, ...})` | Descoberta síncrona de empresas por filtros. Firmografia, sem contatos. |
| `enrich_company({cnpj})` | Dispara enriquecimento (assíncrono). Contatos chegam no webhook. |
| `find_lead({cnpj?, empresa?})` | Checa duplicidade antes de criar. |
| `create_lead({...})` | Cria lead via `/api/leads` (cadência + owner_id automáticos). |
| `log_interaction({leadId, resultado, ...})` | Registra interação via `/api/interactions`. |

## Setup

### 1. MCP server (esta pasta)
```bash
cd prospect-bridge
# apague a node_modules parcial deixada pelo sandbox, se existir
npm install
cp .env.example .env    # preencha (veja abaixo)
npm run build
```

`.env` do bridge:
- `APP_BASE_URL` — URL do app (produção, ex.: https://prospecthunter.vercel.app)
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `PROSPECTOR_EMAIL` / `PROSPECTOR_PASSWORD` — usuário Supabase dono dos leads
- `DATASTONE_BASE_URL` (se der 404, teste com/sem `/v1`) / `DATASTONE_API_KEY` (`Token ds_...`)
- `DATASTONE_WEBHOOK_URL` — `https://SEU-DOMINIO/api/datastone/webhook?token=SEGREDO`

### 2. App (rota do webhook — já criada em `app/api/datastone/webhook/route.ts`)
Adicione no ambiente do app (Vercel):
- `SUPABASE_SERVICE_ROLE_KEY` — service role (server-only, NUNCA `NEXT_PUBLIC_`)
- `DATASTONE_WEBHOOK_SECRET` — mesmo `SEGREDO` usado na `DATASTONE_WEBHOOK_URL`

### 3. Registrar o MCP no Claude/Cowork
```json
{
  "mcpServers": {
    "prospect-bridge": {
      "command": "node",
      "args": ["CAMINHO/ABSOLUTO/prospect-bridge/dist/index.js"],
      "env": { "APP_BASE_URL": "...", "NEXT_PUBLIC_SUPABASE_URL": "...", "...": "..." }
    }
  }
}
```

## Calibrar o mapeamento (1x)
Rode um `enrich_company` real; o webhook loga o payload no console (Vercel logs).
Confira os campos e ajuste `mapEnriched` em `app/api/datastone/webhook/route.ts`
(e o espelho em `src/datastone.ts`) se algum caminho estiver diferente.
