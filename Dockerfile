FROM python:3.11.9-slim-bullseye

WORKDIR /app

RUN apt-get update && apt-get install -y gcc g++ \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --upgrade pip \
    && pip install --no-cache-dir \
        pandas==2.2.2 \
        numpy==1.26.4 \
        fastapi==0.111.0 \
        "uvicorn[standard]==0.29.0" \
        python-dotenv==1.0.1 \
        pydantic==2.7.1 \
        "httpx>=0.24,<0.26" \
        python-multipart==0.0.9 \
        aiofiles==23.2.1 \
        supabase==2.4.0 \
        requests==2.32.3 \
        openmeteo-requests==1.2.0 \
        requests-cache==1.2.0 \
        retry-requests==2.0.0 \
        apscheduler==3.10.4 \
        shapely==2.0.4

COPY backend/ ./backend/

COPY start.sh .
RUN chmod +x /app/start.sh

RUN mkdir -p data/raw

EXPOSE 8000

CMD ["uvicorn", "backend.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
