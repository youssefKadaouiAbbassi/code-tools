#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path


def main() -> None:
    try:
        evt = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        print(json.dumps({}))
        return

    forge_dir = Path(".forge")
    if not (forge_dir / "dag.json").exists():
        print(json.dumps({}))
        return

    active = forge_dir / "active-parcel.txt"
    if not active.exists():
        print(json.dumps({}))
        return

    parcel_id = active.read_text().strip()
    file_path = (evt.get("tool_input") or {}).get("file_path", "")
    if not file_path or not Path(file_path).exists():
        print(json.dumps({}))
        return

    if file_path.endswith((".test.ts", ".spec.ts", "_test.py", "_spec.rs")):
        print(json.dumps({}))
        return

    out_dir = forge_dir / "mutation"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = out_dir / f"{parcel_id}-stryker.json"

    if file_path.endswith((".ts", ".tsx", ".js")):
        result = subprocess.run(
            ["bunx", "stryker", "run", "--reporters", "json"],
            capture_output=True, timeout=120, check=False,
        )
        if result.returncode != 0 or not report.exists():
            print(json.dumps({"warn": f"mutation-gate runner failed: {result.stderr.decode()[:200]}"}))
            return
        try:
            data = json.loads(report.read_text())
            mutants = []
            for f in (data.get("files") or {}).values():
                mutants.extend(f.get("mutants") or [])
            killed = sum(1 for m in mutants if m.get("status") == "Killed")
            survived = sum(1 for m in mutants if m.get("status") == "Survived")
            no_cov = sum(1 for m in mutants if m.get("status") == "NoCoverage")
            denom = killed + survived + no_cov
            score = killed / denom if denom else 1.0
        except Exception as e:
            print(json.dumps({"warn": f"mutation-gate parse failed: {e}"}))
            return
        if score < 0.80:
            print(json.dumps({
                "block": f"mutation-gate: score {score:.2f} < 0.80 on {file_path}. See {report} for survivors."
            }))
            return

    print(json.dumps({}))


if __name__ == "__main__":
    main()
