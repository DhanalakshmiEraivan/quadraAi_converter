import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
import base64
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

MAX_FILE_BYTES = int(os.getenv("MAX_FILE_BYTES", str(100 * 1024 * 1024)))
ALLOWED_OFFICE = {".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".odt", ".ods", ".odp"}
ALLOWED_HTML = {".html", ".htm"}
ALLOWED_PDF = {".pdf"}

app = FastAPI(title="QuadraConverter Conversion API", version="2.0.0")
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "*").split(",") if x.strip()]
allow_credentials = "*" not in origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=allow_credentials,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

def binary_path(*names: str) -> str:
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    raise RuntimeError(f"Required converter is not installed: {', '.join(names)}")

def cleanup(path: Path):
    shutil.rmtree(path, ignore_errors=True)

def save_upload(upload: UploadFile, work: Path, allowed: set[str]) -> Path:
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in allowed:
        raise HTTPException(400, f"Unsupported file type: {suffix or 'unknown'}")
    source = work / Path(upload.filename or f"input{suffix}").name
    size = 0
    with source.open("wb") as out:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_FILE_BYTES:
                raise HTTPException(413, f"File exceeds the {MAX_FILE_BYTES // (1024 * 1024)} MB conversion limit.")
            out.write(chunk)
    return source

def run_checked(args: list[str], timeout: int = 180):
    try:
        proc = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)
    except FileNotFoundError as exc:
        raise HTTPException(500, str(exc))
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "Conversion timed out. Try a smaller file.")
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "Conversion failed").strip()
        raise HTTPException(422, detail[-3000:])
    return proc

def office_to_pdf(source: Path, outdir: Path, profile: Path):
    binary = binary_path("soffice", "libreoffice")
    outdir.mkdir(exist_ok=True)
    profile.mkdir(exist_ok=True)
    run_checked([
        binary, "--headless", "--convert-to", "pdf", "--outdir", str(outdir),
        "-env:UserInstallation=file://" + str(profile), str(source)
    ], timeout=240)
    pdf = outdir / f"{source.stem}.pdf"
    if not pdf.exists() or pdf.stat().st_size == 0:
        raise HTTPException(422, "LibreOffice produced no PDF.")
    return pdf

def html_to_pdf(source: Path, outdir: Path, profile: Path):
    # LibreOffice provides a deterministic server-side HTML renderer without
    # exposing the user's browser DOM or relying on client-side text extraction.
    return office_to_pdf(source, outdir, profile)

def qpdf_transform(source: Path, output: Path, password: str | None, mode: str):
    qpdf = binary_path("qpdf")
    if mode == "unlock":
        run_checked([qpdf, "--password=" + (password or ""), "--decrypt", str(source), str(output)])
    elif mode == "protect":
        if not password:
            raise HTTPException(400, "A password is required.")
        run_checked([
            qpdf, "--encrypt", password, password, "256",
            "--", str(source), str(output)
        ])
    else:
        raise HTTPException(400, "Unsupported qpdf operation.")
    if not output.exists() or output.stat().st_size == 0:
        raise HTTPException(422, "qpdf produced no output.")
    return output

def pdf_to_pdfa(source: Path, output: Path):
    # Ghostscript's PDF/A mode is used when available. This is intentionally
    # server-only because browser PDF libraries cannot produce a standards-
    # conforming PDF/A archive reliably.
    gs = binary_path("gs", "gswin64c", "gswin32c")
    run_checked([
        gs, "-dPDFA=2", "-dBATCH", "-dNOPAUSE", "-dSAFER",
        "-sDEVICE=pdfwrite",
        "-sColorConversionStrategy=RGB",
        "-sProcessColorModel=DeviceRGB",
        "-sOutputICCProfile=/usr/share/color/icc/ghostscript/srgb.icc",
        "-dPDFACompatibilityPolicy=1",
        "-o", str(output), str(source)
    ], timeout=240)
    if not output.exists() or output.stat().st_size == 0:
        raise HTTPException(422, "Ghostscript produced no PDF/A output.")
    return output

def translation_request(text: str, target_lang: str) -> str:
    # Optional external translation service. The API is intentionally opt-in.
    import json
    import urllib.request
    endpoint = os.getenv("TRANSLATION_API_URL")
    if not endpoint:
        raise HTTPException(503, "TRANSLATION_API_URL is not configured on the conversion server.")
    payload = json.dumps({"q": text, "target": target_lang, "source": "auto", "format": "text"}).encode()
    req = urllib.request.Request(endpoint, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode())
    except Exception as exc:
        raise HTTPException(502, f"Translation service failed: {exc}")
    return body.get("translatedText") or body.get("translation") or body.get("text") or ""

def extract_pdf_text(source: Path) -> str:
    # Used only for the optional translation tool; preserve page boundaries.
    try:
        import fitz
    except ImportError:
        raise HTTPException(500, "PyMuPDF is required for PDF translation.")
    doc = fitz.open(source)
    return "\n\n".join(page.get_text() for page in doc)
@app.post("/send-email")
async def send_email(
    file: UploadFile = File(...),
    to: str = Form(...),
    subject: str = Form(...),
    tool: str = Form(...),
):
    api_key = os.getenv("RESEND_API_KEY")
    email_from = os.getenv(
        "EMAIL_FROM",
        "QuadraConverter <onboarding@resend.dev>"
    )

    if not api_key:
        raise HTTPException(
            503,
            "Email service is not configured."
        )

    if not to or "@" not in to:
        raise HTTPException(
            400,
            "Please provide a valid email address."
        )

    content = await file.read()

    if not content:
        raise HTTPException(
            400,
            "The converted file is empty."
        )

    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            413,
            "The file is too large to email."
        )

    try:
        import resend

        resend.api_key = api_key

        attachment = {
            "filename": file.filename or "converted-file",
            "content": list(content),
        }

        response = resend.Emails.send({
            "from": email_from,
            "to": [to],
            "subject": subject,
            "html": f"""
                <div style="font-family:Arial,sans-serif">
                    <h2>QuadraConverter</h2>

                    <p>
                        Your file has been converted successfully
                        using <strong>{tool}</strong>.
                    </p>

                    <p>
                        The converted file is attached to this email.
                    </p>

                    <p>
                        — QuadraConverter
                    </p>
                </div>
            """,
            "attachments": [attachment],
        })

        return JSONResponse({
            "success": True,
            "message": "Email sent successfully.",
            "id": response.get("id")
            if isinstance(response, dict)
            else None,
        })

    except Exception as exc:
        raise HTTPException(
            502,
            f"Email provider failed: {exc}"
        )
@app.get("/health")
def health():
    result = {"ok": True, "version": "2.0.0", "engines": []}
    for label, names in [
        ("LibreOffice", ("soffice", "libreoffice")),
        ("qpdf", ("qpdf",)),
        ("Ghostscript", ("gs", "gswin64c", "gswin32c")),
    ]:
        try:
            result["engines"].append({"name": label, "available": True, "binary": binary_path(*names)})
        except Exception:
            result["engines"].append({"name": label, "available": False})
    return result

@app.post("/convert")
async def convert(
    file: UploadFile = File(...),
    operation: str = Form(...),
    password: str = Form(""),
    targetLang: str = Form(""),
):
    work = Path(tempfile.mkdtemp(prefix="quadra-convert-"))
    try:
        suffix = Path(file.filename or "").suffix.lower()
        if operation == "office-to-pdf":
            source = save_upload(file, work, ALLOWED_OFFICE)
            pdf = office_to_pdf(source, work / "out", work / "profile")
            return FileResponse(
                pdf, media_type="application/pdf",
                filename=pdf.name,
                background=BackgroundTask(cleanup, work)
            )

        if operation == "html-to-pdf":
            source = save_upload(file, work, ALLOWED_HTML)
            pdf = html_to_pdf(source, work / "out", work / "profile")
            return FileResponse(
                pdf, media_type="application/pdf",
                filename=pdf.name,
                background=BackgroundTask(cleanup, work)
            )

        if operation in {"pdf-unlock", "pdf-protect", "pdf-to-pdfa"}:
            source = save_upload(file, work, ALLOWED_PDF)
            outdir = work / "out"
            outdir.mkdir()
            if operation == "pdf-unlock":
                output = qpdf_transform(source, outdir / f"{source.stem}-unlocked.pdf", password, "unlock")
            elif operation == "pdf-protect":
                output = qpdf_transform(source, outdir / f"{source.stem}-protected.pdf", password, "protect")
            else:
                output = pdf_to_pdfa(source, outdir / f"{source.stem}-pdfa.pdf")
            return FileResponse(
                output, media_type="application/pdf",
                filename=output.name,
                background=BackgroundTask(cleanup, work)
            )

        if operation == "pdf-translate":
            source = save_upload(file, work, ALLOWED_PDF)
            text = extract_pdf_text(source)
            translated = translation_request(text, targetLang or "en")
            output = work / f"{source.stem}-translated.txt"
            output.write_text(translated, encoding="utf-8")
            return FileResponse(
                output, media_type="text/plain; charset=utf-8",
                filename=output.name,
                background=BackgroundTask(cleanup, work)
            )

        raise HTTPException(400, f"Unsupported conversion operation: {operation}")
    except HTTPException:
        cleanup(work)
        raise
    except Exception as exc:
        cleanup(work)
        raise HTTPException(500, str(exc))
