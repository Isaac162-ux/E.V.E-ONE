/**
 * Cliente de streaming da E.V.E.: lê o fluxo NDJSON de /api/eve.
 * Usado pela conversa e pela oficina de autoinspeção.
 */

export interface EveStreamTurn {
  role: "user" | "eve"
  text: string
  attachments?: { mediaType: string; data: string }[]
}

export type EveProviderId = "gemini" | "openrouter" | "groq"

export interface EveProviderOption {
  id: EveProviderId
  label: string
  model: string
  configured: boolean
}

export interface EveProviderCatalog {
  defaultProvider: EveProviderId
  providers: EveProviderOption[]
}

export interface EveStreamInput {
  turns: EveStreamTurn[]
  facts: string[]
  autonomy: string
  provider?: EveProviderId
  signal?: AbortSignal
}

export interface EveStreamHandlers {
  onDelta: (chunk: string) => void
  onUsage?: (tokens: number) => void
}

export interface EveStreamResult {
  text: string
  tokens: number
}

export async function loadEveProviders(signal?: AbortSignal): Promise<EveProviderCatalog> {
  const response = await fetch("/api/eve", { signal, cache: "no-store" })
  const payload = (await response.json().catch(() => null)) as
    | (Partial<EveProviderCatalog> & { error?: string })
    | null
  if (!response.ok || !payload || !Array.isArray(payload.providers)) {
    throw new Error(payload?.error ?? "Não foi possível carregar os provedores de IA.")
  }
  return {
    defaultProvider: payload.defaultProvider ?? "gemini",
    providers: payload.providers,
  }
}

export async function streamEve(
  input: EveStreamInput,
  handlers: EveStreamHandlers,
): Promise<EveStreamResult> {
  const response = await fetch("/api/eve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      provider: input.provider,
      turns: input.turns,
      facts: input.facts,
      autonomy: input.autonomy,
    }),
  })

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(payload?.error ?? "O núcleo cognitivo não respondeu.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let text = ""
  let tokens = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let event: { t?: string; v?: string; tokens?: number; message?: string }
      try {
        event = JSON.parse(trimmed)
      } catch {
        continue
      }

      if (event.t === "delta" && event.v) {
        text += event.v
        handlers.onDelta(event.v)
      } else if (event.t === "usage") {
        tokens = event.tokens ?? 0
        handlers.onUsage?.(tokens)
      } else if (event.t === "error") {
        throw new Error(event.message ?? "Fluxo interrompido.")
      }
    }
  }

  return { text, tokens }
}
