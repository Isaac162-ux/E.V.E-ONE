import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("E.V.E. conversation hook exposes the console contract", async () => {
  const source = await text("src/hooks/use-eve.ts")
  for (const symbol of [
    "export function useEve",
    "export interface EveConversation",
    "MAX_ATTACHMENTS",
    "streamEve",
    "startListening",
    "toggleVoiceOut",
    "prepareAttachment",
    "addProposals",
    "recordProposalRun",
  ]) {
    assert.ok(source.includes(symbol), `missing contract symbol: ${symbol}`)
  }
})

test("E.V.E. keeps server-side LLM credentials behind the API route", async () => {
  const source = await text("src/rotas/api/eve.ts")
  assert.match(source, /BTY_LLM_SERVER_BASE_URL/)
  assert.match(source, /BTY_LLM_SERVER_API_KEY/)
  assert.match(source, /x-api-key/)
  assert.doesNotMatch(source, /NEXT_PUBLIC_.*API_KEY/i)
})

test("E.V.E. browser voice is bidirectional by contract", async () => {
  const source = await text("src/hooks/use-eve.ts")
  assert.match(source, /SpeechRecognition/)
  assert.match(source, /SpeechSynthesisUtterance/)
  assert.match(source, /pt-BR/)
  assert.match(source, /setStatus\("listening"\)/)
  assert.match(source, /setStatus\("speaking"\)/)
})

test("legacy component and client import paths resolve through compatibility shims", async () => {
  const files = await Promise.all([
    text("src/components/eve/panels.tsx"),
    text("src/components/eve/security.tsx"),
    text("src/components/eve/workshop.tsx"),
    text("src/lib/eve/client.ts"),
  ])
  assert.equal(files[0].trim(), 'export * from "#/components/ui/eve/panels.tsx"')
  assert.equal(files[1].trim(), 'export * from "#/components/ui/eve/security.tsx"')
  assert.equal(files[2].trim(), 'export * from "#/components/ui/eve/workshop.tsx"')
  assert.equal(files[3].trim(), 'export * from "./cliente.ts"')
})
