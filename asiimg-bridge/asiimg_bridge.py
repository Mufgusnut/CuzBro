#!/usr/bin/env python3
"""CuzBro ASIImg folder telemetry bridge.

Watches the configured ASIImg output directory for new FITS files, reads a
small set of FITS header values, groups files into capture sessions, and
publishes one current status row to Supabase.
"""
from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, parse, request

try:
    import numpy as np
    from PIL import Image
except ImportError:
    np = None
    Image = None


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"'))


def utc_iso(timestamp: float | None = None) -> str:
    value = datetime.fromtimestamp(timestamp or time.time(), tz=timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def parse_card_value(raw: str) -> Any:
    value = raw.split("/", 1)[0].strip()
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1].strip()
    if value in {"T", "F"}:
        return value == "T"
    try:
        return float(value) if any(ch in value for ch in ".Ee") else int(value)
    except ValueError:
        return value


def read_fits_header(path: Path) -> dict[str, Any]:
    headers: dict[str, Any] = {}
    with path.open("rb") as handle:
        for _ in range(64):
            block = handle.read(2880)
            if not block:
                break
            text = block.decode("ascii", errors="ignore")
            for offset in range(0, len(text), 80):
                card = text[offset:offset + 80]
                keyword = card[:8].strip()
                if keyword == "END":
                    return headers
                if len(card) > 10 and card[8:10] == "= ":
                    headers[keyword] = parse_card_value(card[10:])
    return headers


def fits_data_offset(path: Path) -> tuple[dict[str, Any], int]:
    headers: dict[str, Any] = {}
    blocks = 0
    with path.open("rb") as handle:
        while blocks < 256:
            block = handle.read(2880)
            if not block:
                break
            blocks += 1
            text = block.decode("ascii", errors="ignore")
            for offset in range(0, len(text), 80):
                card = text[offset:offset + 80]
                keyword = card[:8].strip()
                if keyword == "END":
                    return headers, blocks * 2880
                if len(card) > 10 and card[8:10] == "= ":
                    headers[keyword] = parse_card_value(card[10:])
    raise ValueError("FITS header END card was not found")


def render_fits_preview(path: Path, destination: Path, max_width: int = 1100) -> None:
    if np is None or Image is None:
        raise RuntimeError("Preview dependencies are missing. Run install-preview-deps.bat once.")

    headers, offset = fits_data_offset(path)
    width = int(headers.get("NAXIS1") or 0)
    height = int(headers.get("NAXIS2") or 0)
    bitpix = int(headers.get("BITPIX") or 0)
    if width <= 0 or height <= 0:
        raise ValueError("FITS image dimensions are missing")

    dtype_map = {
        8: np.dtype("u1"),
        16: np.dtype(">i2"),
        32: np.dtype(">i4"),
        -32: np.dtype(">f4"),
        -64: np.dtype(">f8"),
    }
    dtype = dtype_map.get(bitpix)
    if dtype is None:
        raise ValueError(f"Unsupported FITS BITPIX value: {bitpix}")

    count = width * height
    with path.open("rb") as handle:
        handle.seek(offset)
        raw = handle.read(count * dtype.itemsize)
    if len(raw) < count * dtype.itemsize:
        raise ValueError("FITS pixel data is incomplete")

    pixels = np.frombuffer(raw, dtype=dtype, count=count).reshape((height, width)).astype(np.float32)
    bscale = float(headers.get("BSCALE", 1) or 1)
    bzero = float(headers.get("BZERO", 0) or 0)
    pixels = pixels * bscale + bzero
    finite = np.isfinite(pixels)
    if not finite.any():
        raise ValueError("FITS image contains no finite pixels")

    values = pixels[finite]
    low, high = np.percentile(values, (0.5, 99.7))
    if not np.isfinite(low) or not np.isfinite(high) or high <= low:
        low, high = float(values.min()), float(values.max())
    if high <= low:
        high = low + 1.0

    normalized = np.clip((pixels - low) / (high - low), 0.0, 1.0)
    # A gentle asinh stretch reveals faint nebulosity while retaining bright cores.
    stretched = np.arcsinh(normalized * 12.0) / np.arcsinh(12.0)
    output = np.nan_to_num(stretched, nan=0.0, posinf=1.0, neginf=0.0)
    image = Image.fromarray(np.uint8(np.clip(output * 255.0, 0, 255)), mode="L")

    if image.width > max_width:
        ratio = max_width / image.width
        image = image.resize((max_width, max(1, round(image.height * ratio))), Image.Resampling.LANCZOS)

    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, format="JPEG", quality=88, optimize=True)

def first_number(headers: dict[str, Any], keys: tuple[str, ...]) -> float | None:
    for key in keys:
        value = headers.get(key)
        try:
            if value is not None:
                return float(value)
        except (TypeError, ValueError):
            pass
    return None


@dataclass
class CaptureSession:
    started_at: float | None = None
    last_frame_at: float | None = None
    files: list[Path] = field(default_factory=list)
    intervals: list[float] = field(default_factory=list)
    exposure_seconds: float | None = None
    camera_temperature_c: float | None = None
    gain: float | None = None
    object_name: str | None = None
    latest_file: str | None = None

    def add(self, path: Path, modified: float, headers: dict[str, Any]) -> None:
        if self.last_frame_at is not None and modified > self.last_frame_at:
            self.intervals.append(modified - self.last_frame_at)
            self.intervals = self.intervals[-20:]
        self.started_at = self.started_at or modified
        self.last_frame_at = modified
        self.files.append(path)
        self.latest_file = path.name
        self.exposure_seconds = first_number(headers, ("EXPTIME", "EXPOSURE", "EXPOSUREMS"))
        if self.exposure_seconds and self.exposure_seconds > 1000:
            self.exposure_seconds /= 1000.0
        self.camera_temperature_c = first_number(headers, ("CCD-TEMP", "CCDTEMP", "SENSOR-T", "CAMTEMP", "TEMP"))
        self.gain = first_number(headers, ("GAIN", "EGAIN"))
        obj = headers.get("OBJECT")
        if obj:
            self.object_name = str(obj)

    @property
    def cadence(self) -> float | None:
        if self.intervals:
            ordered = sorted(self.intervals)
            return ordered[len(ordered) // 2]
        if self.exposure_seconds:
            return self.exposure_seconds
        return None


class Supabase:
    def __init__(self, url: str, key: str) -> None:
        self.url = url.rstrip("/")
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        }

    def upsert(self, body: dict[str, Any]) -> None:
        data = json.dumps(body).encode("utf-8")
        req = request.Request(
            f"{self.url}/rest/v1/asiimg_status?on_conflict=station",
            data=data,
            headers=self.headers,
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=10) as response:
                response.read()
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase HTTP {exc.code}: {detail}") from exc

    def upload_preview(self, bucket: str, object_path: str, local_path: Path) -> str:
        encoded_path = "/".join(parse.quote(part, safe="") for part in object_path.split("/"))
        headers = dict(self.headers)
        headers.update({
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
            "Cache-Control": "no-cache, max-age=0",
        })
        req = request.Request(
            f"{self.url}/storage/v1/object/{parse.quote(bucket, safe='')}/{encoded_path}",
            data=local_path.read_bytes(),
            headers=headers,
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=20) as response:
                response.read()
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Preview upload HTTP {exc.code}: {detail}") from exc
        return f"{self.url}/storage/v1/object/public/{parse.quote(bucket, safe='')}/{encoded_path}"


def main() -> int:
    root = Path(__file__).resolve().parent
    load_env(root / ".env")

    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    station = os.getenv("STATION", "eliot").strip() or "eliot"
    output_dir = Path(os.path.expandvars(os.getenv("ASIIMG_OUTPUT_DIR", ""))).expanduser()
    poll_seconds = max(1.0, float(os.getenv("ASIIMG_POLL_SECONDS", "2")))
    session_gap = max(60.0, float(os.getenv("ASIIMG_SESSION_GAP_SECONDS", "300")))
    extensions = {item.strip().lower() for item in os.getenv("ASIIMG_EXTENSIONS", ".fit,.fits,.fts").split(",") if item.strip()}
    preview_enabled = os.getenv("ASIIMG_PREVIEW_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
    preview_bucket = os.getenv("ASIIMG_PREVIEW_BUCKET", "asiimg-previews").strip() or "asiimg-previews"
    preview_max_width = max(320, int(os.getenv("ASIIMG_PREVIEW_MAX_WIDTH", "1100")))

    if not supabase_url or not service_key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env", file=sys.stderr)
        return 1
    if not str(output_dir):
        print("ASIIMG_OUTPUT_DIR is required in .env", file=sys.stderr)
        return 1

    client = Supabase(supabase_url, service_key)
    seen: dict[str, tuple[int, float]] = {}
    session = CaptureSession()
    preview_url: str | None = None
    preview_updated_at: str | None = None
    preview_error: str | None = None
    preview_temp = root / "latest-preview.jpg"

    # Snapshot files already present so they are not counted as a new capture
    # session. Files copied in later are detected even when Windows preserves
    # their original modification timestamps.
    if output_dir.exists():
        for path in output_dir.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in extensions:
                continue
            try:
                stat = path.stat()
                seen[str(path.resolve())] = (stat.st_size, stat.st_mtime)
            except OSError:
                pass

    print(f"CuzBro ASIImg monitor online: {output_dir}")
    print(f"Watching extensions: {', '.join(sorted(extensions))}")
    print(f"Existing FITS files ignored at startup: {len(seen)}")

    while True:
        now = time.time()
        try:
            if not output_dir.exists():
                raise FileNotFoundError(f"ASIImg output folder not found: {output_dir}")

            candidates = []
            for path in output_dir.rglob("*"):
                if not path.is_file() or path.suffix.lower() not in extensions:
                    continue
                try:
                    stat = path.stat()
                except OSError:
                    continue
                key = str(path.resolve())
                signature = (stat.st_size, stat.st_mtime)
                if signature == seen.get(key):
                    continue
                candidates.append((stat.st_mtime, path, signature))

            for modified, path, signature in sorted(candidates):
                # Wait until ASIImg has finished writing the file.
                if now - modified < 0.8:
                    continue
                if session.last_frame_at and modified - session.last_frame_at > session_gap:
                    session = CaptureSession()
                headers = read_fits_header(path)
                session.add(path, modified, headers)
                seen[str(path.resolve())] = signature
                if preview_enabled:
                    try:
                        render_fits_preview(path, preview_temp, preview_max_width)
                        base_url = client.upload_preview(preview_bucket, f"{station}/latest.jpg", preview_temp)
                        preview_updated_at = utc_iso()
                        preview_url = f"{base_url}?v={int(time.time() * 1000)}"
                        preview_error = None
                        print(f"PREVIEW | {path.name} -> {preview_url}")
                    except Exception as preview_exc:
                        preview_error = str(preview_exc)
                        print(f"PREVIEW ERROR | {preview_error}", file=sys.stderr)
                print(f"FRAME {len(session.files)} | {path.name} | exp={session.exposure_seconds} temp={session.camera_temperature_c}")

            last_age = now - session.last_frame_at if session.last_frame_at else None
            cadence = session.cadence
            if session.last_frame_at is None:
                state = "waiting"
            elif last_age is not None and last_age <= max(30.0, (cadence or 10.0) * 2.5):
                state = "capturing"
            elif last_age is not None and last_age <= session_gap:
                state = "idle"
            else:
                state = "complete"

            payload = {
                "state": state,
                "directory": str(output_dir),
                "session_started_at": utc_iso(session.started_at) if session.started_at else None,
                "last_frame_at": utc_iso(session.last_frame_at) if session.last_frame_at else None,
                "frames_captured": len(session.files),
                "average_cadence_seconds": round(cadence, 3) if cadence else None,
                "exposure_seconds": session.exposure_seconds,
                "camera_temperature_c": session.camera_temperature_c,
                "gain": session.gain,
                "object_name": session.object_name,
                "latest_file": session.latest_file,
                "preview_url": preview_url,
                "preview_updated_at": preview_updated_at,
                "preview_error": preview_error,
            }
            client.upsert({
                "station": station,
                "updated_at": utc_iso(),
                "online": True,
                "payload": payload,
                "last_error": None,
            })
        except KeyboardInterrupt:
            print("ASIImg monitor stopped.")
            return 0
        except Exception as exc:
            print(f"ASIIMG ERROR | {exc}", file=sys.stderr)
            try:
                client.upsert({
                    "station": station,
                    "updated_at": utc_iso(),
                    "online": False,
                    "payload": None,
                    "last_error": str(exc),
                })
            except Exception as publish_error:
                print(f"SUPABASE ERROR | {publish_error}", file=sys.stderr)
        time.sleep(poll_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
