from __future__ import annotations

from eve_api.providers.base import Provider
from eve_api.providers.gemini import GeminiProvider
from eve_api.providers.openai_compatible import OpenAICompatibleProvider
from eve_api.settings import ProviderSettings, Settings, providers


def provider_registry(settings: Settings) -> dict[str, Provider]:
    return {
        "gemini": GeminiProvider(settings.gemini),
        "openrouter": OpenAICompatibleProvider(settings.openrouter),
        "groq": OpenAICompatibleProvider(settings.groq),
    }


def provider_status(settings: Settings) -> dict[str, object]:
    return {
        "defaultProvider": settings.default_provider,
        "providers": [
            {
                "id": item.id,
                "label": item.label,
                "model": item.model,
                "configured": item.configured,
            }
            for item in providers(settings)
        ],
    }
