from fastapi import APIRouter, status

from app.auth.dependencies import CurrentUser, DbSession
from app.collections.dependencies import OwnedCollection
from app.collections.schemas import (
    CollectionCreateRequest,
    CollectionListResponse,
    CollectionResponse,
    CollectionUpdateRequest,
)
from app.collections.service import (
    create_collection,
    delete_collection,
    get_collection_details,
    list_user_collections,
    update_collection,
)

router = APIRouter(prefix="/collections", tags=["collections"])


@router.get(
    "",
    operation_id="list_collections",
    response_model=CollectionListResponse,
    status_code=status.HTTP_200_OK,
    summary="Lista as coleções do usuário autenticado com a quantidade de links",
)
def list_collections(
    current_user: CurrentUser,
    session: DbSession,
) -> CollectionListResponse:
    items = list_user_collections(session, user_id=current_user.id)
    return CollectionListResponse(items=items)


@router.post(
    "",
    operation_id="create_collection",
    response_model=CollectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cria uma nova coleção privada",
)
def create_collection_endpoint(
    payload: CollectionCreateRequest,
    current_user: CurrentUser,
    session: DbSession,
) -> CollectionResponse:
    return create_collection(session, user_id=current_user.id, payload=payload)


@router.get(
    "/{collection_id}",
    operation_id="get_collection",
    response_model=CollectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Consulta os detalhes de uma coleção do usuário",
)
def get_collection(
    collection: OwnedCollection,
    session: DbSession,
) -> CollectionResponse:
    return get_collection_details(session, collection=collection)


@router.patch(
    "/{collection_id}",
    operation_id="update_collection",
    response_model=CollectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Atualiza nome e/ou descrição de uma coleção do usuário",
)
def update_collection_endpoint(
    payload: CollectionUpdateRequest,
    collection: OwnedCollection,
    session: DbSession,
) -> CollectionResponse:
    return update_collection(session, collection=collection, payload=payload)


@router.delete(
    "/{collection_id}",
    operation_id="delete_collection",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Exclui uma coleção preservando os links associados",
)
def delete_collection_endpoint(
    collection: OwnedCollection,
    session: DbSession,
) -> None:
    delete_collection(session, collection=collection)
