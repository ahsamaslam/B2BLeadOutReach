FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Install Playwright Chromium deps - use --fix-missing to handle DNS issues
RUN apt-get update --fix-missing && apt-get install -y --no-install-recommends --fix-missing \
        libnss3 libnspr4 libdbus-1-3 \
        libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 \
        libcups2 libdrm2 libgbm1 \
        libxkbcommon0 libxcomposite1 libxdamage1 libxext6 \
        libxfixes3 libxrandr2 libx11-6 libxcb1 libxcursor1 libxi6 libxtst6 \
        libpango-1.0-0 libcairo2 \
        fonts-liberation ca-certificates wget \
    && rm -rf /var/lib/apt/lists/* \
    && playwright install chromium || true

COPY app ./app
COPY .env.example ./.env

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
