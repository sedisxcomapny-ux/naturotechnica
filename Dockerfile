FROM python:3.11.9-slim-bullseye

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip

COPY requirements.txt .

# Install the heavy scientific deps first, wheel-only. If no wheel exists
# for this platform/python, fail fast instead of compiling from source.
RUN pip install --no-cache-dir --only-binary=:all: \
    pandas==2.2.2 \
    numpy==1.26.4

# Install the rest. pip sees pandas/numpy already satisfied and won't
# touch them. --only-binary=:all: still enforces wheel-only for everything.
RUN pip install --no-cache-dir --only-binary=:all: -r requirements.txt

COPY backend/ ./backend/
COPY data/ ./data/

EXPOSE 8000

CMD ["uvicorn", "backend.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
