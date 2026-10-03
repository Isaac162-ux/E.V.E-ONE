# E.V.E. REN

Console de inteligência assistida com conversa em streaming, seleção explícita de provedor, leitura de imagens, voz do navegador, sessões e memória curada. O núcleo de IA e as integrações externas ficam em uma API FastAPI separada; o app web encaminha as chamadas pelo servidor para manter credenciais fora do navegador.

## Arquitetura de APIs

```text
Navegador → app web /api/eve → FastAPI /v1 → provedor escolhido
                                      └────→ conectores externos
```

### Provedores de IA

| Provedor | Variáveis | Modelo |
|---|---|---|
| Google AI Studio · Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` (slug exato) |
| Groq | `GROQ_API_KEY` | `GROQ_MODEL` |

O seletor na conversa lista quais provedores estão configurados. Cada chamada vai somente ao provedor escolhido; a API não faz fallback silencioso entre empresas. Modelos e capacidades disponíveis variam por conta e mudam com o tempo. Escolha o identificador atualmente habilitado na conta. Para imagens, escolha um modelo com suporte a visão.

### Conectores de dados

- BrasilAPI: consulta de CEP e CNPJ.
- SPTrans Olho Vivo: pesquisa de linhas e paradas e previsão de ônibus em São Paulo. Este conector cobre ônibus; não fornece dados de metrô.
- Google Maps Platform: geocodificação e cálculo de rotas. A chave deve ter as APIs necessárias habilitadas no projeto Google Cloud.

Os conectores têm módulos próprios em `backend/eve_api/integrations/` e são registrados no catálogo. APIs governamentais adicionais podem entrar como módulos e rotas da mesma camada; os endpoints de INSS, Receita Federal e TCU não estão implementados nesta versão.

## Executar localmente

Pré-requisitos: Python 3.10+, Node.js compatível com Vite 8 e pnpm 10. Na primeira execução:

```powershell
Copy-Item backend\.env.example backend\.env
python -m venv backend\.venv
backend\.venv\Scripts\python -m pip install -r backend\requirements.txt
```

Gere um token interno aleatório:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Cole o mesmo token como `EVE_API_TOKEN` em `backend\.env` e `EVE_FASTAPI_API_KEY` em um arquivo `.dev.vars` na raiz. Nesse arquivo da raiz, inclua também:

```dotenv
EVE_FASTAPI_BASE_URL=http://127.0.0.1:8000
EVE_FASTAPI_API_KEY=use-o-mesmo-token-de-EVE_API_TOKEN
```

Você pode começar pelo modelo incluído: `Copy-Item .dev.vars.example .dev.vars`; depois substitua o valor de exemplo pelo token gerado.

Preencha em `backend\.env` ao menos um provedor de IA. Para Google AI Studio, por exemplo:

```dotenv
EVE_API_TOKEN=cole-o-token-interno-gerado
EVE_DEFAULT_PROVIDER=gemini
GEMINI_API_KEY=cole-sua-chave-do-ai-studio
GEMINI_MODEL=gemini-3.8-flash
```

As credenciais opcionais para conectores são `SPTRANS_API_TOKEN` e `GOOGLE_MAPS_API_KEY`. A BrasilAPI não exige chave.

Abra dois terminais na raiz do repositório. Inicie o backend no primeiro:

```powershell
backend\.venv\Scripts\python -m uvicorn eve_api.app:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

Inicie o app web no segundo:

```powershell
pnpm install --frozen-lockfile
pnpm run dev:local
```

Abra <http://127.0.0.1:13007>. A documentação interativa do FastAPI fica em <http://127.0.0.1:8000/docs> e o health check em <http://127.0.0.1:8000/health>. As rotas `/v1/*` exigem o cabeçalho `X-EVE-API-KEY`; a rota `/health` é pública. Reinicie os dois processos depois de alterar as variáveis.

## Rotas FastAPI

Todas as rotas abaixo, exceto `/health`, exigem `X-EVE-API-KEY`.

| Método | Rota | Uso |
|---|---|---|
| `GET` | `/v1/providers` | Lista provedores e modelos configurados sem expor chaves |
| `POST` | `/v1/chat` | Streaming NDJSON com `provider`, turnos, fatos e anexos |
| `GET` | `/v1/utilities` | Catálogo de integrações e estado das credenciais |
| `GET` | `/v1/utilities/cep/{cep}` | CEP via BrasilAPI |
| `GET` | `/v1/utilities/cnpj/{cnpj}` | CNPJ via BrasilAPI |
| `GET` | `/v1/utilities/sptrans/lines?term=...` | Pesquisa de linhas de ônibus |
| `GET` | `/v1/utilities/sptrans/stops?term=...` | Pesquisa de paradas |
| `GET` | `/v1/utilities/sptrans/stops/{codigo}/arrivals` | Previsões na parada |
| `GET` | `/v1/utilities/maps/geocode?address=...` | Geocodificação |
| `POST` | `/v1/utilities/maps/routes` | Cálculo de rota |

## Outros recursos e limites atuais

| Recurso | Estado |
|---|---|
| Análise de imagens | Passa anexos ao provedor escolhido; compatibilidade depende do modelo |
| Ditado e leitura em voz alta | Usa recursos de voz disponíveis no navegador |
| Sessões, fatos e propostas | Salvos no armazenamento local deste navegador |
| Login e oficina | Exigem banco de dados |
| Pesquisa web, execução isolada e automação externa | Ainda não conectados |
| E-mail, Google Agenda, Notion, WhatsApp, Telegram, Letta, Hermes Agent e ElevenLabs | Ainda não integrados |

## Banco de dados e Cloudflare

O login administrativo precisa de `DATABASE_URL` no servidor ou do binding Cloudflare Hyperdrive chamado `HYPERDRIVE`. Para desenvolvimento, adicione `DATABASE_URL` ao `.dev.vars` da raiz. Para criar/aplicar o esquema local:

```powershell
$env:DATABASE_URL = "postgres://usuario:senha@localhost:5432/eve"
pnpm db:generate
pnpm db:migrate
```

Em produção, hospede o FastAPI em um serviço acessível pelo app web e configure `EVE_FASTAPI_BASE_URL` e `EVE_FASTAPI_API_KEY` como segredos no servidor web. Não use `127.0.0.1` como URL entre serviços implantados. Configure no backend os segredos do provedor e dos conectores necessários. Não publique `.dev.vars`, `.env` ou valores de credenciais em commits, logs ou variáveis `VITE_*`.

## GitHub Codespaces

O repositório inclui `.devcontainer/devcontainer.json` com Node 22, Python 3.12 e encaminhamento privado das portas `13000` (site) e `8000` (FastAPI). Configure os valores antes de abrir o Codespace, em **Settings → Secrets and variables → Codespaces**. Esses são secrets de desenvolvimento do Codespaces, separados dos secrets do GitHub Actions.

Crie `EVE_API_TOKEN` e `EVE_FASTAPI_API_KEY` com o mesmo valor. Adicione ao menos uma chave entre `GEMINI_API_KEY`, `OPENROUTER_API_KEY` e `GROQ_API_KEY`. Se escolher OpenRouter, informe também `OPENROUTER_MODEL`; `GEMINI_MODEL` e `GROQ_MODEL` podem substituir os modelos padrão. Para os conectores opcionais, use `SPTRANS_API_TOKEN` e `GOOGLE_MAPS_API_KEY`.

No terminal do Codespace, instale as dependências uma vez:

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
npm install -g pnpm@10.33.4
pnpm install --frozen-lockfile
```

Inicie cada serviço em seu próprio terminal:

```bash
backend/.venv/bin/uvicorn eve_api.app:app --app-dir backend --reload --host 0.0.0.0 --port 8000
```

```bash
pnpm dev
```

Abra a porta `13000` na aba **Ports** para usar o console e a porta `8000` com `/docs` para testar a API. Mantenha ambas privadas. Se cadastrar ou alterar secrets depois de criar o Codespace, pare e reinicie-o para carregar os novos valores. No Codespaces, os secrets viram variáveis de ambiente; não é necessário criar `.dev.vars`.

## Privacidade

As mensagens recentes, fatos de memória e imagens da conversa são enviados ao provedor escolhido para gerar a resposta. Cada integração externa recebe somente os parâmetros da própria consulta. As chaves ficam no backend e nunca são enviadas ao bundle do navegador. Sessões e memória curada continuam guardadas no `localStorage` deste navegador, sem sincronização entre dispositivos.
