"""Extract text from uploaded knowledge files (TXT/MD/CSV/PDF)."""

from __future__ import annotations

import csv
import io
import logging
from typing import Any

logger = logging.getLogger(__name__)


class ExtractionError(Exception):
    """Raised when extraction fails with a clear user-facing code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def extract_text(*, filename: str, mime_type: str | None, data: bytes) -> tuple[str, dict[str, Any]]:
    """Return (text, metadata). Raises ExtractionError on failure."""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mime = (mime_type or "").split(";")[0].strip().lower()

    if ext in {".txt", ".md", ".markdown"} or mime in {"text/plain", "text/markdown"}:
        text = data.decode("utf-8", errors="replace")
        return text, {"format": ext.lstrip(".") or "txt", "bytes": len(data)}

    if ext == ".csv" or mime in {"text/csv", "application/csv"}:
        return _extract_csv(data), {"format": "csv", "bytes": len(data)}

    if ext == ".pdf" or mime == "application/pdf":
        return _extract_pdf(data)

    raise ExtractionError("UNSUPPORTED_FORMAT", f"Unsupported file type: {ext or mime}")


def _extract_csv(data: bytes) -> str:
    text = data.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows: list[str] = []
    for i, row in enumerate(reader):
        if i >= 5000:
            break
        rows.append(" | ".join(cell.strip() for cell in row))
    return "\n".join(rows)


def _extract_pdf(data: bytes) -> tuple[str, dict[str, Any]]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ExtractionError(
            "PDF_EXTRACTOR_UNAVAILABLE",
            "PDF extraction library is not installed.",
        ) from exc

    try:
        reader = PdfReader(io.BytesIO(data))
        pages: list[str] = []
        for page in reader.pages[:100]:
            pages.append(page.extract_text() or "")
        text = "\n".join(pages).strip()
    except Exception as exc:  # noqa: BLE001
        logger.warning("pdf parse failed: %s", type(exc).__name__)
        raise ExtractionError("PDF_PARSE_FAILED", "Could not parse PDF.") from exc

    if not text:
        raise ExtractionError(
            "PDF_OCR_REQUIRED",
            "PDF has no extractable text (scanned/image PDF). OCR is not enabled.",
        )
    return text, {"format": "pdf", "pages": len(reader.pages), "bytes": len(data)}
