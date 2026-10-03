import { expect, test } from "@playwright/test"

test("mobile console reports its ready state and locked capabilities honestly", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await page.waitForLoadState("networkidle")

  await expect(page).toHaveTitle(/E\.V\.E\. REN/)
  const viewportWidth = await page.evaluate(() => window.innerWidth)
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(documentWidth).toBeLessThanOrEqual(viewportWidth)
  await expect(
    page.getByRole("main").getByRole("img", { name: "Estado: PRONTA" }),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "🔒 VIGILÂNCIA" })).toBeVisible()

  await page.getByRole("button", { name: "SISTEMA" }).click()
  const systemDrawer = page.getByRole("region", { name: "Painel do sistema" })
  await expect(systemDrawer.getByText(/memória neste navegador/i)).toBeVisible()
  await expect(systemDrawer.getByText(/Sem sincronização entre dispositivos/)).toBeVisible()
  await expect(systemDrawer.getByText("Pesquisa na web", { exact: true })).toBeVisible()

  await systemDrawer.getByRole("button", { name: "FECHAR", exact: true }).click()
  await expect(systemDrawer).toHaveCount(0)
})

test("composer enables send when text is present without submitting it", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await page.waitForLoadState("networkidle")

  const composer = page.getByPlaceholder("Escreva um comando ou faça uma pergunta para a E.V.E.")
  await composer.click()
  await composer.pressSequentially("Resuma este projeto")

  await expect(page.getByRole("button", { name: "ENVIAR" })).toBeEnabled()
  await expect(composer).toHaveValue("Resuma este projeto")
})
