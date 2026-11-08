# Yerel AI Platformu — kontrol düzlemi + CPU modül çalışma zamanı
# Ağır model kütüphaneleri (torch, paddle, faster-whisper) imaja gömülmez; modül kurulumunda
# pip ile /data altındaki sanal ortama eklenir. Böylece temel imaj küçük kalır.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      tesseract-ocr tesseract-ocr-tur tesseract-ocr-eng \
      libgomp1 curl ca-certificates docker-cli \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml README.md ./
COPY aiplatform ./aiplatform
COPY catalog ./catalog
RUN pip install -e ".[kvkk,belge,gomme,text2sql,erp-sql]"

VOLUME ["/data"]
EXPOSE 8080
CMD ["aiplatform", "serve", "--role", "server", "--host", "0.0.0.0", "--port", "8080"]
