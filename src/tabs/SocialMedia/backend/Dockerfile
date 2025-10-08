FROM python:3.11-slim

# System deps: ffmpeg (moviepy), git (for CLIP)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Speed up installs
ENV PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Python deps
COPY requirements.txt .
RUN pip install -r requirements.txt

# App
COPY . .

# Render provides $PORT; use it if present
CMD ["bash","-lc","uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
