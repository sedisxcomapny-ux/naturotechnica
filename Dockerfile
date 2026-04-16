FROM python:3.11.9-slim-bullseye AS base

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip

COPY requirements.txt .

RUN pip install --no-cache-dir --only-binary=:all: \
    pandas==2.2.2 \
    numpy==1.26.4

RUN pip install --no-cache-dir --only-binary=:all: \
    -r requirements.txt

COPY backend/ ./backend/

RUN mkdir -p data/raw

EXPOSE 8000

CMD ["uvicorn", "backend.api.main:app", \
     "--host", "0.0.0.0", "--port", "8000"]
