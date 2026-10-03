import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import {
  SessionRail,
  StateCore,
  StatePill,
  SystemRail,
} from "#/components/ui/eve/panels.tsx"
import { AccessGate, SecurityPanel } from "#/components/ui/eve/security.tsx"
import { Workshop } from "#/components/ui/eve/workshop.tsx"
import { MAX_ATTACHMENTS, useEve } from "#/hooks/use-eve.ts"
import { noteAreaAttempt } from "#/lib/auth.functions.ts"
import {
  loadEveProviders,
  type EveProviderId,
  type EveProviderOption,
} from "#/lib/eve/client.ts"
import {
  type EveAttachment,
  type EveMessage,
} from "#/lib/eve/core.ts"

export const Route = createFileRoute("/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { painel?: "oficina" | "seguranca" } => ({
    painel:
      search.painel === "oficina" || search.painel === "seguranca"
        ? search.painel
        : undefined,
  }),
  component: ConsolePage,
})

const SUGGESTIONS = [
  "Mostre seu próprio código e explique como você funciona por dentro",
  "Proponha uma melhoria no seu código de interface e me explique o risco",
  "Monte um plano de 30 dias para organizar minhas finanças pessoais",
  "Analise a imagem que eu anexar e liste os riscos visíveis",
]

function formatClock(value: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function inlineFormat(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let index = 0
  let match = pattern.exec(text)

  while (match !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    if (token.startsWith("**")) {
      nodes.push(
        <strong
          key={`${keyPrefix}-b${index}`}
          className="font-semibold text-foreground"
        >
          {token.slice(2, -2)}
        </strong>,
      )
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-c${index}`}
          className="rounded-sm border border-eve-hair bg-eve-panel-2 px-1 py-px font-mono text-[12px] text-eve-signal"
        >
          {token.slice(1, -1)}
        </code>,
      )
    }
    last = match.index + token.length
    index += 1
    match = pattern.exec(text)
  }

  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function RichText({ text }: { text: string }) {
  const nodes: ReactNode[] = []
  const lines = text.split("\n")
  let index = 0
  let key = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (trimmed.startsWith("```")) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      nodes.push(
        <pre
          key={`code-${key++}`}
          className="my-2 overflow-x-auto rounded-sm border border-eve-hair bg-eve-panel-2 p-3 font-mono text-[12px] leading-relaxed text-foreground/85"
        >
          <code>{code.join("\n")}</code>
        </pre>,
      )
      continue
    }

    if (trimmed === "") {
      index += 1
      continue
    }

    if (/^-{3,}$/.test(trimmed)) {
      nodes.push(<hr key={`hr-${key++}`} className="my-3 border-eve-hair" />)
      index += 1
      continue
    }

    if (/^#{1,4}\s/.test(trimmed)) {
      nodes.push(
        <h4
          key={`h-${key++}`}
          className="mt-3 mb-1 font-display text-[13px] font-semibold tracking-wide text-foreground"
        >
          {inlineFormat(trimmed.replace(/^#{1,4}\s*/, ""), `h${key}`)}
        </h4>,
      )
      index += 1
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""))
        index += 1
      }
      nodes.push(
        <ul
          key={`ul-${key++}`}
          className="my-2 space-y-1.5 border-l border-eve-hair pl-3"
        >
          {items.map((item, position) => (
            <li key={position} className="text-[13.5px] leading-relaxed">
              {inlineFormat(item, `ul${key}-${position}`)}
            </li>
          ))}
        </ul>,
      )
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ""))
        index += 1
      }
      nodes.push(
        <ol
          key={`ol-${key++}`}
          className="my-2 list-decimal space-y-1.5 pl-5 marker:font-mono marker:text-[11px] marker:text-eve-signal"
        >
          {items.map((item, position) => (
            <li key={position} className="text-[13.5px] leading-relaxed">
              {inlineFormat(item, `ol${key}-${position}`)}
            </li>
          ))}
        </ol>,
      )
      continue
    }

    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\d+[.)]\s+/.test(lines[index]) &&
      !/^#{1,4}\s/.test(lines[index].trim()) &&
      !lines[index].trim().startsWith("```")
    ) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    nodes.push(
      <p key={`p-${key++}`} className="text-[13.5px] leading-relaxed">
        {inlineFormat(paragraph.join(" "), `p${key}`)}
      </p>,
    )
  }

  return <div className="space-y-1.5 text-foreground/90">{nodes}</div>
}

function MessageBlock({ message }: { message: EveMessage }) {
  if (message.role === "user") {
    return (
      <article className="flex flex-col items-end gap-2">
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {message.attachments.map((attachment, position) =>
              attachment.previewUrl ? (
                <img
                  key={position}
                  src={attachment.previewUrl}
                  alt={attachment.name}
                  className="h-24 w-24 rounded-sm border border-eve-hair object-cover"
                />
              ) : (
                <span
                  key={position}
                  className="rounded-sm border border-eve-hair bg-eve-panel-2 px-2 py-1 font-mono text-[10px] text-eve-dim"
                >
                  {attachment.name}
                </span>
              ),
            )}
          </div>
        )}
        <div className="eve-message-user max-w-[86%] rounded-xl border px-3.5 py-2.5">
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-foreground">
            {message.text}
          </p>
        </div>
        <span className="font-mono text-[10px] tracking-[0.14em] text-eve-dim">
          VOCÊ · {formatClock(message.createdAt)}
        </span>
      </article>
    )
  }

  return (
    <article className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] tracking-[0.14em] text-eve-dim">
        <span className="text-eve-signal">E.V.E.</span>
        <span>{formatClock(message.createdAt)}</span>
        {message.latencyMs !== undefined && (
          <span>{(message.latencyMs / 1000).toFixed(1)}S</span>
        )}
        {message.tokens !== undefined && message.tokens > 0 && (
          <span>{message.tokens} TOK</span>
        )}
      </div>

      <div className="eve-message-assistant border-l border-eve-hair pl-4">
        {message.status === "streaming" && message.text === "" ? (
          <p className="flex items-center gap-2 font-mono text-[12px] text-eve-dim">
            <span className="eve-core-pulse size-1.5 rounded-full bg-eve-signal" />
            Compondo resposta…
          </p>
        ) : (
          <>
            <RichText text={message.text} />
            {message.status === "streaming" && (
              <span className="eve-caret ml-0.5 inline-block h-3.5 w-1.5 bg-eve-signal align-middle" />
            )}
          </>
        )}

        {message.status === "error" && (
          <p
            role="alert"
            className="mt-2 rounded-sm border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[12px] text-destructive"
          >
            {message.error ??
              "A resposta não foi concluída. Confira a conexão e tente enviar novamente."}
          </p>
        )}

        {message.learned && message.learned.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.learned.map((fact, position) => (
              <span
                key={position}
                className="rounded-sm border border-eve-ok/35 bg-eve-ok/8 px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-eve-ok"
                title={fact}
              >
                MEMÓRIA +1
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-2 py-10 text-center">
      <StateCore status="idle" />
      <p className="mt-6 font-mono text-[10px] tracking-[0.32em] text-eve-dim">
        CONSOLE PRONTO
      </p>
      <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        Pergunte, anexe, dite.
      </h2>
      <p className="mt-3 max-w-lg text-[13.5px] leading-relaxed text-eve-dim">
        Converse, envie imagens ou dite uma mensagem. Para gerar respostas, o
        servidor precisa estar conectado a um gateway de IA. Sessões e fatos de
        memória ficam neste navegador.
      </p>

      <div className="mt-7 grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="eve-suggestion rounded-xl border border-eve-outline/60 px-3.5 py-3 text-left text-[13px] leading-snug text-foreground transition-colors hover:border-eve-signal hover:text-foreground"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}

function ConsolePage() {
  const router = useRouter()
  const eve = useEve()
  const { user } = Route.useRouteContext()
  const { painel } = Route.useSearch()
  const [draft, setDraft] = useState("")
  const [provider, setProvider] = useState<EveProviderId>("gemini")
  const [providers, setProviders] = useState<EveProviderOption[]>([])
  const [providersReady, setProvidersReady] = useState(false)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [pending, setPending] = useState<EveAttachment[]>([])
  const [panel, setPanel] = useState<"none" | "sessions" | "system">("none")
  const [localError, setLocalError] = useState<string | null>(null)
  const [workshop, setWorkshop] = useState(false)
  const [security, setSecurity] = useState(false)
  const [gate, setGate] = useState<string | null>(null)
  const workshopOpen = workshop || Boolean(user && painel === "oficina")
  const securityOpen = security || Boolean(user && painel === "seguranca")

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const dictationBase = useRef("")

  const messages = eve.activeSession?.messages ?? []
  const lastMessage = messages[messages.length - 1]
  const streamingLength = lastMessage?.text.length ?? 0

  useEffect(() => {
    const controller = new AbortController()
    void loadEveProviders(controller.signal)
      .then((catalog) => {
        setProviders(catalog.providers)
        setProvider((current) => {
          const usable = catalog.providers.filter((item) => item.configured)
          if (usable.some((item) => item.id === current)) return current
          return (
            usable.find((item) => item.id === catalog.defaultProvider)?.id ??
            usable[0]?.id ??
            catalog.defaultProvider
          )
        })
        setProvidersReady(true)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setProvidersReady(true)
        setProviderError(
          error instanceof Error ? error.message : "API FastAPI indisponível.",
        )
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!user || !painel) return
    void router.navigate({ to: "/", search: {}, replace: true })
  }, [user, painel, router])

  /** Acesso sem credencial entra na vigilância antes de pedir a entrada. */
  function requireCredential(area: "oficina" | "seguranca") {
    setGate(area)
    void noteAreaAttempt({ data: { area } })
  }

  function openWorkshop() {
    if (user) setWorkshop(true)
    else requireCredential("oficina")
  }

  function openSecurity() {
    if (user) setSecurity(true)
    else requireCredential("seguranca")
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null)
    setSecurity(false)
    await router.invalidate()
  }

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    if (messages.length === 0) {
      node.scrollTop = 0
      return
    }
    node.scrollTop = node.scrollHeight
  }, [messages.length, streamingLength])

  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = "auto"
    node.style.height = `${Math.min(node.scrollHeight, 176)}px`
  }, [draft])

  function submit() {
    if (eve.status === "thinking") return
    if (!draft.trim() && pending.length === 0) return
    void eve.send(draft, pending, provider)
    setDraft("")
    setPending([])
    setLocalError(null)
  }

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const room = MAX_ATTACHMENTS - pending.length
    if (room <= 0) {
      setLocalError(`Limite de ${MAX_ATTACHMENTS} imagens por mensagem.`)
      return
    }
    try {
      const prepared = await Promise.all(
        Array.from(files)
          .slice(0, room)
          .map((file) => eve.prepareAttachment(file)),
      )
      setPending((previous) => [...previous, ...prepared])
      setLocalError(null)
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "Não foi possível anexar.",
      )
    }
  }

  function toggleMic() {
    if (eve.status === "listening") {
      eve.stopListening()
      return
    }
    dictationBase.current = draft.trim()
    eve.startListening((text) =>
      setDraft(
        dictationBase.current ? `${dictationBase.current} ${text}` : text,
      ),
    )
  }

  const notices = [
    localError ?? (lastMessage?.status === "error" ? null : eve.error),
  ].filter(Boolean) as string[]

  return (
    <div className="eve-shell flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="eve-topbar flex shrink-0 flex-wrap items-center gap-3 border-b border-eve-hair bg-eve-panel-2/65 px-4 py-3 backdrop-blur-xl xl:flex-nowrap sm:px-5">
        <StateCore status={eve.status} size="sm" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-[15px] font-semibold tracking-[0.12em] text-foreground sm:text-[17px] sm:tracking-[0.16em]">
              E.V.E. <span className="text-eve-blue">REN</span>
            </span>
            <span className="hidden font-mono text-[10px] tracking-[0.2em] text-eve-dim xl:inline">
              ENTIDADE VIRTUAL EVOLUTIVA
            </span>
          </div>
          <div className="mt-1">
            <StatePill status={eve.status} />
          </div>
        </div>

        <div className="hidden items-center gap-3 xl:flex">
          <span className="font-mono text-[10px] tracking-[0.16em] text-eve-dim">
            AUTONOMIA A0–A1
          </span>
          <span className="font-mono text-[10px] tracking-[0.16em] text-eve-dim">
            NÚCLEO MULTI-PROVEDOR
          </span>
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-2 xl:w-auto xl:shrink-0">
          <button
            type="button"
            onClick={openWorkshop}
            className="flex min-h-11 items-center gap-2 rounded-sm border border-eve-signal/45 bg-eve-signal/10 px-2.5 py-1.5 font-mono text-[9px] tracking-[0.1em] text-eve-signal transition-colors hover:bg-eve-signal/18 sm:text-[10px] sm:tracking-[0.14em]"
          >
            OFICINA
            {eve.proposals.length > 0 && (
              <span className="rounded-sm bg-eve-signal/25 px-1 py-px text-[9px]">
                {eve.proposals.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={openSecurity}
            className="min-h-11 rounded-sm border border-eve-outline/60 px-2.5 py-1.5 font-mono text-[9px] tracking-[0.08em] text-eve-dim transition-colors hover:border-eve-amber/50 hover:text-eve-amber sm:text-[10px] sm:tracking-[0.14em]"
          >
            {user ? "VIGILÂNCIA" : "🔒 VIGILÂNCIA"}
          </button>
          {user ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="min-h-11 rounded-sm border border-eve-outline/60 px-2.5 py-1.5 font-mono text-[9px] tracking-[0.08em] text-eve-dim transition-colors hover:text-foreground sm:text-[10px] sm:tracking-[0.14em]"
            >
              SAIR
            </button>
          ) : (
            <a
              href="/login"
              className="flex min-h-11 items-center rounded-sm border border-eve-amber/45 bg-eve-amber/10 px-2.5 py-1.5 font-mono text-[9px] tracking-[0.08em] text-eve-amber sm:text-[10px] sm:tracking-[0.14em]"
            >
              ENTRAR
            </a>
          )}
          <button
            type="button"
            onClick={() => setPanel(panel === "sessions" ? "none" : "sessions")}
            aria-expanded={panel === "sessions"}
            aria-controls="eve-session-drawer"
            className="min-h-11 rounded-sm border border-eve-outline/60 px-2.5 py-1.5 font-mono text-[9px] tracking-[0.08em] text-eve-dim transition-colors hover:border-eve-signal/50 hover:text-foreground lg:hidden sm:text-[10px] sm:tracking-[0.14em]"
          >
            SESSÕES
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === "system" ? "none" : "system")}
            aria-expanded={panel === "system"}
            aria-controls="eve-system-drawer"
            className="min-h-11 rounded-sm border border-eve-outline/60 px-2.5 py-1.5 font-mono text-[9px] tracking-[0.08em] text-eve-dim transition-colors hover:border-eve-signal/50 hover:text-foreground 2xl:hidden sm:text-[10px] sm:tracking-[0.14em]"
          >
            SISTEMA
          </button>
          <button
            type="button"
            onClick={eve.newSession}
            className="min-h-11 rounded-sm border border-eve-signal/45 bg-eve-signal/10 px-3 py-1.5 font-mono text-[9px] tracking-[0.08em] text-eve-signal transition-colors hover:bg-eve-signal/18 sm:text-[10px] sm:tracking-[0.14em]"
          >
            NOVA SESSÃO
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="eve-rail hidden w-[240px] shrink-0 border-r border-eve-hair bg-eve-panel-2/30 lg:flex lg:flex-col">
          <SessionRail
            sessions={eve.sessions}
            activeId={eve.activeId}
            factsCount={eve.facts.length}
            onSelect={eve.selectSession}
            onCreate={eve.newSession}
            onDelete={eve.deleteSession}
          />
        </aside>

        <main className="eve-ambient flex min-w-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6"
          >
            {messages.length === 0 ? (
              <EmptyState
                onPick={(text) => {
                  setDraft(text)
                  textareaRef.current?.focus()
                }}
              />
            ) : (
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                {messages.map((message) => (
                  <MessageBlock key={message.id} message={message} />
                ))}
              </div>
            )}
          </div>

          {notices.length > 0 && (
            <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
              <div className="flex items-start justify-between gap-3 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                <span>{notices[0]}</span>
                <button
                  type="button"
                  onClick={() => {
                    setLocalError(null)
                    eve.dismissError()
                  }}
                  className="font-mono text-[10px] tracking-[0.14em]"
                >
                  FECHAR
                </button>
              </div>
            </div>
          )}

          <div className="eve-chat-composer shrink-0 border-t border-eve-outline/35 bg-eve-panel/65 px-4 py-4 shadow-[0_-18px_52px_-40px_#65e6ff70] backdrop-blur-xl sm:px-6">
            <div className="mx-auto w-full max-w-3xl">
              {pending.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {pending.map((attachment, position) => (
                    <span
                      key={`${attachment.name}-${position}`}
                      className="group relative flex items-center gap-2 rounded-sm border border-eve-hair bg-eve-panel px-2 py-1.5"
                    >
                      <img
                        src={attachment.previewUrl}
                        alt={attachment.name}
                        className="size-8 rounded-sm object-cover"
                      />
                      <span className="max-w-[140px] truncate text-[11px] text-eve-dim">
                        {attachment.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPending((previous) =>
                            previous.filter((_, index) => index !== position),
                          )
                        }
                        aria-label={`Remover ${attachment.name}`}
                        className="font-mono text-[10px] text-eve-dim hover:text-destructive"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="eve-input-surface flex flex-wrap items-end justify-between gap-2 rounded-xl border border-eve-outline/60 px-2.5 py-2.5 transition-colors focus-within:border-eve-signal sm:flex-nowrap sm:px-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Anexar imagem"
                  className="min-h-11 min-w-11 rounded-md border border-eve-outline/60 px-2 py-1.5 font-mono text-[10px] tracking-[0.1em] text-eve-dim transition-colors hover:border-eve-signal/50 hover:text-foreground"
                >
                  IMG
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void addFiles(event.target.files)
                    event.target.value = ""
                  }}
                />

                <button
                  type="button"
                  onClick={toggleMic}
                  aria-pressed={eve.status === "listening"}
                  aria-label="Ditar por voz"
                  className={`min-h-11 min-w-11 rounded-md border px-2 py-1.5 font-mono text-[10px] tracking-[0.1em] transition-colors ${
                    eve.status === "listening"
                      ? "border-eve-ok/60 bg-eve-ok/12 text-eve-ok"
                      : "border-eve-hair text-eve-dim hover:border-eve-signal/50 hover:text-foreground"
                  }`}
                >
                  VOZ
                </button>

                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={draft}
                  aria-label="Mensagem para E.V.E."
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault()
                      submit()
                    }
                    if (event.key === "Escape") eve.stop()
                  }}
                  placeholder="Escreva um comando ou faça uma pergunta para a E.V.E."
                  className="order-first max-h-44 min-h-11 w-full min-w-0 basis-full flex-1 resize-none bg-transparent px-1 py-2 text-[13.5px] leading-relaxed text-foreground outline-none placeholder:text-eve-dim sm:order-none sm:min-w-[120px] sm:basis-auto"
                />

                <button
                  type="button"
                  onClick={eve.toggleVoiceOut}
                  aria-pressed={eve.voiceOut}
                  aria-label="Ler respostas em voz alta"
                  className={`min-h-11 min-w-11 rounded-md border px-2 py-1.5 font-mono text-[10px] tracking-[0.1em] transition-colors ${
                    eve.voiceOut
                      ? "border-eve-signal/60 bg-eve-signal/12 text-eve-signal"
                      : "border-eve-hair text-eve-dim hover:border-eve-signal/50 hover:text-foreground"
                  }`}
                >
                  FALAR
                </button>

                {eve.status === "thinking" ? (
                  <button
                    type="button"
                    onClick={eve.stop}
                    className="min-h-11 rounded-md border border-eve-amber/60 bg-eve-amber/12 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-eve-amber"
                  >
                    PARAR
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!draft.trim() && pending.length === 0}
                    className="min-h-11 rounded-md bg-eve-signal px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-primary-foreground transition-opacity disabled:opacity-35"
                  >
                    ENVIAR
                  </button>
                )}
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.12em] text-eve-dim">
                <span>ENTER ENVIA · SHIFT+ENTER QUEBRA LINHA</span>
                <label className="flex min-h-9 items-center gap-2" htmlFor="eve-provider">
                  <span>IA</span>
                  <select
                    id="eve-provider"
                    value={provider}
                    onChange={(event) =>
                      setProvider(event.target.value as EveProviderId)
                    }
                    disabled={providers.filter((item) => item.configured).length === 0}
                    aria-label="Provedor de inteligência artificial"
                    className="max-w-[190px] rounded-sm border border-eve-outline/60 bg-eve-panel px-2 py-1.5 font-mono text-[10px] tracking-normal text-foreground outline-none transition-colors focus:border-eve-signal disabled:opacity-60"
                  >
                    {providers.length === 0 ? (
                      <option value="gemini">
                        {providersReady ? "API indisponível" : "Conectando…"}
                      </option>
                    ) : (
                      providers.map((item) => (
                        <option key={item.id} value={item.id} disabled={!item.configured}>
                          {item.label}
                          {item.configured ? ` · ${item.model}` : " · configure no servidor"}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                {providersReady && providers.every((item) => !item.configured) && (
                  <span role="status" className="text-eve-amber">
                    {providerError ? "API FastAPI indisponível" : "Configure uma chave de IA no backend"}
                  </span>
                )}
                <span className="hidden sm:inline">
                  MÓDULOS ATIVOS {eve.activeModules.length}
                </span>
                <span>MEMÓRIA {eve.facts.length}</span>
                <button
                  type="button"
                  onClick={openSecurity}
                  className="font-mono tracking-[0.12em] text-eve-dim underline decoration-dotted underline-offset-2 hover:text-eve-amber"
                >
                  {user ? `ADMIN: ${user.displayName}` : "ENTRAR COMO ADMIN"}
                </button>
                <span className="hidden md:inline">
                  {eve.activeSession?.title ?? "SEM SESSÃO"}
                </span>
              </div>
            </div>
          </div>
        </main>

        <aside className="eve-rail hidden w-[296px] shrink-0 border-l border-eve-hair bg-eve-panel-2/30 2xl:flex 2xl:flex-col">
          <SystemRail
            facts={eve.facts}
            onForget={eve.forgetFact}
            onClearFacts={eve.clearFacts}
          />
        </aside>
      </div>

      <Workshop
        open={workshopOpen}
        onClose={() => setWorkshop(false)}
        onRequireAuth={() => {
          setWorkshop(false)
          requireCredential("oficina")
        }}
        eve={eve}
      />

      <SecurityPanel
        open={securityOpen}
        onClose={() => setSecurity(false)}
        user={user}
        onSignOut={() => void signOut()}
      />

      {gate && (
        <AccessGate
          area={gate === "oficina" ? "A oficina" : "A vigilância"}
          onClose={() => setGate(null)}
          onEnter={() => {
            void router.navigate({
              to: "/login",
              search: {
                next: "/",
                painel: gate === "oficina" ? "oficina" : "seguranca",
              },
            })
          }}
        />
      )}

      {panel !== "none" && (
        <div className="fixed inset-0 z-40 flex 2xl:hidden">
          <button
            type="button"
            aria-label="Fechar painel"
            onClick={() => setPanel("none")}
            className="absolute inset-0 bg-background/75"
          />
          {panel === "sessions" ? (
            <div
              id="eve-session-drawer"
              role="region"
              aria-label="Painel de sessões"
              className="relative z-10 h-full w-[86%] max-w-[340px] border-r border-eve-hair bg-background"
            >
              <SessionRail
                sessions={eve.sessions}
                activeId={eve.activeId}
                factsCount={eve.facts.length}
                onSelect={(id) => {
                  eve.selectSession(id)
                  setPanel("none")
                }}
                onCreate={() => {
                  eve.newSession()
                  setPanel("none")
                }}
                onDelete={eve.deleteSession}
                onClose={() => setPanel("none")}
              />
            </div>
          ) : (
            <div
              id="eve-system-drawer"
              role="region"
              aria-label="Painel do sistema"
              className="eve-glass relative z-10 ml-auto h-full w-[86%] max-w-[340px] border-l 2xl:hidden"
            >
              <SystemRail
                facts={eve.facts}
                onForget={eve.forgetFact}
                onClearFacts={eve.clearFacts}
                onClose={() => setPanel("none")}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
