# QuadraConverter — 90-tool conversion audit and fixes

## What was audited

The project contains **exactly 90 tools**. Every tool engine has a corresponding `ToolWorkspace` dispatch case and every dispatch target is implemented by an exported converter function.

The audit also fixed several previously broken paths that could silently create incorrect output.

## Major fixes

### Office conversions
- Word/DOCX → PDF uses the server-side LibreOffice renderer.
- PowerPoint/PPTX → PDF uses the server-side LibreOffice renderer.
- Excel/XLSX → PDF uses the server-side LibreOffice renderer.
- HTML file → PDF uses the server-side renderer.
- The frontend no longer falls back to text extraction for Word/Excel, so it will not create a fake text-only PDF when the rendering backend is missing.

### PDF conversions
- PDF → PowerPoint renders each original PDF page into one complete PPTX slide. This prevents blank/text-only slides and preserves the page visually.
- PDF → Word creates a Word page for each rendered PDF page.
- PDF → Excel now groups PDF text by coordinates into spreadsheet rows/cells instead of putting an entire page into one cell.
- PDF split now honors split points such as `5,10`.
- PDF/A, password protection and password removal are backend operations instead of pretending that browser `pdf-lib` provides encryption/PDF-A support.
- PDF translation no longer uses a tiny fake dictionary; it requires a configured translation backend.
- HTML text → PDF uses `html2canvas` to render the actual HTML layout instead of extracting only text.
- BMP image conversion uses a real browser-side BMP encoder when the browser cannot produce BMP through `canvas.toBlob()`.

### Dashboard / authentication
- `inputType: "none"` tools (calculators, UUID/password generators, etc.) now actually display their options and a Run button.
- Dashboard category icons now correctly map `dev` and `calc`.
- Conversion files are uploaded first and only then recorded in history, preventing completed history rows without a stored file.
- Every generated result from multi-output tools gets its own stored history row.
- Historical files use signed Supabase Storage URLs.
- Delete and Clear All remove both history records and stored artifacts.
- Realtime conversion-history refresh remains enabled.
- Dashboard storage limit display is aligned with the 500 MB profile default.
- React preview components use `useEffect` with proper object URL cleanup.

## Backend

Deploy `server/` for:
- DOC/DOCX/PPT/PPTX/XLS/XLSX → PDF
- HTML → PDF
- PDF password unlock
- PDF password protection
- PDF/A conversion
- PDF translation when `TRANSLATION_API_URL` is configured

The Docker image installs:
- LibreOffice
- qpdf
- Ghostscript

Frontend environment:

```env
VITE_CONVERTER_API_URL=https://YOUR-CONVERTER-API.example.com
```

The backend exposes:

```text
GET  /health
POST /convert
```

The `/health` endpoint reports which conversion engines are available.

## Supabase

Run:

`supabase/migrations/20260803083942_create_profiles_and_conversions.sql`

This migration creates:
- user profiles
- conversion history
- persistent output paths
- conversion duration
- private `conversion-files` storage
- owner-scoped Storage RLS
- dashboard statistics RPC
- admin-safe profile/conversion policies

## Verification

The source audit confirms:

- 90 tools
- 90 unique tool IDs
- 87 unique conversion engines
- 0 missing `ToolWorkspace` dispatch cases
- 0 missing converter exports

The local environment supplied with the original archive did not contain complete npm type packages, so a clean `npm install` is required before running:

```bash
npm install
npm run typecheck
npm run build
```

For production, deploy the conversion server and set `VITE_CONVERTER_API_URL` before building the frontend.

## Important accuracy note

"Perfect" conversion means different things for different formats.

- PDF → PPTX/Word is **page-faithful**, not magically editable like the original Office document.
- Office → PDF requires a real Office-compatible renderer such as LibreOffice.
- PDF/A, password encryption/decryption and real translation require backend engines.
- A browser cannot reproduce every proprietary Microsoft Office feature with 100% fidelity without an Office-compatible rendering engine.

The application now **fails explicitly when a required backend is unavailable instead of silently returning an incorrect conversion**.
