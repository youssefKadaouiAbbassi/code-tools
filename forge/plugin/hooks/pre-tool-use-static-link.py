#!/usr/bin/env python3
import json
import re
import sys


def main() -> None:
    try:
        evt = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        print(json.dumps({}))
        return

    tool_input = evt.get("tool_input", {}) or {}
    file_path = tool_input.get("file_path") or ""
    new_content = tool_input.get("content") or tool_input.get("new_string") or ""

    if not file_path.endswith("Cargo.toml"):
        print(json.dumps({}))
        return

    if re.search(r'crate-type\s*=\s*\[\s*"(cdylib|staticlib|dylib|proc-macro)"', new_content):
        print(json.dumps({
            "warn": (
                "Cargo.toml crate-type change detected. "
                "Static linking and dyn dispatch behave differently across crate-type values. "
                "Verify mutation-gate runs end-to-end after this change."
            )
        }))
        return

    print(json.dumps({}))


if __name__ == "__main__":
    main()
