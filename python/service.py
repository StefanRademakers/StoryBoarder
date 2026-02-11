from __future__ import annotations

import json
import logging
import sys

LOGGER = logging.getLogger("storybuilder.service")
logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s", stream=sys.stderr)


def write_response(response: dict) -> None:
    sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def make_error_response(command_id: str | None, code: str, message: str) -> dict:
    return {
        "id": command_id or "unknown",
        "ok": False,
        "error": {
            "code": code,
            "message": message,
        },
    }


def make_success_response(command_id: str, data: dict | None = None) -> dict:
    return {
        "id": command_id,
        "ok": True,
        "data": data or {},
    }


def handle_ping(_payload: dict) -> dict:
    return {"message": "pong"}


COMMANDS = {
    "ping": handle_ping,
}


def main() -> None:
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            command = json.loads(line)
        except json.JSONDecodeError as exc:
            write_response(make_error_response(None, "invalid_json", f"Could not parse JSON: {exc}"))
            continue

        command_id = command.get("id")
        cmd = command.get("cmd")
        payload = command.get("args") or {}

        if not command_id:
            write_response(make_error_response(None, "invalid_request", "Missing field: id"))
            continue
        if not cmd:
            write_response(make_error_response(command_id, "invalid_request", "Missing field: cmd"))
            continue

        handler = COMMANDS.get(cmd)
        if handler is None:
            write_response(make_error_response(command_id, "unknown_command", f"Unknown command: {cmd}"))
            continue

        try:
            result_payload = handler(payload)
        except Exception as exc:
            LOGGER.exception("Unexpected error")
            write_response(make_error_response(command_id, "internal_error", str(exc)))
        else:
            write_response(make_success_response(command_id, result_payload))


if __name__ == "__main__":
    main()