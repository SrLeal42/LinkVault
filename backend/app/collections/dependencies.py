import uuid
from typing import Annotated

from fastapi import Depends

from app.auth.dependencies import CurrentUser, DbSession
from app.collections.models import Collection
from app.collections.service import resolve_owned_collection


def get_owned_collection(
    collection_id: uuid.UUID,
    current_user: CurrentUser,
    session: DbSession,
) -> Collection:
    return resolve_owned_collection(
        session,
        collection_id=collection_id,
        user_id=current_user.id,
    )


OwnedCollection = Annotated[Collection, Depends(get_owned_collection)]
