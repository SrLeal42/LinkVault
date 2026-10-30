from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Ambiente e Aplicação
    app_name: str = "LinkVault API"
    app_version: str = "0.1.0"
    environment: Literal["development", "test", "production"] = "development"
    enable_docs: bool = True

    # Banco de Dados (PostgreSQL 17 + psycopg 3)
    database_url: str = Field(
        default="postgresql+psycopg://linkvault:linkvault_dev@localhost:5432/linkvault"
    )

    # Segurança & Argon2id (OWASP mínimo: m=19 MiB -> 19456 KiB, t=2, p=1)
    argon2_memory_cost: int = 19456
    argon2_time_cost: int = 2
    argon2_parallelism: int = 1
    password_min_length: int = 12
    password_max_length: int = 128

    # Sessões (em segundos)
    session_idle_ttl_seconds: int = 60 * 60 * 24 * 7  # 7 dias
    session_absolute_ttl_seconds: int = 60 * 60 * 24 * 30  # 30 dias

    # Origens confiáveis para validação de Origin/Referer (CSRF)
    allowed_origins: list[str] = ["http://localhost:5173"]

    # Modo de demonstração
    demo_mode: bool = True
    demo_ttl_hours: int = 24

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def show_docs(self) -> bool:
        return self.enable_docs and not self.is_production


@lru_cache
def get_settings() -> Settings:
    return Settings()
