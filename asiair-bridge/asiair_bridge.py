#!/usr/bin/env python3
"""CuzBro ASIAIR network-folder telemetry bridge.

Watches the configured ASIAIR image directory for new FITS files, reads a
small set of FITS header values, groups files into capture sessions, and
publishes one current status row to Supabase.
"""
from __future__ import annotations

import json
import os
import sys
import time
import subprocess
import shlex
import socket
import threading
import io
import zipfile
import hashlib
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from collections import deque
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
        exposure = first_number(headers, ("EXPTIME", "EXPOSURE", "EXPOSUREMS"))
        if exposure is not None:
            if exposure > 1000:
                exposure /= 1000.0
            self.exposure_seconds = exposure
        camera_temperature = first_number(headers, ("CCD-TEMP", "CCDTEMP", "SENSOR-T", "CAMTEMP", "TEMP"))
        if camera_temperature is not None:
            self.camera_temperature_c = camera_temperature
        gain = first_number(headers, ("GAIN", "EGAIN"))
        if gain is not None:
            self.gain = gain
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
            f"{self.url}/rest/v1/asiair_status?on_conflict=station",
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

    def next_command(self, station: str) -> dict[str, Any] | None:
        query = parse.urlencode({
            "station": f"eq.{station}",
            "status": "eq.pending",
            "order": "created_at.asc",
            "limit": "1",
        })
        req = request.Request(
            f"{self.url}/rest/v1/asiair_commands?{query}",
            headers=self.headers,
            method="GET",
        )
        try:
            with request.urlopen(req, timeout=10) as response:
                rows = json.loads(response.read().decode("utf-8"))
                return rows[0] if rows else None
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Command poll HTTP {exc.code}: {detail}") from exc

    def update_command(self, command_id: str, fields: dict[str, Any]) -> None:
        headers = dict(self.headers)
        headers["Prefer"] = "return=minimal"
        req = request.Request(
            f"{self.url}/rest/v1/asiair_commands?id=eq.{parse.quote(command_id, safe='')}",
            data=json.dumps(fields).encode("utf-8"),
            headers=headers,
            method="PATCH",
        )
        try:
            with request.urlopen(req, timeout=10) as response:
                response.read()
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Command update HTTP {exc.code}: {detail}") from exc

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


class AsiairEventMonitor:
    """Read-only listener for the ASIAIR newline-delimited JSON event streams."""

    def __init__(self, host: str, ports: list[int], reconnect_seconds: float = 3.0, max_events: int = 50) -> None:
        self.host = host
        self.ports = ports
        self.reconnect_seconds = max(1.0, reconnect_seconds)
        self.events: deque[dict[str, Any]] = deque(maxlen=max_events)
        self.latest_by_name: dict[str, dict[str, Any]] = {}
        self.connected_ports: set[int] = set()
        self.last_event_at: float | None = None
        self.last_error: str | None = None
        self.sequence_state: dict[str, Any] = {}
        self._lock = threading.Lock()
        self.frame_ready = threading.Event()
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []

    def start(self) -> None:
        for port in self.ports:
            thread = threading.Thread(target=self._listen, args=(port,), daemon=True, name=f"asiair-events-{port}")
            thread.start()
            self._threads.append(thread)

    def stop(self) -> None:
        self._stop.set()

    def _listen(self, port: int) -> None:
        while not self._stop.is_set():
            sock: socket.socket | None = None
            try:
                sock = socket.create_connection((self.host, port), timeout=5)
                sock.settimeout(15)
                with self._lock:
                    self.connected_ports.add(port)
                    self.last_error = None
                buffer = b""
                while not self._stop.is_set():
                    chunk = sock.recv(8192)
                    if not chunk:
                        raise ConnectionError("ASIAIR closed the event stream")
                    buffer += chunk
                    while b"\n" in buffer:
                        raw, buffer = buffer.split(b"\n", 1)
                        raw = raw.strip()
                        if not raw:
                            continue
                        self._record(port, raw)
            except (OSError, ConnectionError) as exc:
                with self._lock:
                    self.connected_ports.discard(port)
                    self.last_error = f"port {port}: {exc}"
                if not self._stop.wait(self.reconnect_seconds):
                    continue
            finally:
                if sock is not None:
                    try:
                        sock.close()
                    except OSError:
                        pass

    def _record(self, port: int, raw: bytes) -> None:
        cleaned = raw.replace(b"<\x90\xadE\xb6>", b"???").replace(b"<\xe8>", b"???")
        try:
            decoded = cleaned.decode("utf-8")
        except UnicodeDecodeError:
            decoded = cleaned.decode("iso-8859-1", errors="replace")
        try:
            message = json.loads(decoded)
        except json.JSONDecodeError:
            message = {"Event": "Unparsed", "raw": decoded[:4000]}
        if not isinstance(message, dict):
            message = {"Event": "Unknown", "value": message}
        event_name = str(message.get("Event") or message.get("event") or "Unknown")
        received = time.time()
        event = dict(message)
        event["_port"] = port
        event["_received_at"] = utc_iso(received)
        with self._lock:
            self.events.append(event)
            if event_name == "Sequence":
                # Terminal/start events often contain only {state: ...}. Preserve the
                # most recent detailed frame counters instead of overwriting them.
                merged = dict(self.sequence_state)
                merged.update(event)
                if isinstance(event.get("frame_summary"), dict):
                    merged["frame_summary"] = dict(event["frame_summary"])
                if isinstance(event.get("target"), dict):
                    merged["target"] = dict(event["target"])
                self.sequence_state = merged
                self.latest_by_name[event_name] = dict(merged)
            else:
                self.latest_by_name[event_name] = event
            self.last_event_at = received
            self.last_error = None
        if (
            port == 4700
            and event_name == "Exposure"
            and str(message.get("state") or "").lower() == "complete"
        ):
            self.frame_ready.set()

        print(f"ASIAIR EVENT {port} | {event_name} | {json.dumps(message, ensure_ascii=False)[:700]}")

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            recent = list(self.events)[-20:]
            latest = dict(self.latest_by_name)
            connected = sorted(self.connected_ports)
            last_event_at = self.last_event_at
            last_error = self.last_error
        return {
            "enabled": True,
            "host": self.host,
            "ports": self.ports,
            "connected_ports": connected,
            "connected": len(connected) == len(self.ports),
            "last_event_at": utc_iso(last_event_at) if last_event_at else None,
            "last_error": last_error,
            "latest_events": latest,
            "recent_events": recent,
        }



class LiveImageHub:
    def __init__(self) -> None:
        self._condition = threading.Condition()
        self.jpeg: bytes | None = None
        self.frame_id = 0
        self.updated_at: float | None = None
        self.last_error: str | None = None

    def publish(self, jpeg: bytes) -> None:
        with self._condition:
            self.jpeg = jpeg
            self.frame_id += 1
            self.updated_at = time.time()
            self.last_error = None
            self._condition.notify_all()

    def fail(self, message: str) -> None:
        with self._condition:
            self.last_error = message

    def wait(self, last_id: int, timeout: float = 20.0) -> tuple[int, bytes | None]:
        with self._condition:
            if self.frame_id <= last_id:
                self._condition.wait(timeout)
            return self.frame_id, self.jpeg

    def snapshot(self) -> dict[str, Any]:
        with self._condition:
            return {
                "enabled": True,
                "frame_id": self.frame_id,
                "updated_at": utc_iso(self.updated_at) if self.updated_at else None,
                "last_error": self.last_error,
                "has_frame": self.jpeg is not None,
            }


class AsiairLiveImageClient:
    """Retrieve the current ASIAIR image from port 4800 and publish JPEGs in memory."""

    ZIP_MAGIC = b"PK\x03\x04"

    def __init__(
        self,
        host: str,
        hub: LiveImageHub,
        port: int = 4800,
        interval: float = 0.15,
        max_width: int = 1400,
        quality: int = 82,
        forced_width: int = 0,
        forced_height: int = 0,
        debug: bool = True,
        frame_ready: threading.Event | None = None,
    ) -> None:
        self.host = host
        self.port = port
        self.hub = hub
        self.interval = max(0.05, interval)
        self.max_width = max(320, max_width)
        self.quality = min(95, max(45, quality))
        self.forced_width = max(0, int(forced_width))
        self.forced_height = max(0, int(forced_height))
        self.debug = bool(debug)
        self.frame_ready = frame_ready
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_digest = ""
        self._request_number = 0

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True, name="asiair-live-image")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _log(self, message: str) -> None:
        if self.debug:
            print(f"ASIAIR LIVE 4800 | {message}")

    @staticmethod
    def _zip_is_complete(data: bytes) -> bool:
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                return archive.testzip() is None and "raw_data" in archive.namelist()
        except (zipfile.BadZipFile, EOFError, OSError):
            return False

    @staticmethod
    def _header_dimensions(prefix: bytes) -> tuple[int, int]:
        if len(prefix) >= 20 and prefix[:2] == b"\x03\xc3":
            width = int.from_bytes(prefix[16:18], "big")
            height = int.from_bytes(prefix[18:20], "big")
            if 0 < width <= 20000 and 0 < height <= 20000:
                return width, height
        return 0, 0

    def _infer_dimensions(self, raw_length: int, width: int, height: int) -> tuple[int, int]:
        if self.forced_width and self.forced_height:
            expected = self.forced_width * self.forced_height * 2
            if expected != raw_length:
                raise RuntimeError(f"Configured dimensions {self.forced_width}x{self.forced_height} expect {expected} bytes, got {raw_length}")
            return self.forced_width, self.forced_height
        if width > 0 and height > 0 and width * height * 2 == raw_length:
            return width, height
        candidates = ((4144,2822),(4144,2820),(8288,5644),(6248,4176),(5496,3672),(4656,3520),(4056,3040),(3096,2080),(1936,1096),(1920,1080),(1280,960),(640,480))
        for w,h in candidates:
            if w*h*2 == raw_length:
                return w,h
        raise RuntimeError(f"Could not infer dimensions from {raw_length} bytes; set ASIAIR_LIVE_IMAGE_WIDTH and ASIAIR_LIVE_IMAGE_HEIGHT")

    def _receive_zip(self, sock: socket.socket) -> tuple[bytes, int, int]:
        buffer = bytearray()
        zip_offset = -1
        started_at = time.time()
        logged = False
        while not self._stop.is_set():
            if time.time() - started_at > 60:
                raise TimeoutError(f"Timed out after {len(buffer)} bytes (ZIP offset={zip_offset})")
            try:
                chunk = sock.recv(1024 * 1024)
            except socket.timeout as exc:
                raise TimeoutError(f"Socket timed out after {len(buffer)} bytes (ZIP offset={zip_offset})") from exc
            if not chunk:
                raise ConnectionError(f"ASIAIR closed port 4800 after {len(buffer)} bytes")
            buffer.extend(chunk)
            if not logged:
                self._log(f"first bytes ({min(64,len(buffer))}): {bytes(buffer[:64]).hex(' ')}")
                logged = True
            if zip_offset < 0:
                zip_offset = buffer.find(self.ZIP_MAGIC)
                if zip_offset >= 0:
                    self._log(f"ZIP signature found at offset {zip_offset}; buffer={len(buffer)} bytes")
            if zip_offset >= 0:
                zipped = bytes(buffer[zip_offset:])
                if self._zip_is_complete(zipped):
                    width, height = self._header_dimensions(bytes(buffer[:zip_offset]))
                    self._log(f"complete ZIP received: {len(zipped)} bytes; header dimensions={width}x{height}")
                    return zipped, width, height
            if len(buffer) > 100_000_000:
                raise RuntimeError("Port 4800 response exceeded 100 MB without a complete ZIP")
        raise RuntimeError("Live image client stopped")

    def _request_image(self, sock: socket.socket) -> tuple[bytes, int, int]:
        self._request_number += 1
        wire = b'{"method":"get_current_img","id":0}\n'
        sock.sendall(wire)
        self._log(f"request #{self._request_number} sent ({len(wire)} bytes)")
        return self._receive_zip(sock)

    def _render(self, zipped: bytes, width: int, height: int) -> bytes:
        if np is None or Image is None:
            raise RuntimeError("Live image requires numpy and Pillow")
        with zipfile.ZipFile(io.BytesIO(zipped)) as archive:
            self._log(f"ZIP entries: {archive.namelist()}")
            raw = archive.read("raw_data")
        width, height = self._infer_dimensions(len(raw), width, height)
        pixels = np.frombuffer(raw, dtype="<u2").reshape((height, width)).astype(np.float32)
        low, high = np.percentile(pixels, (0.4, 99.7))
        if not np.isfinite(low) or not np.isfinite(high) or high <= low:
            low, high = float(np.nanmin(pixels)), float(np.nanmax(pixels))
        if high <= low:
            high = low + 1.0
        normalized = np.clip((pixels-low)/(high-low),0,1)
        stretched = np.arcsinh(normalized*12.0)/np.arcsinh(12.0)
        image = Image.fromarray(np.uint8(np.nan_to_num(stretched,nan=0.0)*255), mode="L")
        if image.width > self.max_width:
            ratio = self.max_width/image.width
            image = image.resize((self.max_width,max(1,round(image.height*ratio))),Image.Resampling.BILINEAR)
        output = io.BytesIO()
        image.save(output,"JPEG",quality=self.quality,optimize=False)
        return output.getvalue()

    def _fetch_once(self) -> tuple[bytes, int, int]:
        """Open port 4800, retrieve one image, then close the socket.

        ASIAIR firmware may close an idle 4800 connection without warning, so a
        short-lived connection per image is more reliable than a persistent one.
        """
        sock: socket.socket | None = None
        try:
            self._log(f"connecting to {self.host}:{self.port}")
            sock = socket.create_connection((self.host, self.port), timeout=8)
            sock.settimeout(60)
            self._log("connected")
            return self._request_image(sock)
        finally:
            if sock is not None:
                try:
                    sock.close()
                except OSError:
                    pass

    def _fetch_until_new(self, attempts: int = 8) -> bool:
        """Fetch after exposure completion, retrying briefly if still stale."""
        last_error: Exception | None = None

        for attempt in range(1, attempts + 1):
            try:
                zipped, width, height = self._fetch_once()
                digest = hashlib.blake2s(zipped, digest_size=12).hexdigest()

                if digest != self._last_digest:
                    jpeg = self._render(zipped, width, height)
                    self.hub.publish(jpeg)
                    self._last_digest = digest
                    self._log(
                        f"published frame {self.hub.frame_id}; JPEG={len(jpeg)} bytes"
                    )
                    return True

                self._log(
                    f"image still unchanged after exposure; retry {attempt}/{attempts}"
                )
            except Exception as exc:
                last_error = exc
                self._log(
                    f"frame fetch attempt {attempt}/{attempts} failed: "
                    f"{type(exc).__name__}: {exc}"
                )

            if attempt < attempts and self._stop.wait(0.25):
                return False

        if last_error is not None:
            self.hub.fail(f"{type(last_error).__name__}: {last_error}")
        self._log("new image did not appear before retry window expired")
        return False

    def _wait_for_frame_signal(self, timeout: float = 60.0) -> bool:
        if self.frame_ready is None:
            return not self._stop.wait(timeout)

        signaled = self.frame_ready.wait(timeout)
        if signaled:
            self.frame_ready.clear()
        return signaled

    def _run(self) -> None:
        # Populate the viewscreen once at startup.
        try:
            self._log("initial image request")
            self._fetch_until_new(attempts=3)
        except Exception as exc:
            self.hub.fail(f"{type(exc).__name__}: {exc}")

        while not self._stop.is_set():
            try:
                if not self._wait_for_frame_signal(60.0):
                    continue

                self._log("exposure complete signal received")
                # Completion can precede the new port-4800 image by a fraction
                # of a second. Wait briefly, then retry using fresh connections.
                if self._stop.wait(0.15):
                    break
                self._fetch_until_new(attempts=8)

            except Exception as exc:
                message = f"{type(exc).__name__}: {exc}"
                self._log(f"ERROR | {message}")
                self.hub.fail(message)
                self._stop.wait(1.0)


class LiveImageHttpServer:
    def __init__(self, hub: LiveImageHub, bind: str, port: int, token: str = "") -> None:
        self.hub = hub
        self.bind = bind
        self.port = port
        self.token = token
        outer = self

        class Handler(BaseHTTPRequestHandler):
            server_version = "CuzBroLive/1.0"
            def log_message(self, fmt: str, *args: Any) -> None:
                return
            def _authorized(self) -> bool:
                if not outer.token:
                    return True
                query = parse.parse_qs(parse.urlsplit(self.path).query)
                return query.get("token", [""])[0] == outer.token
            def _headers(self, content_type: str) -> None:
                self.send_header("Content-Type", content_type)
                self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
                self.send_header("Pragma", "no-cache")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("X-Content-Type-Options", "nosniff")
            def do_GET(self) -> None:
                path = parse.urlsplit(self.path).path
                if path == "/health":
                    body = json.dumps(outer.hub.snapshot()).encode()
                    self.send_response(200); self._headers("application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
                if not self._authorized():
                    self.send_error(HTTPStatus.FORBIDDEN); return
                if path == "/live/latest.jpg":
                    _, jpeg = outer.hub.wait(-1, 0)
                    if not jpeg: self.send_error(HTTPStatus.SERVICE_UNAVAILABLE); return
                    self.send_response(200); self._headers("image/jpeg"); self.send_header("Content-Length", str(len(jpeg))); self.end_headers(); self.wfile.write(jpeg); return
                if path == "/live/stream.mjpg":
                    self.send_response(200); self._headers("multipart/x-mixed-replace; boundary=frame"); self.end_headers()
                    last_id = -1
                    try:
                        while True:
                            frame_id, jpeg = outer.hub.wait(last_id, 25)
                            if not jpeg or frame_id == last_id: continue
                            self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n" + jpeg + b"\r\n")
                            self.wfile.flush(); last_id = frame_id
                    except (BrokenPipeError, ConnectionResetError, OSError):
                        return
                self.send_error(HTTPStatus.NOT_FOUND)

        self._server = ThreadingHTTPServer((bind, port), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True, name="asiair-live-http")

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._server.shutdown()


class AsiairDirectController:
    """Direct newline-delimited JSON command client for ASIAIR imager service."""

    def __init__(self, host: str, port: int = 4700, timeout: float = 12.0) -> None:
        self.host = host
        self.port = port
        self.timeout = timeout
        self._next_id = 10000
        self._lock = threading.Lock()
        self.current_page = "preview"

    def _rpc(self, method: str, params: Any = None) -> dict[str, Any]:
        with self._lock:
            self._next_id += 1
            rpc_id = self._next_id
            message: dict[str, Any] = {"id": rpc_id, "method": method}
            if params is not None:
                message["params"] = params
            wire = (json.dumps(message, separators=(",", ":")) + "\n").encode("utf-8")
            with socket.create_connection((self.host, self.port), timeout=5) as sock:
                sock.settimeout(self.timeout)
                sock.sendall(wire)
                buffer = b""
                deadline = time.time() + self.timeout
                while time.time() < deadline:
                    chunk = sock.recv(8192)
                    if not chunk:
                        break
                    buffer += chunk
                    while b"\n" in buffer:
                        raw, buffer = buffer.split(b"\n", 1)
                        raw = raw.strip()
                        if not raw:
                            continue
                        try:
                            reply = json.loads(raw.decode("utf-8", errors="replace"))
                        except json.JSONDecodeError:
                            continue
                        if isinstance(reply, dict) and reply.get("id") == rpc_id:
                            if int(reply.get("code", 0) or 0) != 0:
                                raise RuntimeError(f"ASIAIR {method} failed: {reply}")
                            return reply
            raise RuntimeError(f"Timed out waiting for ASIAIR response to {method}")

    def execute(self, action: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        arguments = arguments or {}
        if action == "set_mode":
            requested = str(arguments.get("mode") or "").lower()
            page = {"preview": "preview", "autorun": "autosave"}.get(requested)
            if not page:
                raise RuntimeError("Direct control currently supports Preview and Autorun modes")
            self._rpc("set_page", [page])
            self.current_page = page
            return {"message": f"ASIAIR MODE SET TO {requested.upper()}", "mode": requested}
        if action in {"capture", "capture_preview", "start_autorun"}:
            if action == "capture_preview":
                self._rpc("set_page", ["preview"]); self.current_page = "preview"
            elif action == "start_autorun":
                self._rpc("set_page", ["autosave"]); self.current_page = "autosave"
                self._rpc("reset_sequence_progress")
            self._rpc("start_exposure", ["light", False])
            return {"message": "ASIAIR EXPOSURE STARTED", "page": self.current_page}
        if action == "stop_capture":
            self._rpc("stop_exposure", [True])
            self._rpc("stop_send")
            if self.current_page == "autosave":
                self._rpc("clear_autosave_err")
            return {"message": "ASIAIR CAPTURE STOPPED"}
        if action == "set_gain":
            gain = int(arguments.get("gain", 0))
            if not 0 <= gain <= 9999:
                raise RuntimeError("Gain must be between 0 and 9999")
            self._rpc("set_control_value", ["Gain", gain])
            return {"message": f"ASIAIR GAIN SET TO {gain}", "gain": gain}
        if action == "set_exposure":
            seconds = float(arguments.get("seconds", 0))
            if seconds <= 0:
                raise RuntimeError("Exposure must be greater than zero")
            exp_us = int(round(seconds * 1_000_000))
            self._rpc("set_control_value", ["Exposure", exp_us])
            return {"message": f"ASIAIR EXPOSURE SET TO {seconds:g} SEC", "seconds": seconds}
        if action == "configure_autorun":
            seconds = float(arguments.get("seconds", 1))
            count = max(1, int(arguments.get("count", 1)))
            target = str(arguments.get("target") or "CuzBro").strip()[:80]
            gain = int(arguments.get("gain", -10000))
            sequence = [{"autoexp": False, "bin": 1, "capture_index": 1, "enable": True, "exp": seconds, "filter": 0, "gain": gain, "id": 1, "lapsed": 0, "repeat": count, "suffix": f"_{seconds:g}s", "type": "light"}]

            self._rpc("set_page", ["autosave"])
            self.current_page = "autosave"

            # ASIAIR refuses sequence edits while old Autorun progress is retained.
            # Clear any stale error/progress state before replacing the plan.
            try:
                self._rpc("stop_exposure", [True])
            except RuntimeError:
                pass
            try:
                self._rpc("stop_send")
            except RuntimeError:
                pass
            try:
                self._rpc("clear_autosave_err")
            except RuntimeError:
                pass

            self._rpc("reset_sequence_progress")
            time.sleep(0.3)
            self._rpc("set_sequence", sequence)
            self._rpc("set_sequence_setting", [{"group_name": target}])
            return {"message": f"AUTORUN CONFIGURED // {count} × {seconds:g} SEC", "count": count, "seconds": seconds, "target": target}
        if action == "get_sequence_settings":
            result = self._rpc("get_sequence_setting")
            print(
                "ASIAIR SEQUENCE SETTINGS |",
                json.dumps(result, ensure_ascii=False),
            )
            return {
                "message": "ASIAIR SEQUENCE SETTINGS READ",
                "settings": result,
            }

        if action == "plate_solve":
            self._rpc("start_solve")
            return {"message": "PLATE SOLVE STARTED"}
        if action == "toggle_continuous_preview":
            raise RuntimeError("Continuous-preview toggle is not decoded yet; use Preview Start/Stop")
        raise RuntimeError(f"Unsupported direct ASIAIR action: {action}")


class AndroidController:
    def __init__(
        self,
        adb_path: str,
        serial: str,
        package: str,
        activity: str,
        coordinates: dict[str, tuple[int, int]],
        chain_delay: float = 0.5,
    ) -> None:
        self.adb_path = adb_path or "adb"
        self.serial = serial
        self.package = package
        self.activity = activity
        self.coordinates = coordinates
        self.chain_delay = max(0.0, float(chain_delay))

    def _base(self) -> list[str]:
        command = [self.adb_path]
        if self.serial:
            command.extend(["-s", self.serial])
        return command

    def run(self, *args: str, timeout: float = 15) -> str:
        command = self._base() + list(args)
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
        output = (completed.stdout or "") + (completed.stderr or "")
        if completed.returncode != 0:
            raise RuntimeError(f"ADB command failed ({completed.returncode}): {' '.join(shlex.quote(part) for part in command)}\n{output.strip()}")
        return output.strip()

    def ensure_ready(self) -> None:
        state = self.run("get-state")
        if "device" not in state.lower():
            raise RuntimeError(f"Android device is not ready: {state}")
        self.run("shell", "input", "keyevent", "KEYCODE_WAKEUP")
        self.run("shell", "wm", "dismiss-keyguard")
        if self.activity:
            self.run("shell", "am", "start", "-n", f"{self.package}/{self.activity}", timeout=20)
        else:
            self.run("shell", "monkey", "-p", self.package, "-c", "android.intent.category.LAUNCHER", "1", timeout=20)
        time.sleep(1.2)

    def tap(self, name: str, pause: float | None = None) -> None:
        point = self.coordinates.get(name)
        if not point:
            raise RuntimeError(f"Android tap coordinate is not configured: {name}")
        self.run("shell", "input", "tap", str(point[0]), str(point[1]))
        time.sleep(self.chain_delay if pause is None else pause)

    def swipe(self, start_name: str, end_name: str, duration_ms: int = 450, repeat: int = 1, pause: float | None = None) -> None:
        start = self.coordinates.get(start_name)
        end = self.coordinates.get(end_name)
        if not start or not end:
            raise RuntimeError(f"Android swipe coordinates are not configured: {start_name}/{end_name}")
        for _ in range(max(1, repeat)):
            self.run("shell", "input", "swipe", str(start[0]), str(start[1]), str(end[0]), str(end[1]), str(duration_ms))
            time.sleep(self.chain_delay if pause is None else pause)

    def select_mode(self, mode: str) -> None:
        key = f"mode_{mode.lower()}"
        if key not in self.coordinates:
            raise RuntimeError(f"Unsupported or unconfigured ASIAIR mode: {mode}")
        self.tap("mode_menu")
        self.tap(key)

    def set_gain(self, gain: Any) -> None:
        value = str(gain).strip()
        if not value.isdigit() or not (0 <= int(value) <= 9999):
            raise RuntimeError("Gain must be a whole number from 0 to 9999")
        self.tap("settings")
        self.tap("gain_field")
        for _ in range(3):
            self.tap("keypad_clear")
        for digit in value:
            self.tap(f"keypad_{digit}")
        self.tap("keypad_enter")

    def execute(self, action: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        arguments = arguments or {}
        self.ensure_ready()
        if action == "set_mode":
            mode = str(arguments.get("mode") or "").lower()
            self.select_mode(mode)
            return {"message": f"ASIAIR MODE SET TO {mode.upper()}", "mode": mode}
        if action == "capture":
            self.tap("capture")
            return {"message": "ASIAIR CAPTURE BUTTON PRESSED"}
        if action == "capture_preview":
            self.select_mode("preview")
            self.tap("capture")
            return {"message": "PREVIEW CAPTURE STARTED IN ASIAIR APP"}
        if action == "start_autorun":
            self.select_mode("autorun")
            self.tap("capture")
            return {"message": "ASIAIR AUTORUN START COMMAND SENT"}
        if action == "stop_capture":
            self.tap("capture")
            return {"message": "ASIAIR CAPTURE/STOP BUTTON PRESSED"}
        if action == "toggle_continuous_preview":
            self.tap("settings")
            self.swipe("settings_scroll_start", "settings_scroll_end", repeat=6)
            self.tap("continuous_step_1")
            self.tap("continuous_step_2")
            self.tap("continuous_toggle")
            return {"message": "CONTINUOUS PREVIEW TOGGLE PRESSED"}
        if action == "set_gain":
            self.set_gain(arguments.get("gain"))
            return {"message": f"ASIAIR GAIN SET TO {int(arguments.get('gain'))}", "gain": int(arguments.get("gain"))}
        raise RuntimeError(f"Unsupported ASIAIR action: {action}")


def env_point(name: str) -> tuple[int, int] | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    parts = [item.strip() for item in raw.split(",")]
    if len(parts) != 2:
        raise ValueError(f"{name} must be formatted as X,Y")
    return int(parts[0]), int(parts[1])


def main() -> int:
    root = Path(__file__).resolve().parent
    load_env(root / ".env")

    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    station = os.getenv("STATION", "eliot").strip() or "eliot"
    output_dir_raw = os.path.expandvars(os.getenv("ASIAIR_OUTPUT_DIR", "")).strip()
    output_dir = Path(output_dir_raw).expanduser() if output_dir_raw else None
    poll_seconds = max(0.5, float(os.getenv("ASIAIR_POLL_SECONDS", "1")))
    session_gap = max(60.0, float(os.getenv("ASIAIR_SESSION_GAP_SECONDS", "300")))
    extensions = {item.strip().lower() for item in os.getenv("ASIAIR_EXTENSIONS", ".fit,.fits,.fts").split(",") if item.strip()}
    preview_enabled = os.getenv("ASIAIR_PREVIEW_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
    preview_bucket = os.getenv("ASIAIR_PREVIEW_BUCKET", "asiair-previews").strip() or "asiair-previews"
    preview_max_width = max(320, int(os.getenv("ASIAIR_PREVIEW_MAX_WIDTH", "1100")))
    protocol_enabled = os.getenv("ASIAIR_PROTOCOL_MONITOR_ENABLED", "1").strip().lower() in {"1", "true", "yes", "on"}
    protocol_host = os.getenv("ASIAIR_HOST", "").strip()
    protocol_ports = [int(value.strip()) for value in os.getenv("ASIAIR_PROTOCOL_PORTS", "4400,4700").split(",") if value.strip()]
    protocol_reconnect = max(1.0, float(os.getenv("ASIAIR_PROTOCOL_RECONNECT_SECONDS", "3")))
    direct_enabled = os.getenv("ASIAIR_DIRECT_CONTROL_ENABLED", "1").strip().lower() in {"1", "true", "yes", "on"}
    direct_port = int(os.getenv("ASIAIR_DIRECT_CONTROL_PORT", "4700"))
    live_enabled = os.getenv("ASIAIR_LIVE_IMAGE_ENABLED", "1").strip().lower() in {"1", "true", "yes", "on"}
    live_port = int(os.getenv("ASIAIR_LIVE_IMAGE_PORT", "4800"))
    live_interval = max(0.05, float(os.getenv("ASIAIR_LIVE_IMAGE_INTERVAL_SECONDS", "0.15")))
    live_max_width = max(320, int(os.getenv("ASIAIR_LIVE_IMAGE_MAX_WIDTH", "1400")))
    live_quality = int(os.getenv("ASIAIR_LIVE_IMAGE_JPEG_QUALITY", "82"))
    live_width = max(0, int(os.getenv("ASIAIR_LIVE_IMAGE_WIDTH", "0")))
    live_height = max(0, int(os.getenv("ASIAIR_LIVE_IMAGE_HEIGHT", "0")))
    live_debug = os.getenv("ASIAIR_LIVE_IMAGE_DEBUG", "1").strip().lower() in {"1", "true", "yes", "on"}
    live_http_bind = os.getenv("ASIAIR_LIVE_HTTP_BIND", "127.0.0.1").strip() or "127.0.0.1"
    live_http_port = int(os.getenv("ASIAIR_LIVE_HTTP_PORT", "8765"))
    live_token = os.getenv("ASIAIR_LIVE_TOKEN", "").strip()
    adb_enabled = os.getenv("ASIAIR_ANDROID_CONTROL_ENABLED", "0").strip().lower() in {"1", "true", "yes", "on"}
    adb_path = os.path.expandvars(os.getenv("ADB_PATH", "adb").strip()) or "adb"
    adb_serial = os.getenv("ADB_SERIAL", "").strip()
    adb_package = os.getenv("ASIAIR_ANDROID_PACKAGE", "com.zwoasi.asiair").strip() or "com.zwoasi.asiair"
    adb_activity = os.getenv("ASIAIR_ANDROID_ACTIVITY", "").strip()
    adb_chain_delay = max(0.0, float(os.getenv("ASIAIR_CHAIN_DELAY_SECONDS", "0.5")))
    adb_coordinates = {
        "mode_menu": env_point("ASIAIR_TAP_MODE_MENU"),
        "mode_preview": env_point("ASIAIR_TAP_MODE_PREVIEW"),
        "mode_autorun": env_point("ASIAIR_TAP_MODE_AUTORUN"),
        "mode_video": env_point("ASIAIR_TAP_MODE_VIDEO"),
        "mode_focus": env_point("ASIAIR_TAP_MODE_FOCUS"),
        "mode_live": env_point("ASIAIR_TAP_MODE_LIVE"),
        "capture": env_point("ASIAIR_TAP_CAPTURE"),
        "settings": env_point("ASIAIR_TAP_SETTINGS"),
        "settings_scroll_start": env_point("ASIAIR_SWIPE_SETTINGS_START"),
        "settings_scroll_end": env_point("ASIAIR_SWIPE_SETTINGS_END"),
        "continuous_step_1": env_point("ASIAIR_TAP_CONTINUOUS_STEP_1"),
        "continuous_step_2": env_point("ASIAIR_TAP_CONTINUOUS_STEP_2"),
        "continuous_toggle": env_point("ASIAIR_TAP_CONTINUOUS_TOGGLE"),
        "gain_field": env_point("ASIAIR_TAP_GAIN_FIELD"),
        "keypad_clear": env_point("ASIAIR_TAP_KEYPAD_CLEAR"),
        "keypad_enter": env_point("ASIAIR_TAP_KEYPAD_ENTER"),
        **{f"keypad_{digit}": env_point(f"ASIAIR_TAP_KEYPAD_{digit}") for digit in "0123456789"},
    }
    adb_coordinates = {key: value for key, value in adb_coordinates.items() if value is not None}

    if not supabase_url or not service_key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env", file=sys.stderr)
        return 1
    if output_dir is None:
        print("ASIAIR_OUTPUT_DIR is required in .env", file=sys.stderr)
        return 1

    client = Supabase(supabase_url, service_key)
    protocol = AsiairEventMonitor(protocol_host, protocol_ports, protocol_reconnect) if protocol_enabled and protocol_host else None
    if protocol_enabled and not protocol_host:
        print("ASIAIR protocol monitor requested but ASIAIR_HOST is blank; monitor disabled.", file=sys.stderr)
    if protocol:
        protocol.start()
    direct = AsiairDirectController(protocol_host, direct_port) if direct_enabled and protocol_host else None
    live_hub = LiveImageHub()
    live_client = AsiairLiveImageClient(protocol_host, live_hub, live_port, live_interval, live_max_width, live_quality, live_width, live_height, live_debug, protocol.frame_ready if protocol else None) if live_enabled and protocol_host else None
    live_server = LiveImageHttpServer(live_hub, live_http_bind, live_http_port, live_token) if live_client else None
    if live_client:
        live_client.start()
        live_server.start()
    android = AndroidController(adb_path, adb_serial, adb_package, adb_activity, adb_coordinates, adb_chain_delay) if adb_enabled and not direct else None
    controller = direct or android
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

    print(f"CuzBro ASIAIR feed bridge online: {output_dir}")
    print(f"Watching extensions: {', '.join(sorted(extensions))}")
    print(f"Existing FITS files ignored at startup: {len(seen)}")
    print(f"ASIAIR protocol monitor: {'ENABLED' if protocol else 'DISABLED'}")
    if protocol:
        print(f"Protocol target: {protocol_host} | ports: {', '.join(map(str, protocol_ports))}")
    print(f"Direct ASIAIR control: {'ENABLED' if direct else 'DISABLED'}")
    if direct:
        print(f"Direct command target: {protocol_host}:{direct_port}")
    print(f"Live ASIAIR image client: {'ENABLED' if live_client else 'DISABLED'}")
    if live_client:
        print(f"Live image source: {protocol_host}:{live_port} | HTTP: http://{live_http_bind}:{live_http_port}/live/stream.mjpg")
    print(f"Android fallback control: {'ENABLED' if android else 'DISABLED'}")
    if android:
        print(f"ADB target: {adb_serial or 'default connected device'} | package: {adb_package}")

    while True:
        now = time.time()
        try:
            command = client.next_command(station) if controller else None
            if command:
                command_id = str(command.get("id"))
                action = str(command.get("action") or "")
                try:
                    client.update_command(command_id, {"status": "running", "started_at": utc_iso(), "error": None})
                    result = controller.execute(action, command.get("arguments") or {})
                    client.update_command(command_id, {
                        "status": "completed",
                        "completed_at": utc_iso(),
                        "success": True,
                        "result": result,
                        "error": None,
                    })
                    print(f"ASIAIR COMMAND | {action} | complete")
                except Exception as command_exc:
                    client.update_command(command_id, {
                        "status": "failed",
                        "completed_at": utc_iso(),
                        "success": False,
                        "error": str(command_exc),
                    })
                    print(f"ASIAIR COMMAND ERROR | {action} | {command_exc}", file=sys.stderr)

            candidates = []
            if not output_dir.exists():
                preview_error = f"ASIAIR output folder not found: {output_dir}"
            for path in output_dir.rglob("*") if output_dir.exists() else []:
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

            ready_candidates = [item for item in sorted(candidates) if now - item[0] >= 0.5]
            latest_preview_path: Path | None = None

            if ready_candidates:
                # Count every stable FITS file, but decode/render only the newest one.
                # This keeps frame accounting exact without creating a preview backlog.
                newest_index = len(ready_candidates) - 1
                for index, (modified, path, signature) in enumerate(ready_candidates):
                    if session.last_frame_at and modified - session.last_frame_at > session_gap:
                        session = CaptureSession()

                    headers: dict[str, Any] = {}
                    if index == newest_index:
                        # Only the newest frame needs a full FITS-header read for the
                        # live viewscreen and current exposure/temperature metadata.
                        headers = read_fits_header(path)
                        latest_preview_path = path

                    session.add(path, modified, headers)
                    seen[str(path.resolve())] = signature

                if latest_preview_path is not None:
                    print(
                        f"FRAMES DETECTED | +{len(ready_candidates)} | "
                        f"total={len(session.files)} | latest={latest_preview_path.name}"
                    )

            if preview_enabled and latest_preview_path is not None:
                try:
                    render_fits_preview(latest_preview_path, preview_temp, preview_max_width)
                    base_url = client.upload_preview(preview_bucket, f"{station}/latest.jpg", preview_temp)
                    preview_updated_at = utc_iso()
                    preview_url = f"{base_url}?v={int(time.time() * 1000)}"
                    preview_error = None
                    print(f"PREVIEW | {latest_preview_path.name} -> {preview_url}")
                except Exception as preview_exc:
                    preview_error = str(preview_exc)
                    print(f"PREVIEW ERROR | {preview_error}", file=sys.stderr)

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

            protocol_snapshot = protocol.snapshot() if protocol else {"enabled": False}
            latest_protocol = protocol_snapshot.get("latest_events", {}) if isinstance(protocol_snapshot, dict) else {}
            sequence_event = latest_protocol.get("Sequence", {}) if isinstance(latest_protocol, dict) else {}
            exposure_event = latest_protocol.get("Exposure", {}) if isinstance(latest_protocol, dict) else {}
            frame_summary = sequence_event.get("frame_summary", {}) if isinstance(sequence_event, dict) else {}
            sequence_total = int(frame_summary.get("total") or sequence_event.get("total_frame") or 0)
            sequence_complete = int(
                frame_summary.get("complete_num")
                if frame_summary.get("complete_num") is not None
                else sequence_event.get("total_lapse_frame") or sequence_event.get("frame") or 0
            )
            sequence_remaining = max(0, sequence_total - sequence_complete) if sequence_total else None
            sequence_progress = round((sequence_complete / sequence_total) * 100, 1) if sequence_total else None

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
                "sequence": {
                    "state": sequence_event.get("state") if isinstance(sequence_event, dict) else None,
                    "total_frames": sequence_total or None,
                    "completed_frames": sequence_complete,
                    "remaining_frames": sequence_remaining,
                    "progress_percent": sequence_progress,
                    "target": (sequence_event.get("target") or {}).get("current_name") if isinstance(sequence_event, dict) and isinstance(sequence_event.get("target"), dict) else None,
                    "exposure_state": exposure_event.get("state") if isinstance(exposure_event, dict) else None,
                    "exposure_seconds": (float(exposure_event.get("exp_us")) / 1_000_000.0) if isinstance(exposure_event, dict) and exposure_event.get("exp_us") is not None else None,
                    "gain": exposure_event.get("gain") if isinstance(exposure_event, dict) else None,
                },
                "protocol": protocol_snapshot,
                "live_image": live_hub.snapshot() if live_client else {"enabled": False},
            }
            client.upsert({
                "station": station,
                "updated_at": utc_iso(),
                "online": True,
                "payload": payload,
                "last_error": None,
            })
        except KeyboardInterrupt:
            print("ASIAIR feed bridge stopped.")
            return 0
        except Exception as exc:
            print(f"ASIAIR ERROR | {exc}", file=sys.stderr)
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
