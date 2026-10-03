from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderSettings:
    id: str
    label: str
    model: str
    api_key: str
    endpoint: str

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.model)


@dataclass(frozen=True)
class Settings:
    api_token: str
    default_provider: str
    gemini: ProviderSettings
    openrouter: ProviderSettings
    groq: ProviderSettings
    sptrans_token: str
    google_maps_key: str
    cors_origins: tuple[str, ...]


def load_settings() -> Settings:
    default_provider = os.getenv("EVE_DEFAULT_PROVIDER", "gemini").strip().lower()
    if default_provider not in {"gemini", "openrouter", "groq"}:
        default_provider = "gemini"

    return Settings(
        api_token=os.getenv("EVE_API_TOKEN", "").strip(),
        default_provider=default_provider,
        gemini=ProviderSettings(
            id="gemini",
            label="Google AI Studio · Gemini",
            model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip(),
            api_key=os.getenv("GEMINI_API_KEY", "").strip(),
            endpoint="https://generativelanguage.googleapis.com/v1beta",
        ),
        openrouter=ProviderSettings(
            id="openrouter",
            label="OpenRouter",
            model=os.getenv("OPENROUTER_MODEL", "").strip(),
            api_key=os.getenv("OPENROUTER_API_KEY", "").strip(),
            endpoint=os.getenv(
                "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
            ).rstrip("/"),
        ),
        groq=ProviderSettings(
            id="groq",
            label="Groq",
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip(),
            api_key=os.getenv("GROQ_API_KEY", "").strip(),
            endpoint=os.getenv(
                "GROQ_BASE_URL", "https://api.groq.com/openai/v1"
            ).rstrip("/"),
        ),
        sptrans_token=os.getenv("SPTRANS_API_TOKEN", "").strip(),
        google_maps_key=os.getenv("GOOGLE_MAPS_API_KEY", "").strip(),
        cors_origins=tuple(
            origin.strip()
            for origin in os.getenv("EVE_CORS_ORIGINS", "").split(",")
            if origin.strip()
        ),
    )


def providers(settings: Settings) -> list[ProviderSettings]:
    return [settings.gemini, settings.openrouter, settings.groq]
