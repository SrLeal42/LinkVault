import uuid
from typing import Annotated

from fastapi import Depends

from app.auth.dependencies import CurrentUser, DbSession
from app.tags.models import Tag
from app.tags.service import resolve_owned_tag


def get_owned_tag(
    tag_id: uuid.UUID,
    current_user: CurrentUser,
    session: DbSession,
) -> Tag:
    return resolve_owned_tag(
        session,
        tag_id=tag_id,
        user_id=current_user.id,
    )


OwnedTag = Annotated[Tag, Depends(get_owned_tag)]
