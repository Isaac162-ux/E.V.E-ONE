from __future__ import annotations

import json
from collections.abc import AsyncIterator
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from eve_api.integrations import brasilapi, google_maps, sptrans
from eve_api.integrations.catalog import utility_catalog
from eve_api.providers.base import ProviderError
from eve_api.providers.registry import provider_registry, provider_status
from eve_api.schemas import ChatRequest, RouteRequest
from eve_api.security import require_api_key
from eve_api.settings import load_settings


load_dotenv(Path(__file__).resolve().parents[1] / ".env")
settings = load_settings()

app = FastAPI(
    title="E.V.E. REN API",
    version="1.0.0",
    description=(
        "API modular da E.V.E.: streaming com provedores intercambiáveis e "
        "conectores de dados externos."
    ),
)
if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-EVE-API-KEY"],
    )


@app.get("/health", tags=["Sistema"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "eve-ren-api"}


@app.get("/v1/providers", dependencies=[Depends(require_api_key)], tags=["IA"])
async def list_providers() -> dict[str, object]:
    return provider_status(load_settings())


@app.post("/v1/chat", dependencies=[Depends(require_api_key)], tags=["IA"])
async def chat(payload: ChatRequest) -> StreamingResponse:
    current_settings = load_settings()
    provider_id = payload.provider or current_settings.default_provider
    provider = provider_registry(current_settings).get(provider_id)

    async def events() -> AsyncIterator[bytes]:
        try:
            if provider is None:
                raise ProviderError("O provedor de IA selecionado não está disponível.")
            async for text, tokens in provider.stream(payload):
                if text:
                    yield _ndjson({"t": "delta", "v": text})
                if tokens is not None:
                    yield _ndjson({"t": "usage", "tokens": tokens})
            yield _ndjson({"t": "done"})
        except ProviderError as exc:
            yield _ndjson({"t": "error", "message": str(exc)})
        except Exception:
            # Do not include upstream response bodies, request data, or credentials.
            yield _ndjson({"t": "error", "message": "Falha inesperada no provedor de IA."})

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no"},
    )


@app.get("/v1/utilities", dependencies=[Depends(require_api_key)], tags=["Integrações"])
async def list_utilities() -> dict[str, object]:
    return {"utilities": utility_catalog(load_settings())}


@app.get("/v1/utilities/cep/{cep}", dependencies=[Depends(require_api_key)], tags=["BrasilAPI"])
async def get_cep(cep: str) -> dict[str, object]:
    return await brasilapi.lookup_cep(cep)


@app.get("/v1/utilities/cnpj/{cnpj}", dependencies=[Depends(require_api_key)], tags=["BrasilAPI"])
async def get_cnpj(cnpj: str) -> dict[str, object]:
    return await brasilapi.lookup_cnpj(cnpj)


@app.get("/v1/utilities/sptrans/lines", dependencies=[Depends(require_api_key)], tags=["SPTrans"])
async def search_sptrans_lines(term: str = Query(min_length=2, max_length=120)) -> object:
    return await sptrans.search_lines(load_settings(), term.strip())


@app.get("/v1/utilities/sptrans/stops", dependencies=[Depends(require_api_key)], tags=["SPTrans"])
async def search_sptrans_stops(term: str = Query(min_length=2, max_length=120)) -> object:
    return await sptrans.search_stops(load_settings(), term.strip())


@app.get(
    "/v1/utilities/sptrans/stops/{stop_code}/arrivals",
    dependencies=[Depends(require_api_key)],
    tags=["SPTrans"],
)
async def get_sptrans_arrivals(stop_code: int) -> object:
    return await sptrans.arrivals(load_settings(), stop_code)


@app.get("/v1/utilities/maps/geocode", dependencies=[Depends(require_api_key)], tags=["Google Maps"])
async def get_geocode(address: str = Query(min_length=3, max_length=300)) -> dict[str, object]:
    return await google_maps.geocode(load_settings(), address.strip())


@app.post("/v1/utilities/maps/routes", dependencies=[Depends(require_api_key)], tags=["Google Maps"])
async def get_route(route: RouteRequest) -> dict[str, object]:
    return await google_maps.compute_route(load_settings(), route)


def _ndjson(payload: dict[str, object]) -> bytes:
    return (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
