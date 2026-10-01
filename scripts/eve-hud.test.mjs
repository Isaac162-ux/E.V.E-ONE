import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const hud = fs.readFileSync("src/components/ui/eve/hud-dashboard.tsx", "utf8")
const route = fs.readFileSync("src/rotas/index.tsx", "utf8")
const css = fs.readFileSync("src/styles.css", "utf8")

test("EVE9 HUD is wired into the root console", () => {
  assert.match(hud, /export function HudDashboard/)
  assert.match(hud, /getUserMedia/)
  assert.match(route, /HudDashboard/)
  assert.match(css, /\.eve-hud-shell/)
  assert.match(css, /\.eve-hud-core-wrap/)
})

test("HUD does not expose server credentials", () => {
  assert.doesNotMatch(hud, /process\.env/)
  assert.doesNotMatch(hud, /API_KEY/i)
})
