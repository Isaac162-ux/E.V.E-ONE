import { useCallback, useEffect, useRef, useState } from "react"

import {
  EVE_MODULES,
  createId,
  readMemoryMarks,
  stripPartialMemoryMarks,
  titleFromText,
  type EveAttachment,
  type EveFact,
  type EveMessage,
  type EveSession,
  type EveStatus,
} from "#/lib/eve/core.ts"
import { streamEve } from "#/lib/eve/cliente.ts"
import type { CheckResult, EveProposal, Verdict } from "#/lib/eve/workshop.ts"

export const MAX_ATTACHMENTS = 4
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
const STORAGE_KEY = "eve-one:conversation:v1"

export interface EveConversation {
  sessions: EveSession[]
  activeId: string
  activeSession: EveSession | null
  facts: EveFact[]
  proposals: EveProposal[]
  activeModules: typeof EVE_MODULES
  status: EveStatus
  error: string | null
  voiceOut: boolean
  send: (text: string, attachments?: EveAttachment[]) => Promise<void>
  stop: () => void
  startListening: (onText: (text: string) => void) => void
  stopListening: () => void
  toggleVoiceOut: () => void
  prepareAttachment: (file: File) => Promise<EveAttachment>
  newSession: () => void
  selectSession: (id: string) => void
  deleteSession: (id: string) => void
  forgetFact: (id: string) => void
  clearFacts: () => void
  dismissError: () => void
  addProposals: (items: EveProposal[]) => void
  recordProposalRun: (id: string, verdict: Verdict, checks: CheckResult[]) => void
}

interface PersistedState {
  sessions: EveSession[]
  activeId: string
  facts: EveFact[]
  proposals: EveProposal[]
}

function makeSession(): EveSession {
  const now = Date.now()
  return {
    id: createId("ses"),
    title: "Nova sessão",
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

function safeLoad(): PersistedState {
  if (typeof window === "undefined") {
    const session = makeSession()
    return { sessions: [session], activeId: session.id, facts: [], proposals: [] }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) throw new Error("empty")
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    const sessions = Array.isArray(parsed.sessions) && parsed.sessions.length > 0
      ? parsed.sessions
      : [makeSession()]
    const activeId = sessions.some((session) => session.id === parsed.activeId)
      ? String(parsed.activeId)
      : sessions[0].id
    return {
      sessions,
      activeId,
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
    }
  } catch {
    const session = makeSession()
    return { sessions: [session], activeId: session.id, facts: [], proposals: [] }
  }
}

function isImageAttachment(file: File): boolean {
  return ["image/png", "image/jpeg", "image/webp"].includes(file.type)
}

interface SpeechRecognitionResultLike {
  0: { transcript: string }
  isFinal: boolean
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
}

interface WindowWithSpeech extends Window {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

function getSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null
  const speechWindow = window as WindowWithSpeech
  const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
  return Constructor ? new Constructor() : null
}

function speakText(text: string, onDone: () => void): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onDone()
    return
  }
  const clean = text.replace(/```[\s\S]*?```/g, "").replace(/[#*_`]/g, "").trim()
  if (!clean) {
    onDone()
    return
  }
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(clean)
  utterance.lang = "pt-BR"
  utterance.rate = 1
  utterance.pitch = 1
  utterance.onend = onDone
  utterance.onerror = onDone
  window.speechSynthesis.speak(utterance)
}

export function useEve(): EveConversation {
  const [initial] = useState(safeLoad)
  const [sessions, setSessions] = useState<EveSession[]>(initial.sessions)
  const [activeId, setActiveId] = useState(initial.activeId)
  const [facts, setFacts] = useState<EveFact[]>(initial.facts)
  const [proposals, setProposals] = useState<EveProposal[]>(initial.proposals)
  const [status, setStatus] = useState<EveStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [voiceOut, setVoiceOut] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const activeSession = sessions.find((session) => session.id === activeId) ?? null

  useEffect(() => {
    if (typeof window === "undefined") return
    const payload: PersistedState = { sessions, activeId, facts, proposals }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [sessions, activeId, facts, proposals])

  const stopSpeech = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel()
    }
  }, [])

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onresult = null
      recognition.onend = null
      recognition.onerror = null
      try { recognition.abort() } catch { /* browser may already be closed */ }
    }
    setStatus((current) => current === "listening" ? "idle" : current)
  }, [])

  const startListening = useCallback((onText: (text: string) => void) => {
    const recognition = getSpeechRecognition()
    if (!recognition) {
      setError("Seu navegador não disponibiliza reconhecimento de voz.")
      return
    }
    stopSpeech()
    stopListening()
    recognition.lang = "pt-BR"
    recognition.continuous = false
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let finalText = ""
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) finalText += result[0].transcript
      }
      if (finalText.trim()) onText(finalText.trim())
    }
    recognition.onerror = (event) => {
      if (event.error !== "aborted") setError("Não foi possível capturar sua voz.")
      setStatus("idle")
      recognitionRef.current = null
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null
      setStatus((current) => current === "listening" ? "idle" : current)
    }
    recognitionRef.current = recognition
    setStatus("listening")
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setStatus("idle")
      setError("O microfone não pôde ser iniciado. Verifique a permissão do navegador.")
    }
  }, [stopListening, stopSpeech])

  const toggleVoiceOut = useCallback(() => {
    setVoiceOut((enabled) => {
      if (enabled) stopSpeech()
      return !enabled
    })
  }, [stopSpeech])

  const prepareAttachment = useCallback(async (file: File): Promise<EveAttachment> => {
    if (!isImageAttachment(file)) throw new Error("A E.V.E. aceita PNG, JPEG ou WebP.")
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`A imagem ${file.name} excede o limite de 5 MB.`)
    }
    const previewUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
      reader.onerror = () => reject(new Error(`Não consegui ler ${file.name}.`))
      reader.readAsDataURL(file)
    })
    const comma = previewUrl.indexOf(",")
    if (comma < 0) throw new Error(`Formato inválido para ${file.name}.`)
    return { name: file.name, mediaType: file.type, previewUrl }
  }, [])

  const send = useCallback(async (text: string, attachments: EveAttachment[] = []) => {
    const clean = text.trim()
    if (!clean && attachments.length === 0) return
    if (status === "thinking") return

    const sessionId = activeId
    const userMessage: EveMessage = {
      id: createId("msg"), role: "user", text: clean, attachments,
      createdAt: Date.now(), status: "done",
    }
    const assistantId = createId("msg")
    const startedAt = performance.now()

    setError(null)
    setStatus("thinking")
    setSessions((previous) => previous.map((session) => session.id === sessionId
      ? {
          ...session,
          title: session.messages.length === 0 ? titleFromText(clean || attachments[0]?.name || "Nova sessão") : session.title,
          updatedAt: Date.now(),
          messages: [...session.messages, userMessage, { id: assistantId, role: "eve", text: "", createdAt: Date.now(), status: "streaming" }],
        }
      : session,
    ))

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const current = sessions.find((session) => session.id === sessionId)
      const previousTurns = (current?.messages ?? []).slice(-14).map((message) => ({
        role: message.role,
        text: message.text,
        attachments: message.attachments?.map((attachment) => {
          const comma = attachment.previewUrl.indexOf(",")
          return { mediaType: attachment.mediaType, data: comma >= 0 ? attachment.previewUrl.slice(comma + 1) : attachment.previewUrl }
        }),
      }))
      previousTurns.push({
        role: "user", text: clean,
        attachments: attachments.map((attachment) => {
          const comma = attachment.previewUrl.indexOf(",")
          return { mediaType: attachment.mediaType, data: comma >= 0 ? attachment.previewUrl.slice(comma + 1) : attachment.previewUrl }
        }),
      })

      let streamed = ""
      let tokenCount = 0
      const result = await streamEve({ turns: previousTurns, facts: facts.map((fact) => fact.text), autonomy: "A0–A1", signal: controller.signal }, {
        onDelta: (chunk) => {
          streamed += chunk
          const visible = stripPartialMemoryMarks(streamed)
          setSessions((previous) => previous.map((session) => session.id === sessionId
            ? { ...session, updatedAt: Date.now(), messages: session.messages.map((message) => message.id === assistantId ? { ...message, text: visible } : message) }
            : session,
          ))
        },
        onUsage: (tokens) => { tokenCount = tokens },
      })

      const memory = readMemoryMarks(result.text)
      const existing = new Set(facts.map((fact) => fact.text.toLowerCase()))
      const learned = memory.facts.filter((fact) => !existing.has(fact.toLowerCase())).slice(0, 2)
      if (learned.length > 0) {
        setFacts((previous) => [...previous, ...learned.map((fact) => ({ id: createId("mem"), text: fact, createdAt: Date.now(), origin: "conversa" }))])
      }

      const finalText = memory.text || result.text.trim()
      setSessions((previous) => previous.map((session) => session.id === sessionId
        ? {
            ...session,
            updatedAt: Date.now(),
            messages: session.messages.map((message) => message.id === assistantId
              ? { ...message, text: finalText, status: "done", latencyMs: Math.round(performance.now() - startedAt), tokens: tokenCount || result.tokens, learned }
              : message),
          }
        : session,
      ))

      if (voiceOut && finalText) {
        setStatus("speaking")
        speakText(finalText, () => setStatus("idle"))
      } else {
        setStatus("idle")
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setStatus("idle")
        return
      }
      const message = cause instanceof Error ? cause.message : "A E.V.E. encontrou uma falha inesperada."
      setError(message)
      setSessions((previous) => previous.map((session) => session.id === sessionId
        ? { ...session, updatedAt: Date.now(), messages: session.messages.map((item) => item.id === assistantId ? { ...item, status: "error", error: message, latencyMs: Math.round(performance.now() - startedAt) } : item) }
        : session,
      ))
      setStatus("idle")
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [activeId, facts, sessions, status, voiceOut])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    stopListening()
    stopSpeech()
    setStatus("idle")
  }, [stopListening, stopSpeech])

  const newSession = useCallback(() => {
    stop()
    const session = makeSession()
    setSessions((previous) => [session, ...previous])
    setActiveId(session.id)
    setError(null)
  }, [stop])

  const selectSession = useCallback((id: string) => {
    if (!sessions.some((session) => session.id === id)) return
    stop()
    setActiveId(id)
    setError(null)
  }, [sessions, stop])

  const deleteSession = useCallback((id: string) => {
    stop()
    setSessions((previous) => {
      const remaining = previous.filter((session) => session.id !== id)
      if (remaining.length === 0) {
        const fresh = makeSession()
        setActiveId(fresh.id)
        return [fresh]
      }
      if (id === activeId) setActiveId(remaining[0].id)
      return remaining
    })
  }, [activeId, stop])

  const forgetFact = useCallback((id: string) => setFacts((previous) => previous.filter((fact) => fact.id !== id)), [])
  const clearFacts = useCallback(() => setFacts([]), [])
  const dismissError = useCallback(() => setError(null), [])
  const addProposals = useCallback((items: EveProposal[]) => setProposals((previous) => {
    const ids = new Set(previous.map((proposal) => proposal.id))
    return [...previous, ...items.filter((proposal) => !ids.has(proposal.id))]
  }), [])
  const recordProposalRun = useCallback((id: string, verdict: Verdict, checks: CheckResult[]) => {
    setProposals((previous) => previous.map((proposal) => proposal.id === id ? { ...proposal, lastRun: { at: Date.now(), verdict, checks } } : proposal))
  }, [])

  return {
    sessions, activeId, activeSession, facts, proposals, activeModules: EVE_MODULES,
    status, error, voiceOut, send, stop, startListening, stopListening,
    toggleVoiceOut, prepareAttachment, newSession, selectSession, deleteSession,
    forgetFact, clearFacts, dismissError, addProposals, recordProposalRun,
  }
}
