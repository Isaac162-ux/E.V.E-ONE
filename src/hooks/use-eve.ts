import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import {
  EVE_MODULES,
  createId,
  readMemoryMarks,
  stripPartialMemoryMarks,
  titleFromText,
  type EveAttachment,
  type EveFact,
  type EveMessage,
  type EveModule,
  type EveSession,
  type EveStatus,
} from "#/lib/eve/core.ts"
import { streamEve, type EveProviderId } from "#/lib/eve/client.ts"
import {
  makeProposal,
  readProposals,
  type CheckResult,
  type EveProposal,
  type ProposalStatus,
  type Verdict,
} from "#/lib/eve/workshop.ts"

export const MAX_ATTACHMENTS = 4

const STORAGE_KEY = "eve-ren.console.v1"
const EMPTY_STATE = {
  sessions: [],
  activeId: null,
  facts: [],
  proposals: [],
} satisfies PersistedEveState
const EMPTY_SNAPSHOT = JSON.stringify(EMPTY_STATE)
const listeners = new Set<() => void>()
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_IMAGE_PIXELS = 40_000_000
const MAX_IMAGE_SIDE = 1_600

interface PersistedEveState {
  sessions: EveSession[]
  activeId: string | null
  facts: EveFact[]
  proposals: EveProposal[]
}

interface SpeechAlternativeLike {
  transcript: string
}

type SpeechResultLike = ArrayLike<SpeechAlternativeLike>

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechResultLike>
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface SpeechWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

export interface EveConversation {
  activeId: string | null
  activeSession: EveSession | null
  activeModules: EveModule[]
  sessions: EveSession[]
  facts: EveFact[]
  proposals: EveProposal[]
  status: EveStatus
  error: string | null
  voiceOut: boolean
  newSession: () => void
  selectSession: (id: string) => void
  deleteSession: (id: string) => void
  send: (text: string, attachments?: EveAttachment[]) => Promise<void>
  prepareAttachment: (file: File) => Promise<EveAttachment>
  startListening: (onText: (text: string) => void) => void
  stopListening: () => void
  toggleVoiceOut: () => void
  stop: () => void
  dismissError: () => void
  forgetFact: (id: string) => void
  clearFacts: () => void
  addProposals: (proposals: EveProposal[]) => void
  recordProposalRun: (
    id: string,
    verdict: Verdict,
    checks: CheckResult[],
  ) => void
  setProposalStatus: (id: string, status: ProposalStatus) => void
}

let snapshotCache = EMPTY_SNAPSHOT
let memoryOnly = false

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseAttachment(value: unknown): EveAttachment | null {
  if (!isRecord(value)) return null
  if (
    typeof value.name !== "string" ||
    typeof value.mediaType !== "string" ||
    typeof value.previewUrl !== "string" ||
    !/^data:image\/(jpeg|png|webp);base64,/i.test(value.previewUrl)
  ) {
    return null
  }
  return {
    name: value.name.slice(0, 200),
    mediaType: value.mediaType,
    previewUrl: value.previewUrl,
  }
}

function parseMessage(value: unknown): EveMessage | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== "string" ||
    (value.role !== "user" && value.role !== "eve") ||
    typeof value.text !== "string" ||
    typeof value.createdAt !== "number" ||
    (value.status !== "streaming" && value.status !== "done" && value.status !== "error")
  ) {
    return null
  }

  const attachments = Array.isArray(value.attachments)
    ? value.attachments.flatMap((item) => {
        const attachment = parseAttachment(item)
        return attachment ? [attachment] : []
      })
    : undefined
  const message: EveMessage = {
    id: value.id,
    role: value.role,
    text: value.text.slice(0, 100_000),
    createdAt: value.createdAt,
    status: value.status === "streaming" ? "error" : value.status,
    ...(attachments?.length ? { attachments } : {}),
    ...(typeof value.error === "string" ? { error: value.error.slice(0, 500) } : {}),
    ...(typeof value.latencyMs === "number" ? { latencyMs: value.latencyMs } : {}),
    ...(typeof value.tokens === "number" ? { tokens: value.tokens } : {}),
    ...(Array.isArray(value.learned)
      ? { learned: value.learned.filter((item): item is string => typeof item === "string") }
      : {}),
  }

  if (value.status === "streaming") {
    message.error = "A resposta foi interrompida quando o navegador fechou."
  }
  return message
}

function parseSession(value: unknown): EveSession | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.createdAt !== "number" ||
    typeof value.updatedAt !== "number" ||
    !Array.isArray(value.messages)
  ) {
    return null
  }
  const messages = value.messages.flatMap((item) => {
    const message = parseMessage(item)
    return message ? [message] : []
  })
  return {
    id: value.id,
    title: value.title.slice(0, 120),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    messages,
  }
}

function parseFact(value: unknown): EveFact | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== "string" ||
    typeof value.text !== "string" ||
    typeof value.createdAt !== "number" ||
    typeof value.origin !== "string"
  ) {
    return null
  }
  return {
    id: value.id,
    text: value.text.slice(0, 240),
    createdAt: value.createdAt,
    origin: value.origin.slice(0, 40),
  }
}

function parseProposal(value: unknown): EveProposal | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.rationale !== "string" ||
    typeof value.risk !== "string" ||
    typeof value.file !== "string" ||
    typeof value.diff !== "string" ||
    typeof value.createdAt !== "number" ||
    (value.origin !== "conversa" && value.origin !== "oficina") ||
    (value.status !== "rascunho" && value.status !== "aprovada" && value.status !== "rejeitada")
  ) {
    return null
  }
  return {
    id: value.id,
    title: value.title.slice(0, 200),
    rationale: value.rationale.slice(0, 2_000),
    risk: value.risk.slice(0, 100),
    file: value.file.slice(0, 500),
    diff: value.diff.slice(0, 50_000),
    createdAt: value.createdAt,
    origin: value.origin,
    status: value.status,
  }
}

function parseSnapshot(snapshot: string): PersistedEveState {
  try {
    const value: unknown = JSON.parse(snapshot)
    if (!isRecord(value)) return EMPTY_STATE
    const sessions = Array.isArray(value.sessions)
      ? value.sessions.flatMap((item) => {
          const session = parseSession(item)
          return session ? [session] : []
        })
      : []
    const activeId =
      typeof value.activeId === "string" &&
      sessions.some((session) => session.id === value.activeId)
        ? value.activeId
        : (sessions[0]?.id ?? null)
    const facts = Array.isArray(value.facts)
      ? value.facts.flatMap((item) => {
          const fact = parseFact(item)
          return fact ? [fact] : []
        })
      : []
    const proposals = Array.isArray(value.proposals)
      ? value.proposals.flatMap((item) => {
          const proposal = parseProposal(item)
          return proposal ? [proposal] : []
        })
      : []
    return { sessions, activeId, facts, proposals }
  } catch {
    return EMPTY_STATE
  }
}

function getSnapshot(): string {
  if (typeof window === "undefined") return EMPTY_SNAPSHOT
  if (memoryOnly) return snapshotCache
  try {
    snapshotCache = window.localStorage.getItem(STORAGE_KEY) ?? EMPTY_SNAPSHOT
  } catch {
    memoryOnly = true
  }
  return snapshotCache
}

function getServerSnapshot(): string {
  return EMPTY_SNAPSHOT
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return
    memoryOnly = false
    snapshotCache = event.newValue ?? EMPTY_SNAPSHOT
    listener()
  }
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage)
  }
}

function updatePersistedState(
  update: (state: PersistedEveState) => PersistedEveState,
): boolean {
  const next = update(parseSnapshot(getSnapshot()))
  snapshotCache = JSON.stringify(next)
  let saved = true
  try {
    if (typeof window === "undefined") throw new Error("Navegador indisponível")
    window.localStorage.setItem(STORAGE_KEY, snapshotCache)
    memoryOnly = false
  } catch {
    memoryOnly = true
    saved = false
  }
  for (const listener of listeners) listener()
  return saved
}

function sortSessions(sessions: EveSession[]): EveSession[] {
  return [...sessions].sort((left, right) => right.updatedAt - left.updatedAt)
}

function updateSession(
  state: PersistedEveState,
  sessionId: string,
  update: (session: EveSession) => EveSession,
): PersistedEveState {
  const sessions = state.sessions.map((session) =>
    session.id === sessionId ? update(session) : session,
  )
  return { ...state, sessions: sortSessions(sessions) }
}

function requestAttachments(message: EveMessage) {
  return (message.attachments ?? []).flatMap((attachment) => {
    const separator = attachment.previewUrl.indexOf(",")
    if (separator < 0) return []
    return [
      {
        mediaType: attachment.mediaType,
        data: attachment.previewUrl.slice(separator + 1),
      },
    ]
  })
}

function sameFact(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase("pt-BR") === right.trim().toLocaleLowerCase("pt-BR")
}

export function useEve(): EveConversation {
  const rawSnapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const state = useMemo(() => parseSnapshot(rawSnapshot), [rawSnapshot])
  const [status, setStatus] = useState<EveStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [voiceOut, setVoiceOut] = useState(false)
  const [streamingPreview, setStreamingPreview] = useState<{
    sessionId: string
    message: EveMessage
  } | null>(null)
  const activeController = useRef<AbortController | null>(null)
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const busy = useRef(false)
  const voiceOutRef = useRef(false)

  const activeSession = useMemo(() => {
    const session = state.sessions.find((item) => item.id === state.activeId) ?? null
    if (!session || streamingPreview?.sessionId !== session.id) return session
    return {
      ...session,
      messages: session.messages.map((message) =>
        message.id === streamingPreview.message.id ? streamingPreview.message : message,
      ),
    }
  }, [state, streamingPreview])

  const persist = useCallback(
    (update: (current: PersistedEveState) => PersistedEveState) => {
      const saved = updatePersistedState(update)
      if (!saved) {
        setError("O navegador não salvou esta alteração. Libere espaço ou use outro navegador.")
      }
      return saved
    },
    [],
  )

  const newSession = useCallback(() => {
    activeController.current?.abort()
    activeController.current = null
    busy.current = false
    setStreamingPreview(null)
    setStatus("idle")
    setError(null)
    const now = Date.now()
    const session: EveSession = {
      id: createId("ses"),
      title: "Nova sessão",
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    persist((current) => ({
      ...current,
      sessions: sortSessions([session, ...current.sessions]),
      activeId: session.id,
    }))
  }, [persist])

  const selectSession = useCallback(
    (id: string) => {
      activeController.current?.abort()
      activeController.current = null
      busy.current = false
      setStreamingPreview(null)
      setStatus("idle")
      persist((current) =>
        current.sessions.some((session) => session.id === id)
          ? { ...current, activeId: id }
          : current,
      )
    },
    [persist],
  )

  const deleteSession = useCallback(
    (id: string) => {
      if (id === state.activeId) {
        activeController.current?.abort()
        activeController.current = null
        busy.current = false
        setStreamingPreview(null)
        setStatus("idle")
      }
      persist((current) => {
        const sessions = sortSessions(current.sessions.filter((session) => session.id !== id))
        const activeId = current.activeId === id ? (sessions[0]?.id ?? null) : current.activeId
        return { ...current, sessions, activeId }
      })
    },
    [persist, state.activeId],
  )

  const prepareAttachment = useCallback(async (file: File): Promise<EveAttachment> => {
    if (!IMAGE_TYPES.has(file.type)) {
      throw new Error("Use uma imagem JPEG, PNG ou WebP.")
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("Cada imagem precisa ter até 20 MB.")
    }
    if (typeof window === "undefined") {
      throw new Error("A seleção de imagens só funciona no navegador.")
    }

    const objectUrl = URL.createObjectURL(file)
    return await new Promise<EveAttachment>((resolve, reject) => {
      const image = new Image()
      const releaseUrl = () => URL.revokeObjectURL(objectUrl)
      image.onload = () => {
        releaseUrl()
        const width = image.naturalWidth
        const height = image.naturalHeight
        if (width * height > MAX_IMAGE_PIXELS) {
          reject(new Error("A imagem excede o limite de 40 megapixels."))
          return
        }
        const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height))
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        const context = canvas.getContext("2d")
        if (!context) {
          reject(new Error("Não consegui preparar a imagem neste navegador."))
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        try {
          const previewUrl = canvas.toDataURL(file.type, 0.82)
          const mediaType = previewUrl.match(/^data:(image\/[^;]+);base64,/)?.[1]
          if (!mediaType || !IMAGE_TYPES.has(mediaType)) {
            reject(new Error("O navegador não conseguiu converter esta imagem."))
            return
          }
          resolve({ name: file.name.slice(0, 200), mediaType, previewUrl })
        } catch {
          reject(new Error("Não consegui preparar a imagem neste navegador."))
        }
      }
      image.onerror = () => {
        releaseUrl()
        reject(new Error("O arquivo não pôde ser lido como imagem."))
      }
      image.src = objectUrl
    })
  }, [])

  const startListening = useCallback((onText: (text: string) => void) => {
    if (busy.current) {
      setError("Pare a resposta atual antes de ditar uma nova mensagem.")
      return
    }
    const speechWindow = window as SpeechWindow
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      setError("Este navegador não oferece ditado por voz. Use Chrome ou escreva a mensagem.")
      return
    }

    setError(null)
    const instance = new Recognition()
    instance.lang = "pt-BR"
    instance.continuous = false
    instance.interimResults = true
    instance.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join("")
        .trim()
      if (text) onText(text)
    }
    instance.onerror = () => {
      if (recognition.current !== instance) return
      setError("Não consegui captar áudio. Verifique a permissão do microfone e tente de novo.")
      setStatus("idle")
    }
    instance.onend = () => {
      if (recognition.current === instance) {
        recognition.current = null
        setStatus("idle")
      }
    }

    try {
      recognition.current?.stop()
      recognition.current = instance
      instance.start()
      setStatus("listening")
    } catch {
      recognition.current = null
      setStatus("idle")
      setError("O microfone não iniciou. Verifique a permissão do navegador.")
    }
  }, [])

  const stopListening = useCallback(() => {
    const instance = recognition.current
    recognition.current = null
    try {
      instance?.stop()
    } catch {
      // O reconhecimento já pode ter terminado.
    }
    setStatus((current) => (current === "listening" ? "idle" : current))
  }, [])

  const stop = useCallback(() => {
    activeController.current?.abort()
    const instance = recognition.current
    recognition.current = null
    try {
      instance?.stop()
    } catch {
      // O reconhecimento já pode ter terminado.
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel()
    }
    setStatus("idle")
  }, [])

  const toggleVoiceOut = useCallback(() => {
    const next = !voiceOutRef.current
    voiceOutRef.current = next
    setVoiceOut(next)
    if (!next && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel()
      setStatus((current) => (current === "speaking" ? "idle" : current))
    }
  }, [])

  const speak = useCallback((text: string): boolean => {
    if (!voiceOutRef.current || typeof window === "undefined") return false
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setError("Este navegador não oferece leitura em voz alta.")
      return false
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "pt-BR"
    utterance.onend = () => setStatus((current) => (current === "speaking" ? "idle" : current))
    utterance.onerror = () => {
      setStatus((current) => (current === "speaking" ? "idle" : current))
      setError("A leitura em voz alta foi interrompida pelo navegador.")
    }
    setStatus("speaking")
    window.speechSynthesis.speak(utterance)
    return true
  }, [])

  const send = useCallback(
    async (
      text: string,
      attachments: EveAttachment[] = [],
      provider?: EveProviderId,
    ) => {
      if (busy.current || (!text.trim() && attachments.length === 0)) return
      busy.current = true
      setError(null)
      setStatus("thinking")
      stopListening()

      const startedAt = Date.now()
      const now = startedAt
      const previousSession = state.sessions.find((item) => item.id === state.activeId)
      const sessionId = previousSession?.id ?? createId("ses")
      const userMessage: EveMessage = {
        id: createId("msg"),
        role: "user",
        text: text.trim(),
        ...(attachments.length ? { attachments } : {}),
        createdAt: now,
        status: "done",
      }
      const assistantMessage: EveMessage = {
        id: createId("msg"),
        role: "eve",
        text: "",
        createdAt: now,
        status: "streaming",
      }
      const previousMessages = previousSession?.messages ?? []
      const nextMessages = [...previousMessages, userMessage, assistantMessage]
      const nextSession: EveSession = {
        id: sessionId,
        title:
          previousSession && previousMessages.length > 0
            ? previousSession.title
            : titleFromText(userMessage.text || attachments[0]?.name || "Nova sessão"),
        createdAt: previousSession?.createdAt ?? now,
        updatedAt: now,
        messages: nextMessages,
      }
      persist((current) => ({
        ...current,
        sessions: sortSessions([
          nextSession,
          ...current.sessions.filter((session) => session.id !== sessionId),
        ]),
        activeId: sessionId,
      }))

      const turns = [...previousMessages, userMessage]
        .filter((message) => message.status !== "streaming")
        .slice(-16)
        .map((message) => ({
          role: message.role,
          text: message.text,
          ...(message.attachments?.length
            ? { attachments: requestAttachments(message) }
            : {}),
        }))
      const controller = new AbortController()
      activeController.current = controller
      let rawText = ""
      setStreamingPreview({ sessionId, message: assistantMessage })

      try {
        const result = await streamEve(
          {
            turns,
            facts: state.facts.map((fact) => fact.text),
            autonomy: "A1",
            provider,
            signal: controller.signal,
          },
          {
            onDelta: (chunk) => {
              rawText += chunk
              setStreamingPreview({
                sessionId,
                message: { ...assistantMessage, text: rawText },
              })
            },
          },
        )

        const memory = readMemoryMarks(result.text)
        const response = readProposals(memory.text)
        const newProposals = response.proposals.map((proposal) =>
          makeProposal(proposal, "conversa"),
        )
        const finalMessage: EveMessage = {
          ...assistantMessage,
          text: response.text,
          status: "done",
          latencyMs: Date.now() - startedAt,
          tokens: result.tokens,
          ...(memory.facts.length ? { learned: memory.facts } : {}),
        }
        const newFacts = memory.facts
          .filter((fact) => !state.facts.some((known) => sameFact(known.text, fact)))
          .map((fact) => ({
            id: createId("mem"),
            text: fact.slice(0, 240),
            createdAt: Date.now(),
            origin: "conversa",
          }))
        persist((current) => {
          const withMessage = updateSession(current, sessionId, (session) => ({
            ...session,
            updatedAt: Date.now(),
            messages: session.messages.map((message) =>
              message.id === assistantMessage.id ? finalMessage : message,
            ),
          }))
          return {
            ...withMessage,
            facts: [...newFacts, ...current.facts],
            proposals: [...newProposals, ...current.proposals],
          }
        })
        setStreamingPreview(null)
        if (!speak(response.text)) setStatus("idle")
      } catch (caught) {
        const interrupted = controller.signal.aborted
        const partial = readMemoryMarks(stripPartialMemoryMarks(rawText)).text
        const messageText = interrupted
          ? "Resposta interrompida."
          : caught instanceof Error
            ? caught.message
            : "A resposta falhou."
        const failedMessage: EveMessage = {
          ...assistantMessage,
          text: partial,
          status: "error",
          error: messageText,
          latencyMs: Date.now() - startedAt,
        }
        persist((current) =>
          updateSession(current, sessionId, (session) => ({
            ...session,
            updatedAt: Date.now(),
            messages: session.messages.map((message) =>
              message.id === assistantMessage.id ? failedMessage : message,
            ),
          })),
        )
        setStreamingPreview(null)
        setError(messageText)
        setStatus("idle")
      } finally {
        if (activeController.current === controller) {
          activeController.current = null
          busy.current = false
          setStatus((current) => (current === "speaking" ? current : "idle"))
        }
      }
    },
    [persist, speak, state, stopListening],
  )

  const forgetFact = useCallback(
    (id: string) => {
      persist((current) => ({
        ...current,
        facts: current.facts.filter((fact) => fact.id !== id),
      }))
    },
    [persist],
  )

  const clearFacts = useCallback(() => {
    persist((current) => ({ ...current, facts: [] }))
  }, [persist])

  const addProposals = useCallback(
    (proposals: EveProposal[]) => {
      persist((current) => ({
        ...current,
        proposals: [
          ...proposals.filter((proposal) =>
            current.proposals.every((existing) => existing.id !== proposal.id),
          ),
          ...current.proposals,
        ],
      }))
    },
    [persist],
  )

  const recordProposalRun = useCallback(
    (id: string, verdict: Verdict, checks: CheckResult[]) => {
      persist((current) => ({
        ...current,
        proposals: current.proposals.map((proposal) =>
          proposal.id === id
            ? { ...proposal, lastRun: { at: Date.now(), verdict, checks } }
            : proposal,
        ),
      }))
    },
    [persist],
  )

  const setProposalStatus = useCallback(
    (id: string, proposalStatus: ProposalStatus) => {
      persist((current) => ({
        ...current,
        proposals: current.proposals.map((proposal) =>
          proposal.id === id ? { ...proposal, status: proposalStatus } : proposal,
        ),
      }))
    },
    [persist],
  )

  useEffect(() => {
    return () => {
      activeController.current?.abort()
      try {
        recognition.current?.stop()
      } catch {
        // O reconhecimento pode já ter terminado.
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  return {
    activeId: state.activeId,
    activeSession,
    activeModules: EVE_MODULES.filter((module) => module.state === "online"),
    sessions: state.sessions,
    facts: state.facts,
    proposals: state.proposals,
    status,
    error,
    voiceOut,
    newSession,
    selectSession,
    deleteSession,
    send,
    prepareAttachment,
    startListening,
    stopListening,
    toggleVoiceOut,
    stop,
    dismissError: () => setError(null),
    forgetFact,
    clearFacts,
    addProposals,
    recordProposalRun,
    setProposalStatus,
  }
}
