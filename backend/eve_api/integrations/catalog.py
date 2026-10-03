from __future__ import annotations

from eve_api.settings import Settings


def utility_catalog(settings: Settings) -> list[dict[str, object]]:
    return [
        {
            "id": "brasilapi-cep",
            "label": "BrasilAPI · CEP",
            "configured": True,
            "upstreamAuthRequired": False,
            "description": "Consulta endereço brasileiro por CEP.",
        },
        {
            "id": "brasilapi-cnpj",
            "label": "BrasilAPI · CNPJ",
            "configured": True,
            "upstreamAuthRequired": False,
            "description": "Consulta dados cadastrais de empresas por CNPJ.",
        },
        {
            "id": "sptrans-olho-vivo",
            "label": "SPTrans · Olho Vivo",
            "configured": bool(settings.sptrans_token),
            "upstreamAuthRequired": True,
            "description": "Linhas, paradas e previsões de ônibus de São Paulo.",
        },
        {
            "id": "google-maps",
            "label": "Google Maps Platform",
            "configured": bool(settings.google_maps_key),
            "upstreamAuthRequired": True,
            "description": "Geocodificação e cálculo de rotas.",
        },
    ]
