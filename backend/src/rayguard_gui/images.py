"""The same bounded image normalization for uploads and exported scanner files."""

import io
import re
import warnings

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from .config import Settings


def reject(status: int, code: str, message: str):
    raise HTTPException(status, detail={"code": code, "message": message})


def normalize_image(
    content: bytes, filename: str, settings: Settings, *, folder: bool = False,
) -> tuple:
    if len(content) > settings.max_upload_bytes:
        reject(413, "upload_too_large", "The selected image exceeds the upload limit.")
    if not content:
        reject(422, "invalid_image", "Select a nonempty PNG or JPEG image.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as source:
                formats = ("PNG", "JPEG", "BMP") if folder else ("PNG", "JPEG")
                if source.format not in formats:
                    reject(415, "unsupported_format", "The image format is not supported by this input.")
                if source.width * source.height > settings.max_pixels:
                    reject(413, "too_many_pixels", "The image dimensions exceed the pixel limit.")
                if getattr(source, "n_frames", 1) != 1:
                    reject(415, "animated_image", "Use a single-frame image.")
                source.verify()
            with Image.open(io.BytesIO(content)) as source:
                source.load()
                canonical = ImageOps.exif_transpose(source).convert("RGB")
                canonical = Image.frombytes("RGB", canonical.size, canonical.tobytes())
                buffer = io.BytesIO()
                canonical.save(buffer, format="PNG")
                pixels = buffer.getvalue()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        reject(413, "too_many_pixels", "The image dimensions exceed the pixel limit.")
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        reject(422, "invalid_image", "The file could not be decoded as a complete image.")
    name = (filename or "scan").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()[:160] or "scan"
    return name, canonical.width, canonical.height, pixels
