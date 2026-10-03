import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"
import { z } from "zod"

const attachmentSchema = z.object({
  mediaType: z.string().min(3).max(60),
  data: z.string().min(16).max(12_000_000),
})

const turnSchema = z.object({
  role: z.enum(["user", "eve"]),
  text: z.string().max(20_000),
  attachments: z.array(attachmentSchema).max(4).optional(),
})

const requestSchema = z.object({
  provider: z.enum(["gemini", "openrouter", "groq"]).optional(),
  turns: z.array(turnSchema).min(1).max(40),
  facts: z.array(z.string().max(240)).max(60).default([]),
  autonomy: z.string().max(40).default("A1"),
})

async function readSecret(key: string): Promise<string> {
  if (typeof process !== "undefined" && process.env?.[key]) {
    return process.env[key] as string
  }
  try {
    const workers = await import("cloudflare:workers")
    const value = (workers.env as Record<string, string | undefined>)[key]
    if (value) return value
  } catch {
    // Fora do runtime de Workers não há binding para consultar.
  }
  throw new Error(`Credencial ausente no servidor: ${key}`)
}

async function apiConfig() {
  const [baseUrl, apiKey] = await Promise.all([
    readSecret("EVE_FASTAPI_BASE_URL"),
    readSecret("EVE_FASTAPI_API_KEY"),
  ])
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey }
}

async function configurationError() {
  return Response.json(
    {
      error:
        "A API FastAPI da E.V.E. não está configurada. Defina EVE_FASTAPI_BASE_URL e EVE_FASTAPI_API_KEY no servidor e reinicie o app.",
      code: "FASTAPI_NOT_CONFIGURED",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}

export const Route = createFileRoute("/api/eve")({
  server: {
    handlers: {
      GET: async () => {
        let config: Awaited<ReturnType<typeof apiConfig>>
        try {
          config = await apiConfig()
        } catch {
          return configurationError()
        }
        try {
          const upstream = await fetch(`${config.baseUrl}/v1/providers`, {
            headers: { "X-EVE-API-KEY": config.apiKey },
            cache: "no-store",
          })
          const body = await upstream.text()
          return new Response(body, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
              "Cache-Control": "no-store",
            },
          })
        } catch {
          return Response.json(
            { error: "Não foi possível alcançar a API FastAPI da E.V.E." },
            { status: 502, headers: { "Cache-Control": "no-store" } },
          )
        }
      },
      POST: async ({ request }) => {
        let parsed: z.infer<typeof requestSchema>
        try {
          parsed = requestSchema.parse(await request.json())
        } catch {
          return Response.json(
            { error: "Pedido inválido." },
            { status: 400, headers: { "Cache-Control": "no-store" } },
          )
        }

        let config: Awaited<ReturnType<typeof apiConfig>>
        try {
          config = await apiConfig()
        } catch {
          return configurationError()
        }

        let manifest = ""
        try {
          const selfModule = await import("#/lib/eve/self.server.ts")
          manifest = await selfModule.sourceManifest()
        } catch {
          manifest = ""
        }

        let upstream: Response
        try {
          upstream = await fetch(`${config.baseUrl}/v1/chat`, {
            method: "POST",
            headers: {
              "X-EVE-API-KEY": config.apiKey,
              "Content-Type": "application/json",
              Accept: "application/x-ndjson",
            },
            body: JSON.stringify({ ...parsed, manifest }),
            signal: request.signal,
            cache: "no-store",
          })
        } catch {
          return Response.json(
            { error: "Não foi possível alcançar o núcleo cognitivo FastAPI." },
            { status: 502, headers: { "Cache-Control": "no-store" } },
          )
        }

        if (!upstream.ok || !upstream.body) {
          let message = `A API FastAPI recusou a chamada (${upstream.status}).`
          try {
            const payload = (await upstream.json()) as { detail?: unknown; error?: unknown }
            if (typeof payload.detail === "string") message = payload.detail
            else if (typeof payload.error === "string") message = payload.error
          } catch {
            // O servidor upstream pode responder sem JSON.
          }
          return Response.json(
            { error: message },
            { status: upstream.status >= 500 ? upstream.status : 502, headers: { "Cache-Control": "no-store" } },
          )
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store, no-transform",
            "X-Accel-Buffering": "no",
          },
        })
      },
    },
  },
})
