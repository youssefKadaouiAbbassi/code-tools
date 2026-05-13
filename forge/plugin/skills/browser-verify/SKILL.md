---
name: browser-verify
description: Drive UI parcels through bundled-Chromium headless Playwright via webapp-testing's with_server.py + ProofShot bundle.
when_to_use: Phase 5d verify gate for parcels where derive-kind emits `ui`.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Task, WebFetch
model: opus
---

# browser-verify runbook

Bundled Chromium, headless, fresh launch. NOT host browser.

Delegate driving to `browser-driver` subagent.

## 1. Detect dev server

```bash
PARCEL_ID="$1"
mkdir -p .forge/browser/$PARCEL_ID

DEV_CMD=$(jq -r '.scripts.dev // .scripts.start // empty' package.json 2>/dev/null)
[ -z "$DEV_CMD" ] && { echo '{"gate":"browser-verify","result":"skip","reason":"no-dev-script"}' > ".forge/browser/${PARCEL_ID}.json"; exit 0; }

PORT=$(echo "$DEV_CMD" | grep -oE 'port[ =:]*[0-9]+' | grep -oE '[0-9]+' | head -1)
PORT=${PORT:-3000}
URL="http://localhost:$PORT"
```

## 2. Boot dev server via webapp-testing's with_server.py wrapper

```bash
# Use anthropics/skills:webapp-testing's with_server.py — handles boot timeout, ready probe, teardown.
python3 -m webapp_testing.with_server --cmd "$DEV_CMD" --port "$PORT" --ready-path / --timeout 30 &
WT_PID=$!
echo "$WT_PID" > .forge/browser/$PARCEL_ID/with_server.pid
```

## 3. Drive via Playwright headless

```bash
cat > .forge/browser/$PARCEL_ID/drive.spec.ts <<EOF
import { test, expect } from "@playwright/test";
test.use({ baseURL: "$URL", trace: "on", screenshot: "only-on-failure", video: "retain-on-failure" });

test("smoke", async ({ page }) => {
  const consoleErrors: string[] = [];
  const networkFails: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && networkFails.push(\`\${r.status()} \${r.url()}\`));
  await page.goto("/");
  await page.screenshot({ path: ".forge/browser/$PARCEL_ID/home.png", fullPage: true });
  // Subagent inserts parcel-specific user-flow steps here.
  expect(consoleErrors).toEqual([]);
  expect(networkFails).toEqual([]);
});
EOF

bunx playwright test .forge/browser/$PARCEL_ID/drive.spec.ts \
  --reporter json \
  --output .forge/browser/$PARCEL_ID/test-results \
  > .forge/browser/$PARCEL_ID/playwright-result.json 2>&1
PLAYWRIGHT_EXIT=$?
```

## 4. Bundle via proofshot

```bash
proofshot bundle .forge/browser/$PARCEL_ID --output .forge/browser/$PARCEL_ID.proofshot
```

## 5. Tear down

```bash
kill -TERM $(cat .forge/browser/$PARCEL_ID/with_server.pid) 2>/dev/null || true
rm -rf .forge/browser/$PARCEL_ID/.cache 2>/dev/null || true
```

## 6. Gate

```bash
CONSOLE_ERRS=0
NETWORK_FAILS=0
[ -f .forge/browser/$PARCEL_ID/playwright-result.json ] && {
  CONSOLE_ERRS=$(jq -r '[.suites[].specs[].tests[].results[].errors[]?] | length' .forge/browser/$PARCEL_ID/playwright-result.json 2>/dev/null || echo 0)
}

RESULT=$([ "$PLAYWRIGHT_EXIT" -eq 0 ] && echo PASS || echo BLOCK)
cat > .forge/browser/$PARCEL_ID.json <<EOF
{
  "gate": "browser-verify",
  "parcel": "$PARCEL_ID",
  "url": "$URL",
  "console_errors": $CONSOLE_ERRS,
  "network_4xx_5xx": $NETWORK_FAILS,
  "playwright_exit": $PLAYWRIGHT_EXIT,
  "bundle": ".forge/browser/$PARCEL_ID.proofshot",
  "result": "$RESULT"
}
EOF
echo "browser-verify: $URL · $CONSOLE_ERRS console errors · $NETWORK_FAILS 4xx/5xx · gate $RESULT"
```

Ship-blocking conditions: any console error, any same-origin 4xx/5xx, any flow timeout, Playwright crash.
