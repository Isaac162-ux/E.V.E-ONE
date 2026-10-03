from __future__ import annotations

from urllib.parse import quote

import httpx
from fastapi import HTTPException

from eve_api.schemas import RouteRequest
from eve_api.settings import Settings


async def geocode(settings: Settings, address: str) -> dict[str, object]:
    if not settings.google_maps_key:
        raise HTTPException(status_code=503, detail="Configure GOOGLE_MAPS_API_KEY no backend.")
    return await _google_request(
        settings,
        "GET",
        f"https://geocode.googleapis.com/v4beta/geocode/address/{quote(address, safe='')}",
    )


async def compute_route(settings: Settings, route: RouteRequest) -> dict[str, object]:
    if not settings.google_maps_key:
        raise HTTPException(status_code=503, detail="Configure GOOGLE_MAPS_API_KEY no backend.")
    body = {
        "origin": {"address": route.origin},
        "destination": {"address": route.destination},
        "travelMode": route.travel_mode,
    }
    return await _google_request(
        settings,
        "POST",
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        json=body,
        headers={"X-Goog-FieldMask": "routes.duration,routes.distanceMeters"},
    )


async def _google_request(
    settings: Settings,
    method: str,
    url: str,
    *,
    params: dict[str, str] | None = None,
    json: dict[str, object] | None = None,
    headers: dict[str, str] | None = None,
) -> dict[str, object]:
    request_headers = {"X-Goog-Api-Key": settings.google_maps_key, **(headers or {})}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
            response = await client.request(
                method, url, params=params, json=json, headers=request_headers
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Google Maps demorou para responder.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Não foi possível consultar Google Maps.") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Google Maps respondeu HTTP {response.status_code}.")
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Google Maps retornou uma resposta inválida.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Google Maps retornou um formato inesperado.")
    return payload
