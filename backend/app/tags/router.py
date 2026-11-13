from fastapi import APIRouter, status

from app.auth.dependencies import CurrentUser, DbSession
from app.tags.dependencies import OwnedTag
from app.tags.schemas import (
    TagCreateRequest,
    TagListResponse,
    TagResponse,
    TagUpdateRequest,
)
from app.tags.service import (
    create_tag,
    delete_tag,
    list_user_tags,
    update_tag,
)

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get(
    "",
    operation_id="list_tags",
    response_model=TagListResponse,
    status_code=status.HTTP_200_OK,
    summary="Lista as tags do usuário autenticado",
)
def list_tags(
    current_user: CurrentUser,
    session: DbSession,
) -> TagListResponse:
    tags = list_user_tags(session, user_id=current_user.id)
    return TagListResponse(items=[TagResponse.model_validate(tag) for tag in tags])


@router.post(
    "",
    operation_id="create_tag",
    response_model=TagResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cria uma nova tag para o usuário autenticado",
)
def create_tag_endpoint(
    payload: TagCreateRequest,
    current_user: CurrentUser,
    session: DbSession,
) -> TagResponse:
    tag = create_tag(session, user_id=current_user.id, payload=payload)
    return TagResponse.model_validate(tag)


@router.patch(
    "/{tag_id}",
    operation_id="update_tag",
    response_model=TagResponse,
    status_code=status.HTTP_200_OK,
    summary="Renomeia uma tag do usuário autenticado",
)
def update_tag_endpoint(
    payload: TagUpdateRequest,
    tag: OwnedTag,
    session: DbSession,
) -> TagResponse:
    updated = update_tag(session, tag=tag, payload=payload)
    return TagResponse.model_validate(updated)


@router.delete(
    "/{tag_id}",
    operation_id="delete_tag",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Exclui uma tag do usuário autenticado",
)
def delete_tag_endpoint(
    tag: OwnedTag,
    session: DbSession,
) -> None:
    delete_tag(session, tag=tag)
