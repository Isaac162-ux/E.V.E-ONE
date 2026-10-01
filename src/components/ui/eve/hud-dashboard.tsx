import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import {
  Activity,
  CalendarDays,
  Camera,
  ChevronRight,
  Cpu,
  Globe2,
  MessageSquare,
  Radio,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Wifi,
  X,
  Zap,
} from "lucide-react"

import type { EveConversation } from "#/hooks/use-eve.ts"
import { EVE_MODEL, EVE_MODULES, type EveStatus } from "#/lib/eve/core.ts"

interface HudDashboardProps {
  eve: EveConversation
  onOpenChat: () => void
  onOpenWorkshop: () => void
  onOpenSecurity: () => void
}

const STATUS: Record<EveStatus, { label: string; tone: string }> = {
  idle: { label: "PRONTA", tone: "var(--eve-signal)" },
  listening: { label: "OUVINDO", tone: "var(--eve-ok)" },
  thinking: { label: "PROCESSANDO", tone: "var(--eve-amber)" },
  speaking: { label: "FALANDO", tone: "var(--eve-signal)" },
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="eve-hud-metric">
      <span className="eve-hud-kicker">{label}</span>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  )
}

function HudCard({
  eyebrow,
  title,
  icon,
  children,
  className = "",
}: {
  eyebrow: string
  title: string
  icon: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={"eve-hud-card " + className}>
      <div className="eve-hud-card-head">
        <div className="eve-hud-card-icon">{icon}</div>
        <div className="min-w-0">
          <span className="eve-hud-kicker">{eyebrow}</span>
          <h3>{title}</h3>
        </div>
        <span className="ml-auto size-1.5 rounded-full bg-eve-signal shadow-[0_0_12px_var(--eve-signal)]" />
      </div>
      {children}
    </section>
  )
}

function CoreOrb({ status }: { status: EveStatus }) {
  const tone = STATUS[status].tone
  return (
    <div className="eve-hud-core-wrap">
      <div className="eve-hud-orbit eve-hud-orbit-a" />
      <div className="eve-hud-orbit eve-hud-orbit-b" />
      <div className="eve-hud-orbit eve-hud-orbit-c" />
      <div className="eve-hud-core-halo" style={{ borderColor: tone }} />
      <div
        className="eve-hud-core"
        style={{
          background: "radial-gradient(circle at 50% 45%, " + tone + " 0%, transparent 66%)",
          boxShadow: "0 0 55px " + tone,
        }}
      >
        <div className="eve-hud-core-crosshair" />
        <div className="eve-hud-core-dot" style={{ background: tone }} />
      </div>
      <div className="eve-hud-core-label">
        <span>E.V.E.9</span>
        <small>{STATUS[status].label}</small>
      </div>
    </div>
  )
}

function CameraPanel({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador não disponibiliza câmera.")
      return
    }
    void navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setError("Câmera indisponível ou permissão não concedida."))
    return () => {
      active = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="eve-hud-modal w-full max-w-3xl">
        <div className="flex items-center justify-between border-b border-eve-hair px-4 py-3">
          <div>
            <span className="eve-hud-kicker">VIS-02 / INPUT</span>
            <h3 className="mt-1 font-display text-sm tracking-[0.12em]">VISÃO</h3>
          </div>
          <button type="button" onClick={onClose} className="eve-hud-icon-button" aria-label="Fechar câmera">
            <X size={16} />
          </button>
        </div>
        <div className="relative aspect-video overflow-hidden bg-black">
          {error ? (
            <div className="flex h-full items-center justify-center px-6 text-center font-mono text-xs text-eve-dim">
              {error}
            </div>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 eve-hud-camera-grid" />
              <div className="pointer-events-none absolute inset-6 border border-eve-signal/35" />
              <div className="absolute left-8 top-8 font-mono text-[9px] tracking-[0.2em] text-eve-signal">
                CAMERA LINK / LIVE
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function HudDashboard({ eve, onOpenChat, onOpenWorkshop, onOpenSecurity }: HudDashboardProps) {
  const [now, setNow] = useState<Date | null>(null)
  const [online, setOnline] = useState(true)
  const [camera, setCamera] = useState(false)
  const onlineModules = EVE_MODULES.filter((module) => module.state === "online").length
  const messages = eve.activeSession?.messages.length ?? 0
  const status = STATUS[eve.status]

  useEffect(() => {
    const update = () => {
      setNow(new Date())
      setOnline(navigator.onLine)
    }
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    const timer = window.setInterval(update, 1000)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  return (
    <>
      <div className="eve-hud-shell eve-grid">
        <div className="eve-hud-vignette" />
        <header className="eve-hud-topbar">
          <div className="flex items-center gap-3">
            <div className="eve-hud-brand-mark"><Sparkles size={15} /></div>
            <div>
              <div className="font-display text-sm font-semibold tracking-[0.24em]">E.V.E.9</div>
              <div className="eve-hud-kicker">ENTIDADE VIRTUAL EVOLUTIVA / COMMAND INTERFACE</div>
            </div>
          </div>
          <div className="hidden items-center gap-5 md:flex">
            <span className="eve-hud-top-stat"><span className="eve-hud-live-dot" /> CORE ONLINE</span>
            <span className="eve-hud-top-stat">MODEL {EVE_MODEL}</span>
            <span className="eve-hud-top-stat">A0–A1</span>
          </div>
          <button type="button" onClick={onOpenSecurity} className="eve-hud-secure-button">
            <ShieldCheck size={14} /> VIGILÂNCIA
          </button>
        </header>

        <div className="eve-hud-content">
          <HudCard eyebrow="SISTEMA / TELEMETRIA" title="Atividade" icon={<Activity size={14} />} className="eve-hud-card-left">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="CORE" value="ONLINE" detail="núcleo cognitivo" />
              <Metric label="MÓDULOS" value={onlineModules + "/" + EVE_MODULES.length} detail="ativos" />
              <Metric label="SESSÕES" value={String(eve.sessions.length)} detail="armazenadas localmente" />
              <Metric label="MEMÓRIA" value={String(eve.facts.length)} detail="fatos curados" />
            </div>
            <div className="eve-hud-progress"><span style={{ width: Math.max(12, (onlineModules / EVE_MODULES.length) * 100) + "%" }} /></div>
            <div className="mt-2 flex items-center justify-between font-mono text-[9px] tracking-[0.12em] text-eve-dim">
              <span>INTEGRIDADE DO CONSOLE</span><span>ESTÁVEL</span>
            </div>
          </HudCard>

          <HudCard eyebrow="AMBIENTE / CLOCK" title="Tempo local" icon={<Thermometer size={14} />} className="eve-hud-card-weather">
            <div className="flex items-end justify-between">
              <div>
                <div className="font-display text-3xl font-semibold tracking-tight">{now ? now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</div>
                <div className="mt-1 text-xs text-eve-dim">{now ? now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) : "sincronizando relógio"}</div>
              </div>
              <div className="text-right font-mono text-[9px] tracking-[0.1em] text-eve-signal">
                <div>LOCAL</div><div>BR / SP</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Metric label="REDE" value={online ? "OK" : "OFF"} detail="browser" />
              <Metric label="MODO" value="HUD" detail="interface" />
              <Metric label="MSG" value={String(messages)} detail="sessão atual" />
            </div>
          </HudCard>

          <div className="eve-hud-center">
            <CoreOrb status={eve.status} />
            <div className="eve-hud-center-actions">
              <button type="button" onClick={onOpenChat} className="eve-hud-primary-action">
                <MessageSquare size={15} /> ABRIR CONVERSA <ChevronRight size={14} />
              </button>
              <button type="button" onClick={() => setCamera(true)} className="eve-hud-secondary-action">
                <Camera size={14} /> VISÃO
              </button>
              <button type="button" onClick={eve.toggleVoiceOut} className={"eve-hud-secondary-action " + (eve.voiceOut ? "is-active" : "")}>
                VOZ {eve.voiceOut ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          <HudCard eyebrow="INTELIGÊNCIA / FEED" title="Observações disponíveis" icon={<Globe2 size={14} />} className="eve-hud-card-feed">
            <div className="eve-hud-feed-main">
              <span className="eve-hud-feed-badge">E.V.E.9 / READY</span>
              <p>O painel está pronto para receber perguntas, imagens, voz e novas sessões.</p>
              <button type="button" onClick={onOpenChat} className="eve-hud-inline-link">INICIAR INTERAÇÃO <ChevronRight size={12} /></button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={onOpenWorkshop} className="eve-hud-mini-action"><Cpu size={13} /><span>OFICINA</span></button>
              <button type="button" onClick={onOpenSecurity} className="eve-hud-mini-action"><ShieldCheck size={13} /><span>SEGURANÇA</span></button>
            </div>
          </HudCard>

          <HudCard eyebrow="COMUNICAÇÕES / SESSÃO" title="Atividade recente" icon={<Radio size={14} />} className="eve-hud-card-comms">
            <div className="space-y-2">
              {eve.activeSession?.messages.slice(-3).reverse().map((message) => (
                <div key={message.id} className="eve-hud-activity-row">
                  <span className={message.role === "eve" ? "text-eve-signal" : "text-eve-ok"}>{message.role === "eve" ? "EVE" : "USR"}</span>
                  <span className="truncate">{message.text || "processando…"}</span>
                </div>
              ))}
              {messages === 0 && <div className="py-2 text-[11px] text-eve-dim">Nenhuma comunicação nesta sessão.</div>}
            </div>
          </HudCard>

          <HudCard eyebrow="AGENDA / WORKFLOW" title="Próximas ações" icon={<CalendarDays size={14} />} className="eve-hud-card-agenda">
            <div className="space-y-2">
              <button type="button" onClick={onOpenChat} className="eve-hud-task"><span className="eve-hud-task-dot" /> Nova conversa <ChevronRight size={12} /></button>
              <button type="button" onClick={onOpenWorkshop} className="eve-hud-task"><span className="eve-hud-task-dot" /> Autoinspeção <ChevronRight size={12} /></button>
              <button type="button" onClick={onOpenSecurity} className="eve-hud-task"><span className="eve-hud-task-dot" /> Revisar acesso <ChevronRight size={12} /></button>
            </div>
          </HudCard>

          <div className="eve-hud-footer">
            <span><Wifi size={11} /> LINK ESTÁVEL</span>
            <span><Zap size={11} /> UI ONLINE</span>
            <span>E.V.E.9 / CONTROLLED AUTONOMY</span>
          </div>
        </div>
      </div>
      {camera && <CameraPanel onClose={() => setCamera(false)} />}
    </>
  )
}
