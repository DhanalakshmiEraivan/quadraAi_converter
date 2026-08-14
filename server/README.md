# QuadraConverter Conversion Server

This service provides **real Office rendering** for DOC/DOCX, PPT/PPTX and XLS/XLSX -> PDF using LibreOffice. Browser-only libraries cannot reproduce Office layout reliably.

## Run locally

1. Install LibreOffice.
2. Create a Python environment and install `server/requirements.txt`.
3. Start:

```bash
uvicorn converter_api:app --host 0.0.0.0 --port 8000
```

Set the frontend environment variable:

```env
VITE_CONVERTER_API_URL=http://localhost:8000
```

For production, deploy the included Dockerfile and set `CORS_ORIGINS` to your frontend origin.

## Health check

`GET /health`
