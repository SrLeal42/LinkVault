import argparse
import json
import os
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.main import create_app

DEFAULT_OUTPUT_PATH = Path(__file__).resolve().parent.parent / "openapi.json"


def generate_openapi_schema() -> dict[str, Any]:
    os.environ["ENVIRONMENT"] = "development"
    os.environ["ENABLE_DOCS"] = "true"
    get_settings.cache_clear()

    app = create_app()
    return app.openapi()


def export_openapi(output_path: Path = DEFAULT_OUTPUT_PATH) -> None:
    schema = generate_openapi_schema()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(schema, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    output_path.write_text(serialized, encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Exporta o schema OpenAPI do FastAPI.")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Caminho do arquivo openapi.json de saída.",
    )
    args = parser.parse_args()
    export_openapi(args.output)


if __name__ == "__main__":
    main()
