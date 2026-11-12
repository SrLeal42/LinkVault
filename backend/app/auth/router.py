from typing import Annotated

from fastapi import APIRouter, Header, Request, Response, status

from app.auth.dependencies import CurrentSession, DbSession
from app.auth.schemas import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    UserResponse,
)
from app.auth.service import (
    authenticate_user,
    change_user_password,
    create_demo_user_and_session,
    register_user,
    revoke_session_by_token,
)
from app.core.security import (
    CSRF_HEADER_NAME,
    clear_session_cookie,
    extract_client_ip,
    extract_session_token,
    set_session_cookie,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    operation_id="register_user",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastra um novo usuário e inicia a sessão",
)
def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    session: DbSession,
    user_agent: Annotated[str | None, Header(include_in_schema=False)] = None,
) -> AuthResponse:
    client_ip = extract_client_ip(request)
    result = register_user(session, payload, client_ip=client_ip, user_agent=user_agent)
    set_session_cookie(response, result.raw_session_token)
    return AuthResponse(
        user=UserResponse.model_validate(result.user),
        csrf_token=result.csrf_token,
    )


@router.post(
    "/login",
    operation_id="login_user",
    response_model=AuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Autentica o usuário e inicia uma nova sessão",
)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: DbSession,
    user_agent: Annotated[str | None, Header(include_in_schema=False)] = None,
) -> AuthResponse:
    client_ip = extract_client_ip(request)
    result = authenticate_user(session, payload, client_ip=client_ip, user_agent=user_agent)
    set_session_cookie(response, result.raw_session_token)
    return AuthResponse(
        user=UserResponse.model_validate(result.user),
        csrf_token=result.csrf_token,
    )


@router.post(
    "/demo",
    operation_id="create_demo_session",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cria um usuário de demonstração efêmero e inicia uma nova sessão",
)
def login_demo(
    request: Request,
    response: Response,
    session: DbSession,
    user_agent: Annotated[str | None, Header(include_in_schema=False)] = None,
) -> AuthResponse:
    client_ip = extract_client_ip(request)
    result = create_demo_user_and_session(
        session,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    set_session_cookie(response, result.raw_session_token)
    return AuthResponse(
        user=UserResponse.model_validate(result.user),
        csrf_token=result.csrf_token,
    )


@router.get(
    "/me",
    operation_id="get_current_user_session",
    response_model=AuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Retorna os dados do usuário autenticado e o token CSRF da sessão",
)
def get_me(auth_session: CurrentSession) -> AuthResponse:
    return AuthResponse(
        user=UserResponse.model_validate(auth_session.user),
        csrf_token=auth_session.session.csrf_token,
    )


@router.post(
    "/logout",
    operation_id="logout_user",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Encerra a sessão atual e remove o cookie de autenticação",
)
def logout(request: Request, response: Response, session: DbSession) -> None:
    raw_token = extract_session_token(request)
    csrf_token = request.headers.get(CSRF_HEADER_NAME)
    revoke_session_by_token(session, raw_token, csrf_token_header=csrf_token)
    clear_session_cookie(response)


@router.post(
    "/password",
    operation_id="change_password",
    response_model=AuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Altera a senha do usuário, revoga sessões anteriores e rotaciona a sessão atual",
)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    response: Response,
    auth_session: CurrentSession,
    session: DbSession,
    user_agent: Annotated[str | None, Header(include_in_schema=False)] = None,
) -> AuthResponse:
    client_ip = extract_client_ip(request)
    result = change_user_password(
        session,
        auth_session=auth_session,
        payload=payload,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    set_session_cookie(response, result.raw_session_token)
    return AuthResponse(
        user=UserResponse.model_validate(result.user),
        csrf_token=result.csrf_token,
    )
