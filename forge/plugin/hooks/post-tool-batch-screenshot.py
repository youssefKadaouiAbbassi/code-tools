#!/usr/bin/env python3
import json
import os
import subprocess
import sys
from pathlib import Path


def main() -> None:
    try:
        json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        pass

    forge_dir = Path(".forge")
    active = forge_dir / "active-parcel.txt"
    if not (forge_dir / "dag.json").exists() or not active.exists():
        print(json.dumps({}))
        return

    parcel_id = active.read_text().strip()
    kind_file = forge_dir / "kind" / f"{parcel_id}.txt"
    if not kind_file.exists() or kind_file.read_text().strip() != "ui":
        print(json.dumps({}))
        return

    pid_file = forge_dir / "browser" / parcel_id / "with_server.pid"
    if not pid_file.exists():
        print(json.dumps({}))
        return

    bundle_dir = forge_dir / "browser" / parcel_id
    bundle_dir.mkdir(parents=True, exist_ok=True)
    out = bundle_dir / f"step-{os.getpid()}.png"

    result = subprocess.run(
        ["proofshot", "screenshot", "--output", str(out)],
        capture_output=True, timeout=15, check=False,
    )
    if result.returncode != 0:
        print(json.dumps({"warn": f"proofshot failed: {result.stderr.decode()[:200]}"}))
        return

    print(json.dumps({}))


if __name__ == "__main__":
    main()
