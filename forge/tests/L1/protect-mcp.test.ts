import { test as _t, expect } from "bun:test";
import { existsSync as _exists } from "node:fs";
const test = (_exists("/workspace/forge") && _exists("/root/.bun/bin")) ? _t : _t.skip;
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("L1.9 — protect-mcp emits Ed25519-signed receipt with crypto-shaped signature", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-protect-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t", version: "0" }));
    const inst = spawnSync("npm", ["i", "protect-mcp@0.5.5", "@veritasacta/artifacts"], { cwd: dir, encoding: "utf8", timeout: 180_000 });
    expect(inst.status).toBe(0);

    spawnSync("npx", ["protect-mcp", "init", "--dir", dir], { cwd: dir, encoding: "utf8", timeout: 60_000 });
    expect(readdirSync(dir)).toContain("keys");

    const tc = JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "read_file", arguments: { path: "/etc/hostname" } },
    });
    const r = spawnSync("npx", ["protect-mcp", "demo"], { cwd: dir, input: tc, encoding: "utf8", timeout: 60_000 });
    const out = (r.stdout || "") + (r.stderr || "");
    const line = out.split("\n").find((l) => l.includes("[PROTECT_MCP_RECEIPT]"));
    expect(line).toBeTruthy();

    const json = line!.replace(/^.*\[PROTECT_MCP_RECEIPT\]\s*/, "");
    const receipt = JSON.parse(json);
    expect(receipt.algorithm).toBe("ed25519");
    expect(receipt.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(receipt.payload.tool).toBe("read_file");
    expect(["allow", "deny"]).toContain(receipt.payload.decision);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 300_000);

test("L1.22 — protect-mcp tamper test: byte-mod fails verification", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-tamper-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t", version: "0" }));
    spawnSync("npm", ["i", "protect-mcp@0.5.5", "@veritasacta/artifacts", "@veritasacta/verify"], { cwd: dir, encoding: "utf8", timeout: 180_000 });
    spawnSync("npx", ["protect-mcp", "init", "--dir", dir], { cwd: dir, encoding: "utf8", timeout: 60_000 });

    const tc = JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "read_file", arguments: { path: "/etc/hostname" } },
    });
    const r = spawnSync("npx", ["protect-mcp", "demo"], { cwd: dir, input: tc, encoding: "utf8", timeout: 60_000 });
    const line = ((r.stdout || "") + (r.stderr || "")).split("\n").find((l) => l.includes("[PROTECT_MCP_RECEIPT]"));
    const json = line!.replace(/^.*\[PROTECT_MCP_RECEIPT\]\s*/, "");
    const valid = JSON.parse(json);

    const tampered = { ...valid, payload: { ...valid.payload, decision: "deny" } };
    writeFileSync(join(dir, "tampered.json"), JSON.stringify(tampered));

    const v = spawnSync("npx", ["-y", "@veritasacta/verify", join(dir, "tampered.json")], { cwd: dir, encoding: "utf8", timeout: 60_000 });
    expect(v.status).not.toBe(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 300_000);
