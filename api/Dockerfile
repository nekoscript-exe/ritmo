FROM python:3.13-slim AS runtime
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY auth.py db.py main.py tasks.py calendar_routes.py ./
COPY migrations ./migrations
USER 10001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM runtime AS tests
USER root
COPY requirements-test.txt .
RUN pip install --no-cache-dir -r requirements-test.txt
COPY tests ./tests
USER 10001
CMD ["python", "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests"]

# La construcción normal conserva el servicio original, sin dependencias de prueba.
FROM runtime AS production
