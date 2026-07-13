#!/usr/bin/env python3
"""CuzBro HBG3 dew command queue consumer.

Polls Supabase for dew commands, claims one atomically, sends the normalized
settings to either an existing local script (recommended) or HBG3 Telnet, and
marks the queue row complete.
"""
from __future__ import annotations

import json
import logging
import os
import shlex
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

LOG = logging.getLogger("cuzbro-dew-bridge")


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if value and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        os.environ.setdefault(key, value)


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Config:
    supabase_url: str
    service_role_key: str
    station: str
    poll_seconds: float
    adapter: str
    local_command: str
    command_timeout: float
    hbg3_host: str
    hbg3_port: int
    telnet_auto_template: str
    telnet_manual_template: str
    telnet_line_ending: str
    dry_run: bool

    @classmethod
    def from_env(cls) -> "Config":
        url = os.getenv("SUPABASE_URL", "").rstrip("/")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        return cls(
            supabase_url=url,
            service_role_key=key,
            station=os.getenv("HBG3_STATION", "eliot"),
            poll_seconds=max(1.0, float(os.getenv("DEW_POLL_SECONDS", "2"))),
            adapter=os.getenv("DEW_ADAPTER", "command").strip().lower(),
            local_command=os.getenv("HBG3_DEW_COMMAND", "").strip(),
            command_timeout=max(2.0, float(os.getenv("DEW_COMMAND_TIMEOUT", "15"))),
            hbg3_host=os.getenv("HBG3_HOST", "192.168.4.1"),
            hbg3_port=int(os.getenv("HBG3_TELNET_PORT", "3000")),
            telnet_auto_template=os.getenv("HBG3_TELNET_AUTO_TEMPLATE", ""),
            telnet_manual_template=os.getenv("HBG3_TELNET_MANUAL_TEMPLATE", ""),
            telnet_line_ending=os.getenv("HBG3_TELNET_LINE_ENDING", "\\r\\n")
                .replace("\\r", "\r").replace("\\n", "\n"),
            dry_run=env_bool("DEW_DRY_RUN", False),
        )


class SupabaseRest:
    def __init__(self, config: Config):
        self.config = config
        self.headers = {
            "apikey": config.service_role_key,
            "Authorization": f"Bearer {config.service_role_key}",
            "Content-Type": "application/json",
        }

    def request(self, method: str, path: str, payload: Any | None = None, prefer: str = "return=representation") -> Any:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        request = urllib.request.Request(
            f"{self.config.supabase_url}/rest/v1/{path}",
            data=body,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase HTTP {exc.code}: {detail}") from exc

    def claim_next(self) -> dict[str, Any] | None:
        rows = self.request("POST", "rpc/claim_hbg3_dew_command", {
            "p_station": self.config.station,
        })
        return rows[0] if isinstance(rows, list) and rows else None

    def complete(self, command_id: str, success: bool, result: dict[str, Any] | None = None, error: str | None = None) -> None:
        encoded = urllib.parse.quote(command_id, safe="")
        self.request(
            "PATCH",
            f"hbg3_dew_commands?id=eq.{encoded}",
            {
                "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "success": success,
                "result": result,
                "error": error,
            },
        )


def normalize(command: dict[str, Any]) -> dict[str, Any]:
    if command.get("action") != "set_channel":
        raise ValueError(f"Unsupported action: {command.get('action')!r}")
    args = command.get("arguments") or {}
    channel = int(args.get("channel", 0))
    mode = str(args.get("mode", "manual")).lower()
    aggression = int(args.get("aggression", 0))
    manual_pwm = int(args.get("manualPwm", 0))
    if channel not in (0, 1):
        raise ValueError("channel must be 0 or 1")
    if mode not in ("auto", "manual"):
        raise ValueError("mode must be auto or manual")
    if not 0 <= aggression <= 10:
        raise ValueError("aggression must be 0-10")
    if not 0 <= manual_pwm <= 100:
        raise ValueError("manualPwm must be 0-100")
    return {"channel": channel, "channel1": channel + 1, "mode": mode, "aggression": aggression, "manual_pwm": manual_pwm}


def template_values(values: dict[str, Any]) -> dict[str, Any]:
    return {**values, "manualPwm": values["manual_pwm"], "pwm": values["manual_pwm"]}


def execute_local(config: Config, values: dict[str, Any]) -> dict[str, Any]:
    if not config.local_command:
        raise RuntimeError("DEW_ADAPTER=command requires HBG3_DEW_COMMAND in .env")
    rendered = config.local_command.format(**template_values(values))
    if config.dry_run:
        LOG.warning("DRY RUN: %s", rendered)
        return {"adapter": "command", "dryRun": True, "command": rendered, **values}
    completed = subprocess.run(
        rendered if os.name == "nt" else shlex.split(rendered),
        shell=(os.name == "nt"),
        capture_output=True,
        text=True,
        timeout=config.command_timeout,
        check=False,
    )
    if completed.returncode != 0:
        stderr = completed.stderr.strip() or completed.stdout.strip() or f"exit code {completed.returncode}"
        raise RuntimeError(stderr[-1000:])
    return {
        "adapter": "command",
        "exitCode": completed.returncode,
        "output": completed.stdout.strip()[-1000:],
        **values,
    }


def execute_telnet(config: Config, values: dict[str, Any]) -> dict[str, Any]:
    template = config.telnet_auto_template if values["mode"] == "auto" else config.telnet_manual_template
    if not template:
        raise RuntimeError(
            f"DEW_ADAPTER=telnet requires HBG3_TELNET_{values['mode'].upper()}_TEMPLATE; "
            "the bridge will not guess firmware-specific HBG3 commands"
        )
    rendered = template.format(**template_values(values))
    if config.dry_run:
        LOG.warning("DRY RUN TELNET: %s", rendered)
        return {"adapter": "telnet", "dryRun": True, "command": rendered, **values}
    with socket.create_connection((config.hbg3_host, config.hbg3_port), timeout=config.command_timeout) as sock:
        sock.settimeout(2.0)
        sock.sendall((rendered + config.telnet_line_ending).encode("ascii"))
        chunks: list[bytes] = []
        try:
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                chunks.append(chunk)
                if len(b"".join(chunks)) > 8192:
                    break
        except socket.timeout:
            pass
    response = b"".join(chunks).decode("utf-8", errors="replace").strip()
    return {"adapter": "telnet", "command": rendered, "response": response[-2000:], **values}


def execute(config: Config, command: dict[str, Any]) -> dict[str, Any]:
    values = normalize(command)
    if config.adapter == "command":
        return execute_local(config, values)
    if config.adapter == "telnet":
        return execute_telnet(config, values)
    raise RuntimeError("DEW_ADAPTER must be command or telnet")


def main() -> int:
    base = Path(__file__).resolve().parent
    load_dotenv(base / ".env")
    logging.basicConfig(
        level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    try:
        config = Config.from_env()
    except Exception as exc:
        LOG.error("Configuration error: %s", exc)
        return 2
    client = SupabaseRest(config)
    LOG.info("Dew command bridge online: station=%s adapter=%s", config.station, config.adapter)
    while True:
        try:
            command = client.claim_next()
            if not command:
                time.sleep(config.poll_seconds)
                continue
            command_id = str(command["id"])
            LOG.info("Claimed dew command %s", command_id)
            try:
                result = execute(config, command)
                client.complete(command_id, True, result=result)
                LOG.info("Completed dew command %s", command_id)
            except Exception as exc:
                message = f"{type(exc).__name__}: {exc}"[:2000]
                LOG.exception("Dew command %s failed", command_id)
                client.complete(command_id, False, error=message)
        except KeyboardInterrupt:
            LOG.info("Bridge stopped")
            return 0
        except Exception:
            LOG.exception("Bridge polling error")
            time.sleep(max(config.poll_seconds, 5.0))


if __name__ == "__main__":
    sys.exit(main())
