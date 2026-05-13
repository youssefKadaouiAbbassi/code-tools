#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path


def main() -> None:
    try:
        json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        pass

    forge_dir = Path(".forge")
    if not (forge_dir / "dag.json").exists():
        return

    urls_file = forge_dir / "apprise.urls"
    if not urls_file.exists():
        return

    urls = [u.strip() for u in urls_file.read_text().splitlines() if u.strip() and not u.startswith("#")]
    if not urls:
        return

    receipts = list((forge_dir / "receipts").glob("*.json")) if (forge_dir / "receipts").exists() else []
    title = "/forge run complete"
    body = f"Receipts written: {len(receipts)}. See forge-meta branch for full chain."

    subprocess.run(
        ["apprise", "-t", title, "-b", body, *urls],
        capture_output=True, timeout=10, check=False,
    )


if __name__ == "__main__":
    main()
