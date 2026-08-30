FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# System deps for psycopg2 / numpy-scipy wheels are already covered by slim +
# manylinux wheels; add build-essential only if a source build is needed.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-core.txt requirements-ml.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Postgres deployments must run `alembic upgrade head` before/at startup.
CMD ["sh", "-c", "alembic upgrade head || true; uvicorn api.main:app --host 0.0.0.0 --port 8000"]
