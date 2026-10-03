from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field


ProviderId = Literal["gemini", "openrouter", "groq"]


class Attachment(BaseModel):
    mediaType: Literal["image/jpeg", "image/png", "image/webp"]
    data: str = Field(min_length=16, max_length=12_000_000)


class Turn(BaseModel):
    role: Literal["user", "eve"]
    text: str = Field(max_length=20_000)
    attachments: list[Attachment] = Field(default_factory=list, max_length=4)


class ChatRequest(BaseModel):
    provider: ProviderId | None = None
    turns: list[Turn] = Field(min_length=1, max_length=40)
    facts: list[Annotated[str, Field(max_length=240)]] = Field(
        default_factory=list, max_length=60
    )
    autonomy: str = Field(default="A1", max_length=40)
    manifest: str = Field(default="", max_length=80_000)


class RouteRequest(BaseModel):
    origin: str = Field(min_length=2, max_length=300)
    destination: str = Field(min_length=2, max_length=300)
    travel_mode: Literal["DRIVE", "WALK", "BICYCLE", "TRANSIT"] = "DRIVE"
