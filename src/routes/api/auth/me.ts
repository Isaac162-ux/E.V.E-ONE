import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"
import { DatabaseNotConfiguredError } from "#/db/index.ts"
import { getCurrentUser } from "#/lib/auth.server.ts"

/** Checagem direta de sessão por HTTP, sem passar por função de servidor. */
export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const user = await getCurrentUser()
          return Response.json(
            { user },
            { status: 200, headers: { "Cache-Control": "no-store" } },
          )
        } catch (error) {
          if (!(error instanceof DatabaseNotConfiguredError)) throw error
          return Response.json(
            { user: null, error: "Autenticação sem banco configurado." },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          )
        }
      },
    },
  },
})
