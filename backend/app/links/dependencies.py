import uuid
from typing import Annotated

from fastapi import Depends

from app.auth.dependencies import CurrentUser, DbSession
from app.links.models import Link
from app.links.service import resolve_owned_link


def get_owned_link(
    link_id: uuid.UUID,
    current_user: CurrentUser,
    session: DbSession,
) -> Link:
    return resolve_owned_link(
        session,
        link_id=link_id,
        user_id=current_user.id,
    )


OwnedLink = Annotated[Link, Depends(get_owned_link)]
