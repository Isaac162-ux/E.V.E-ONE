import assert from "node:assert/strict"
import test from "node:test"

import {
  EVE_MODULES,
  buildSystemPrompt,
  readMemoryMarks,
  stripPartialMemoryMarks,
  titleFromText,
} from "../src/lib/eve/core.ts"

test("memory marks are extracted and the user-facing answer is cleaned", () => {
  assert.deepEqual(
    readMemoryMarks(
      "Resposta pronta. [[MEM:   prefere respostas curtas  ]]\n\n[[MEM: trabalha com design]]",
    ),
    {
      text: "Resposta pronta.",
      facts: ["prefere respostas curtas", "trabalha com design"],
    },
  )
})

test("partial memory markers stay out of streamed text", () => {
  assert.equal(stripPartialMemoryMarks("Resposta útil [[MEM: prefere"), "Resposta útil")
  assert.equal(stripPartialMemoryMarks("Resposta útil [[M"), "Resposta útil")
  assert.equal(stripPartialMemoryMarks("Resposta útil"), "Resposta útil")
})

test("session titles collapse whitespace and stay within 44 characters", () => {
  assert.equal(titleFromText("  plano   para amanhã "), "plano para amanhã")
  assert.equal(titleFromText(" "), "Nova sessão")
  assert.equal(titleFromText("a".repeat(50)), `${"a".repeat(43)}…`)
})

test("the system prompt reports only online modules as active", () => {
  const prompt = buildSystemPrompt({
    facts: ["prefere português do Brasil"],
    attachmentCount: 0,
    autonomy: "A0–A1",
  })

  const activeModules = EVE_MODULES.filter((module) => module.state === "online")
  assert.match(prompt, /E\.V\.E\. REN/)
  assert.match(prompt, new RegExp(activeModules[0].code))
  assert.match(prompt, /prefere português do Brasil/)
  assert.doesNotMatch(prompt, /WEB-05/)
  assert.doesNotMatch(prompt, /SBX-06/)
})
