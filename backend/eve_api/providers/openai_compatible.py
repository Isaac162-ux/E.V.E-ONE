from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from eve_api.prompts import build_system_prompt
from eve_api.schemas import ChatRequest
from eve_api.settings import ProviderSettings
from eve_api.providers.base import ProviderError, messages_for_openai


class OpenAICompatibleProvider:
    def __init__(self, settings: ProviderSettings) -> None:
        self.settings = settings

    async def stream(self, request: ChatRequest) -> AsyncIterator[tuple[str, int | None]]:
        if not self.settings.configured:
            raise ProviderError(f"Configure a chave e o modelo de {self.settings.label} no backend.")

        body = {
            "model": self.settings.model,
            "messages": [
                {"role": "system", "content": build_system_prompt(request)},
                *messages_for_openai(request),
            ],
            "stream": True,
        }
        headers = {
            "Authorization": f"Bearer {self.settings.api_key}",
            "Content-Type": "application/json",
        }
        timeout = httpx.Timeout(90.0, connect=15.0)

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST", f"{self.settings.endpoint}/chat/completions", headers=headers, json=body
                ) as response:
                    if response.status_code >= 400:
                        raise ProviderError(
                            f"{self.settings.label} recusou a chamada (HTTP {response.status_code}). Confira a chave e o modelo configurado."
                        )
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if not data or data == "[DONE]":
                            continue
                        try:
                            event = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        usage = event.get("usage") or {}
                        token_count = usage.get("completion_tokens") or usage.get("total_tokens")
                        if isinstance(token_count, int):
                            yield "", token_count
                        for choice in event.get("choices") or []:
                            delta = choice.get("delta") or {}
                            content = delta.get("content")
                            if isinstance(content, str) and content:
                                yield content, None
        except httpx.TimeoutException as exc:
            raise ProviderError(f"Tempo limite ao consultar {self.settings.label}.") from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f"Não foi possível conectar a {self.settings.label}.") from exc
