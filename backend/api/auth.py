import os
from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)


def verify_api_key(api_key: str = Security(API_KEY_HEADER)):
    """Guard for mutating / side-effectful endpoints.

    Dev default key is 'test-api-key' (override with env API_KEY). Tests bypass
    this via a FastAPI dependency override; see tests/conftest.py.
    """
    expected = os.getenv("API_KEY", "test-api-key")
    if api_key != expected:
        raise HTTPException(status_code=403, detail="Forbidden")
    return api_key
