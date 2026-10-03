from __future__ import annotations

import secrets

from fastapi import Header, HTTPException, status

from eve_api.settings import load_settings


async def require_api_key(x_eve_api_key: str | None = Header(default=None)) -> None:
    expected = load_settings().api_token
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="EVE_API_TOKEN não está configurado no servidor.",
        )
    if not x_eve_api_key or not secrets.compare_digest(x_eve_api_key, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Chave de acesso entre os serviços inválida.",
        )
