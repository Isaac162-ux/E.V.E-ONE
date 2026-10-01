# E.V.E. 9 — tarefas de validação

Use estas tarefas depois de iniciar a aplicação com `pnpm dev`. Elas foram escolhidas para validar o fluxo real do console sem depender de respostas específicas do modelo.

## T01 — Inicialização

**Ação:** abrir `/`.

**Esperado:** a HUD renderiza sem tela de erro; sessão nova aparece; o botão de voz está disponível.

## T02 — Conversa básica

**Prompt:** `E.V.E., explique em 3 frases qual é a finalidade deste sistema.`

**Esperado:** uma resposta chega por streaming e aparece como mensagem da E.V.E.; o estado volta para `idle` ao terminar.

## T03 — Contexto entre mensagens

**Prompt 1:** `Meu projeto atual se chama E.V.E. 9.`

**Prompt 2:** `Qual é o nome do meu projeto atual?`

**Esperado:** a segunda resposta usa o histórico da sessão; se o modelo emitir uma marca `[[MEM: ...]]`, ela é removida da mensagem e registrada na memória curada.

## T04 — Memória curada

**Prompt:** `[[MEM: O usuário prefere respostas técnicas objetivas.]]`

**Esperado:** a marca não aparece na resposta final e o contador de memória é atualizado quando uma nova memória é aprendida.

## T05 — Imagem

**Ação:** anexar uma imagem PNG/JPEG/WebP de até 5 MB.

**Prompt:** `Analise esta imagem e descreva somente o que é observável.`

**Esperado:** a imagem aparece no transcript e é enviada como base64 somente para a rota de servidor.

## T06 — Voz de entrada

**Ação:** clicar em `VOZ`, conceder permissão de microfone e falar em português do Brasil.

**Esperado:** o estado muda para `listening`, a fala vira texto no campo e o reconhecimento termina sem travar a interface.

## T07 — Voz de saída

**Ação:** ativar `FALAR` e enviar uma mensagem curta.

**Esperado:** a resposta aparece em texto e também é reproduzida pelo sintetizador do navegador; durante a reprodução o estado visual é `speaking`.

## T08 — Interrupção

**Ação:** enquanto a E.V.E. estiver falando, usar `PARAR`.

**Esperado:** a reprodução é cancelada, o request em andamento é abortado quando aplicável e a interface retorna a um estado estável.

## T09 — Nova sessão

**Ação:** enviar uma mensagem, clicar `NOVA SESSÃO` e voltar para a sessão anterior.

**Esperado:** as mensagens da sessão anterior continuam disponíveis no mesmo navegador.

## T10 — Oficina

**Ação:** abrir `OFICINA` e executar uma autoinspeção.

**Esperado:** o manifesto do código é carregado; uma proposta válida pode entrar na bancada; executar a verificação não altera o arquivo por si só.

## T11 — Erro de configuração

**Ação:** iniciar o sistema sem as credenciais do gateway configuradas.

**Esperado:** a UI mostra um erro legível e não expõe segredo, stack trace ou credencial.

## T12 — Smoke de qualidade

Execute:

```bash
pnpm test:eve
pnpm lint
pnpm typecheck
pnpm build
```

Todos devem terminar com código de saída `0` antes de considerar a branch pronta para merge.

## Observação sobre testes externos

Os testes T02–T11 dependem de navegador, permissões e/ou credenciais do gateway. O CI cobre os contratos determinísticos, lint, typecheck e build; os testes interativos precisam ser executados no Codespace/navegador com o serviço configurado.
