"""Log retrieval endpoint."""

from fastapi import APIRouter, Query

from audit.logger import get_ring_buffer
from ipc.models import LogEntryResponse

router = APIRouter()


@router.get("/logs", response_model=list[LogEntryResponse])
async def get_logs(
    limit: int = Query(default=200, ge=1, le=5000),
    category: str | None = Query(default=None),
    level: str | None = Query(default=None),
    since: str | None = Query(default=None),
) -> list[LogEntryResponse]:
    entries = get_ring_buffer().get_filtered(
        limit=limit,
        category=category,
        level=level,
        since_timestamp=since,
    )
    return [LogEntryResponse(**e.to_dict()) for e in entries]
