from __future__ import annotations

import json
from collections.abc import AsyncIterator
from urllib.parse import quote

import httpx

from eve_api.prompts import build_system_prompt
from eve_api.schemas import ChatRequest
from eve_api.settings import ProviderSettings
from eve_api.providers.base import ProviderError


class GeminiProvider:
    def __init__(self, settings: ProviderSettings) -> None:
        self.settings = settings

    async def stream(self, request: ChatRequest) -> AsyncIterator[tuple[str, int | None]]:
        if not self.settings.configured:
            raise ProviderError("Configure GEMINI_API_KEY e GEMINI_MODEL no backend.")

        contents: list[dict[str, object]] = []
        for turn in request.turns[-16:]:
            parts: list[dict[str, object]] = []
            if turn.text.strip():
                parts.append({"text": turn.text})
            for attachment in turn.attachments:
                parts.append(
                    {
                        "inline_data": {
                            "mime_type": attachment.mediaType,
                            "data": "".join(attachment.data.split()),
                        }
                    }
                )
            contents.append(
                {"role": "model" if turn.role == "eve" else "user", "parts": parts}
            )

        model_path = quote(self.settings.model, safe="-")
        url = f"{self.settings.endpoint}/models/{model_path}:streamGenerateContent?alt=sse"
        body = {
            "systemInstruction": {"parts": [{"text": build_system_prompt(request)}]},
            "contents": contents,
            "generationConfig": {"maxOutputTokens": 2048},
        }
        timeout = httpx.Timeout(90.0, connect=15.0)

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    url,
                    headers={"x-goog-api-key": self.settings.api_key},
                    json=body,
                ) as response:
                    if response.status_code >= 400:
                        raise ProviderError(
                            f"Google AI Studio recusou a chamada (HTTP {response.status_code}). Confira a chave e o modelo configurado."
                        )
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if not data:
                            continue
                        try:
                            event = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        for candidate in event.get("candidates") or []:
                            content = candidate.get("content") or {}
                            for part in content.get("parts") or []:
                                text = part.get("text")
                                if isinstance(text, str) and text:
                                    yield text, None
                        usage = event.get("usageMetadata") or {}
                        token_count = usage.get("totalTokenCount")
                        if isinstance(token_count, int):
                            yield "", token_count
        except httpx.TimeoutException as exc:
            raise ProviderError("Tempo limite ao consultar Google AI Studio.") from exc
        except httpx.HTTPError as exc:
            raise ProviderError("Não foi possível conectar ao Google AI Studio.") from exc
