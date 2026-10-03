import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"
import { DatabaseNotConfiguredError } from "#/db/index.ts"
import { revokeCurrentSession, sessionCookie } from "#/lib/auth.server.ts"

/** Saída: a sessão é revogada no servidor e o cookie é limpo no navegador. */
export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async () => {
        try {
          await revokeCurrentSession()
        } catch (error) {
          if (!(error instanceof DatabaseNotConfiguredError)) throw error
        }
        return Response.json(
          { ok: true },
          {
            status: 200,
            headers: {
              "Cache-Control": "no-store",
              "Set-Cookie": sessionCookie("", 0),
            },
          },
        )
      },
    },
  },
})
