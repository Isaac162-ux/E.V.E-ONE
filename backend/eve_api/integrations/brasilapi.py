from __future__ import annotations

import re

import httpx
from fastapi import HTTPException


async def lookup_cep(cep: str) -> dict[str, object]:
    digits = re.sub(r"\D", "", cep)
    if len(digits) != 8:
        raise HTTPException(status_code=422, detail="Informe um CEP com 8 dígitos.")
    return await _get(f"https://brasilapi.com.br/api/cep/v1/{digits}")


async def lookup_cnpj(cnpj: str) -> dict[str, object]:
    digits = re.sub(r"\D", "", cnpj)
    if len(digits) != 14:
        raise HTTPException(status_code=422, detail="Informe um CNPJ com 14 dígitos.")
    return await _get(f"https://brasilapi.com.br/api/cnpj/v1/{digits}")


async def _get(url: str) -> dict[str, object]:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=5.0)) as client:
            response = await client.get(url, headers={"Accept": "application/json"})
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="A BrasilAPI demorou para responder.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Não foi possível consultar a BrasilAPI.") from exc
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Nenhum registro encontrado.")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"A BrasilAPI respondeu HTTP {response.status_code}.")
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="A BrasilAPI retornou uma resposta inválida.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="A BrasilAPI retornou um formato inesperado.")
    return payload
