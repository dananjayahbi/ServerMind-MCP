"""GET /health endpoint."""

import time

from fastapi import APIRouter

from ipc.models import HealthResponse
from shared.constants import APP_VERSION

router = APIRouter()
_start_time = time.time()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        version=APP_VERSION,
        uptime_sec=round(time.time() - _start_time, 2),
    )
