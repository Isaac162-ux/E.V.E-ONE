import { useCallback, useEffect, useState } from "react"

import { getAccessLog } from "#/lib/auth.functions.ts"
import type {
  AccessEntry,
  AccessSummary,
  AuthUser,
} from "#/lib/auth.functions.ts"

/**
 * Vigilância de acessos: mostra o que o sistema registrou sobre tentativas de
 * entrar e sobre acessos recusados à área restrita.
 */

const KIND_LABEL: Record<string, string> = {
  login_ok: "ENTRADA AUTORIZADA",
  login_failed: "CREDENCIAL RECUSADA",
  login_blocked: "EXCESSO DE TENTATIVAS",
  restricted_denied: "ACESSO RESTRITO RECUSADO",
  session_rejected: "SESSÃO INVÁLIDA",
}

function kindTone(kind: string): string {
  if (kind === "login_ok") return "text-eve-ok border-eve-ok/40 bg-eve-ok/8"
  if (kind === "login_failed" || kind === "session_rejected") {
    return "text-destructive border-destructive/40 bg-destructive/8"
  }
  return "text-eve-amber border-eve-amber/40 bg-eve-amber/8"
}

function stamp(iso: string): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
}

export function AccessGate({
  area,
  onClose,
  onEnter,
}: {
  area: string
  onClose: () => void
  onEnter: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 px-4 backdrop-blur-md">
      <section className="eve-glass w-full max-w-sm rounded-2xl border border-eve-amber/50 p-5 shadow-[0_24px_80px_-48px_#ffd18a66]">
        <p className="font-mono text-[10px] tracking-[0.2em] text-eve-amber">
          ACESSO RESTRITO
        </p>
        <h2 className="mt-2 font-display text-lg font-semibold tracking-tight text-foreground">
          {area} exige credencial de administrador
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-eve-dim">
          As tentativas são registradas quando o banco de dados está disponível.
          Entre com a credencial de administrador para continuar.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEnter}
            className="rounded-sm bg-eve-signal px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-primary-foreground"
          >
            ENTRAR
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-eve-hair px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-eve-dim hover:text-foreground"
          >
            VOLTAR
          </button>
        </div>
      </section>
    </div>
  )
}

export function SecurityPanel({
  open,
  onClose,
  user,
  onSignOut,
}: {
  open: boolean
  onClose: () => void
  user: AuthUser | null
  onSignOut: () => void
}) {
  const [entries, setEntries] = useState<AccessEntry[]>([])
  const [summary, setSummary] = useState<AccessSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const result = await getAccessLog()
      if (!result.authorized) {
        setEntries([])
        setSummary(null)
        setNotice("Sessão encerrada. Entre de novo para ver o registro.")
        return
      }
      setEntries(result.entries)
      setSummary(result.summary)
      setNotice(null)
    } catch {
      setNotice(
        "O registro está indisponível. Verifique a conexão com o banco de dados e tente novamente.",
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let active = true
    void getAccessLog().then(
      (result) => {
        if (!active) return
        if (!result.authorized) {
          setEntries([])
          setSummary(null)
          setNotice("Sessão encerrada. Entre de novo para ver o registro.")
          return
        }
        setEntries(result.entries)
        setSummary(result.summary)
        setNotice(null)
      },
      () => {
        if (active)
          setNotice(
            "O registro está indisponível. Verifique a conexão com o banco de dados e tente novamente.",
          )
      },
    )
    return () => {
      active = false
    }
  }, [open])

  if (!open) return null

  return (
    <div className="eve-shell fixed inset-0 z-50 flex flex-col bg-background">
      <header className="eve-topbar flex shrink-0 flex-wrap items-center gap-3 border-b border-eve-hair px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-semibold tracking-[0.14em] text-foreground">
            VIGILÂNCIA DE ACESSOS
          </h2>
          <p className="mt-0.5 font-mono text-[10px] tracking-[0.16em] text-eve-dim">
            {user ? `ADMINISTRADOR: ${user.displayName}` : "SEM SESSÃO"} ·
            HORÁRIO LOCAL
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-sm border border-eve-hair px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-eve-dim hover:text-foreground disabled:opacity-40"
        >
          {loading || (!summary && !notice) ? "LENDO…" : "ATUALIZAR"}
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-sm border border-eve-amber/45 bg-eve-amber/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-eve-amber"
        >
          SAIR
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm border border-eve-hair px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-eve-dim hover:text-foreground"
        >
          FECHAR
        </button>
      </header>

      {notice && (
        <div className="shrink-0 border-b border-eve-hair bg-eve-panel-2/50 px-4 py-2">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-eve-dim">
            {notice}
          </p>
        </div>
      )}

      {summary && (
        <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-eve-hair px-4 py-3 sm:grid-cols-4">
          {[
            {
              label: "EVENTOS 24H",
              value: summary.total,
              tone: "text-foreground",
            },
            {
              label: "RECUSAS",
              value: summary.failed,
              tone: "text-destructive",
            },
            {
              label: "BLOQUEIOS",
              value: summary.blocked,
              tone: "text-eve-amber",
            },
            {
              label: "ÁREA RESTRITA",
              value: summary.denied,
              tone: "text-eve-amber",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-sm border border-eve-hair bg-eve-panel-2/40 px-3 py-2"
            >
              <p className="font-mono text-[9.5px] tracking-[0.18em] text-eve-dim">
                {item.label}
              </p>
              <p
                className={`mt-1 font-display text-xl font-semibold ${item.tone}`}
              >
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {entries.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-eve-dim">
            Nenhum evento registrado nas últimas leituras. Entradas aceitas,
            credenciais recusadas e acessos à área restrita aparecem aqui.
          </p>
        ) : (
          <ul className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-sm border border-eve-hair bg-eve-panel-2/30 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] ${kindTone(entry.kind)}`}
                  >
                    {KIND_LABEL[entry.kind] ?? entry.kind.toUpperCase()}
                  </span>
                  <span className="font-mono text-[10px] text-eve-dim">
                    {stamp(entry.createdAt)}
                  </span>
                  {entry.area && (
                    <span className="font-mono text-[10px] text-eve-dim">
                      ÁREA: {entry.area.toUpperCase()}
                    </span>
                  )}
                  {entry.origin && (
                    <span className="font-mono text-[10px] text-eve-dim">
                      ORIGEM {entry.origin}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[12.5px] text-foreground/85">
                  {entry.account
                    ? `Conta: ${entry.account}`
                    : "Conta não informada"}
                  {entry.detail ? ` — ${entry.detail}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
