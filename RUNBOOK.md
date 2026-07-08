# RUNBOOK — Prospecção com IA (ProspectHunter + prospect-bridge + Data Stone)

Passo a passo pra colocar a integração pra rodar. São duas metades:
- **App** (Next.js) — já existente + a rota nova `app/api/datastone/webhook/route.ts`
- **Bridge** (`prospect-bridge/`) — MCP server que o Claude/Cowork usa

O enriquecimento da Data Stone é **assíncrono**: os contatos voltam por webhook,
que só funciona com o app **público**. Por isso: primeiro um teste local (valida
Supabase + API), depois o deploy (fecha o fluxo com contatos).

---

## 0. Pré-requisitos (uma vez)

- Node 18+ instalado
- Um usuário no Auth do Supabase pra ser o dono dos leads (o "prospector")
  - Supabase → Authentication → Users → Add user (email + senha)
  - **Use uma senha forte e única** (não reaproveite senha pessoal)
- Chave da Data Stone (formato `Token ds_...`)

---

## PARTE A — Teste local (sem deploy)

Valida `search_companies`, `find_lead` e `create_lead`. O `enrich_company` dispara,
mas os contatos NÃO voltam local (webhook não alcança localhost). É esperado.

### A1. Subir o app
```bash
cd "CAMINHO/ProspectHunter"
npm install
npm run dev
# app em http://localhost:3000
```

### A2. Preparar o bridge
```bash
cd "CAMINHO/ProspectHunter/prospect-bridge"
# apaga a node_modules parcial que o sandbox deixou (se existir)
rm -rf node_modules package-lock.json      # Windows: rmdir /s /q node_modules
npm install
copy .env.example .env                      # Windows (ou: cp .env.example .env)
npm run build
```

### A3. Preencher o `.env` do bridge (modo local)
```
APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJ.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
PROSPECTOR_EMAIL=voce@statum.com.br
PROSPECTOR_PASSWORD=senha-forte
DATASTONE_BASE_URL=https://api.datastone.com.br
DATASTONE_API_KEY=Token ds_xxxxx
# no teste local pode deixar em branco; enrich só será testado em produção
DATASTONE_WEBHOOK_URL=
```

### A4. Registrar o bridge no Claude/Cowork
No `claude_desktop_config.json` (ou config de MCP do Cowork):
```json
{
  "mcpServers": {
    "prospect-bridge": {
      "command": "node",
      "args": ["CAMINHO/ABSOLUTO/ProspectHunter/prospect-bridge/dist/index.js"]
    }
  }
}
```
> As variáveis já vêm do `.env` no build. Se preferir, pode repetí-las em `"env": {...}` aqui.

Reinicie o Claude/Cowork. As tools `search_companies`, `enrich_company`,
`find_lead`, `create_lead`, `log_interaction` devem aparecer.

### A5. Testar
Peça no chat, por exemplo:
- "search_companies estado SP, setor supermercado, porte 51-200"
- "cria um lead de teste: empresa X, cnpj Y"

Confira no Supabase (Table editor → `leads`) se o lead nasceu com `status`,
`fase_cadencia` e `owner_id` preenchidos. ✅ fiação validada.

---

## PARTE B — Produção (fluxo completo com contatos)

### B1. Variáveis no host do app (Vercel → Settings → Environment Variables)
```
SUPABASE_SERVICE_ROLE_KEY = <service role do Supabase>   # server-only, NUNCA NEXT_PUBLIC
DATASTONE_WEBHOOK_SECRET  = <um segredo qualquer, ex.: um UUID>
```
> A service role está em Supabase → Project Settings → API → `service_role` secret.

### B2. Deploy (inclui a rota nova do webhook)
```bash
cd "CAMINHO/ProspectHunter"
git add .
git commit -m "feat: webhook Data Stone + prospect-bridge"
git push        # Vercel builda e publica
```
Pegue a URL de produção na Vercel (aba Domains), ex.: `https://prospecthunter.vercel.app`.

### B3. Apontar o bridge pra produção (`.env`)
```
APP_BASE_URL=https://prospecthunter.vercel.app
DATASTONE_WEBHOOK_URL=https://prospecthunter.vercel.app/api/datastone/webhook?token=<MESMO DATASTONE_WEBHOOK_SECRET>
```
Rebuild: `npm run build`

### B4. Teste de fogo
1. `enrich_company` num CNPJ real (gasta 1 crédito).
2. Vercel → Logs → procure `[datastone webhook] payload:` (segundos depois).
3. Confira o lead no Supabase: `telefone` / `email` / `contato_nome` preenchidos.

### B5. Calibrar o mapeamento (1x)
Se algum campo vier vazio, compare o payload logado com a função `mapEnriched`
em `app/api/datastone/webhook/route.ts` e ajuste os caminhos (ex.: `telefones`,
`socios`, `cnae_principal`). Me manda o log que eu ajusto.

---

## Fluxo final (quando tudo estiver ligado)
```
"Prospecta a empresa X"
  → pesquiso na web (setor, sinais de IA, ângulo)
  → find_lead (dedupe)
  → create_lead (empresa + resumo em dados_complementares)
  → enrich_company (dispara Data Stone)
  → webhook preenche telefone/e-mail/contato sozinho
```

---

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| `enrich` retorna 404 | base URL errada | tire/ponha o `/v1` em `DATASTONE_BASE_URL` |
| `401` no webhook | token não bate | `?token=` do `DATASTONE_WEBHOOK_URL` = `DATASTONE_WEBHOOK_SECRET` |
| Contatos não chegam | webhook não alcança o app | app precisa estar público (não localhost) |
| `Faltam ... SERVICE_ROLE` | var ausente na Vercel | adicione `SUPABASE_SERVICE_ROLE_KEY` |
| Lead não encontrado no webhook | CNPJ salvo em formato diferente | crie o lead via bridge (salva em dígitos) antes do enrich |
| `Usuário não autenticado` no create_lead | login do prospector falhou | confira `PROSPECTOR_EMAIL` / `PROSPECTOR_PASSWORD` |

## Segurança
- Nunca comite o `.env` (já está no `.gitignore`).
- `service_role` e token da Data Stone só no ambiente do host — nunca no client.
- Troque a senha do prospector e considere rotacionar o token da Data Stone.
