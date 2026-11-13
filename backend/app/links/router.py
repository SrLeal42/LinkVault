from fastapi import APIRouter, status

from app.auth.dependencies import CurrentUser, DbSession
from app.links.dependencies import OwnedLink
from app.links.schemas import (
    LinkCreateRequest,
    LinkListResponse,
    LinkResponse,
    LinkUpdateRequest,
)
from app.links.service import (
    create_link,
    delete_link,
    get_link_details,
    list_user_links,
    update_link,
)

router = APIRouter(prefix="/links", tags=["links"])


@router.get(
    "",
    operation_id="list_links",
    response_model=LinkListResponse,
    status_code=status.HTTP_200_OK,
    summary="Lista os links do usuário autenticado",
)
def list_links(
    current_user: CurrentUser,
    session: DbSession,
) -> LinkListResponse:
    return list_user_links(session, user_id=current_user.id)


@router.post(
    "",
    operation_id="create_link",
    response_model=LinkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cria um novo link e associa coleção e tags por nome",
)
def create_link_endpoint(
    payload: LinkCreateRequest,
    current_user: CurrentUser,
    session: DbSession,
) -> LinkResponse:
    return create_link(session, user_id=current_user.id, payload=payload)


@router.get(
    "/{link_id}",
    operation_id="get_link",
    response_model=LinkResponse,
    status_code=status.HTTP_200_OK,
    summary="Consulta os detalhes de um link do usuário autenticado",
)
def get_link(link: OwnedLink) -> LinkResponse:
    return get_link_details(link)


@router.patch(
    "/{link_id}",
    operation_id="update_link",
    response_model=LinkResponse,
    status_code=status.HTTP_200_OK,
    summary="Atualiza os campos, coleção e/ou tags de um link do usuário",
)
def update_link_endpoint(
    payload: LinkUpdateRequest,
    link: OwnedLink,
    session: DbSession,
) -> LinkResponse:
    return update_link(session, link=link, payload=payload)


@router.delete(
    "/{link_id}",
    operation_id="delete_link",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Exclui um link do usuário autenticado",
)
def delete_link_endpoint(
    link: OwnedLink,
    session: DbSession,
) -> None:
    delete_link(session, link=link)
