from __future__ import annotations

import httpx
from fastapi import HTTPException

from eve_api.settings import Settings


BASE_URL = "https://api.olhovivo.sptrans.com.br/v2.1"


async def search_lines(settings: Settings, term: str) -> object:
    return await _request(settings, "GET", "/Linha/Buscar", params={"termosBusca": term})


async def search_stops(settings: Settings, term: str) -> object:
    return await _request(settings, "GET", "/Parada/Buscar", params={"termosBusca": term})


async def arrivals(settings: Settings, stop_code: int) -> object:
    return await _request(
        settings,
        "GET",
        "/Previsao/Parada",
        params={"codigoParada": stop_code},
    )


async def _request(
    settings: Settings,
    method: str,
    path: str,
    *,
    params: dict[str, str | int],
) -> object:
    if not settings.sptrans_token:
        raise HTTPException(status_code=503, detail="Configure SPTRANS_API_TOKEN no backend.")
    timeout = httpx.Timeout(15.0, connect=5.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            auth = await client.post(
                f"{BASE_URL}/Login/Autenticar",
                params={"token": settings.sptrans_token},
            )
            if auth.status_code >= 400 or auth.text.strip().lower() != "true":
                raise HTTPException(status_code=502, detail="A autenticação SPTrans falhou.")
            response = await client.request(
                method,
                f"{BASE_URL}{path}",
                params=params,
                cookies=auth.cookies,
                headers={"Accept": "application/json"},
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="A SPTrans demorou para responder.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Não foi possível consultar a SPTrans.") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"A SPTrans respondeu HTTP {response.status_code}.")
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="A SPTrans retornou uma resposta inválida.") from exc
