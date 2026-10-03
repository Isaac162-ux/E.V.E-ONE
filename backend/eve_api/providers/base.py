from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Protocol

from eve_api.schemas import ChatRequest
from eve_api.settings import ProviderSettings


class ProviderError(Exception):
    """Safe, user-facing provider failure without upstream secret details."""


class Provider(Protocol):
    settings: ProviderSettings

    async def stream(self, request: ChatRequest) -> AsyncIterator[tuple[str, int | None]]:
        """Yield text deltas and optional token counts."""


def messages_for_openai(request: ChatRequest) -> list[dict[str, object]]:
    messages: list[dict[str, object]] = []
    for turn in request.turns[-16:]:
        role = "assistant" if turn.role == "eve" else "user"
        blocks: list[dict[str, object]] = []
        if turn.text.strip():
            blocks.append({"type": "text", "text": turn.text})
        for attachment in turn.attachments:
            data = "".join(attachment.data.split())
            blocks.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{attachment.mediaType};base64,{data}"
                    },
                }
            )
        content: object = blocks if len(blocks) != 1 or blocks[0]["type"] != "text" else blocks[0]["text"]
        messages.append({"role": role, "content": content})
    return messages
