import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { DetectedEnvironment } from "../../src/types.js";
import type { ComponentSpec, InstallPlan, ProbeState } from "../../src/components/framework.js";
import { runComponent, runStep } from "../../src/components/framework.js";

function env(over: Partial<DetectedEnvironment> = {}): DetectedEnvironment {
  return {
    os: "linux", arch: "x64", shell: "bash", shellRcPath: "/tmp/.bashrc",
    packageManager: "apt", homeDir: "/tmp/home", claudeDir: "/tmp/home/.claude",
    existingTools: new Map(), dockerAvailable: false, ...over,
  };
}

function spec(over: Partial<ComponentSpec> = {}): ComponentSpec {
  return {
    id: 1,
    name: "test",
    displayName: "Test",
    description: "test component",
    tier: "recommended",
    category: "test",
    probe: async () => ({ present: false }),
    plan: () => ({ kind: "install", steps: [] }),
    install: async () => ({ component: "Test", status: "installed", message: "ok", verifyPassed: true }),
    verify: async () => true,
    ...over,
  };
}

let logs: string[] = [];
const origLog = console.log;
beforeEach(() => { logs = []; console.log = (...args: unknown[]) => logs.push(args.map(String).join(" ")); });
afterEach(() => { console.log = origLog; });

describe("runComponent lifecycle", () => {
  test("returns skipped with reason when plan.kind === 'skip'", async () => {
    const s = spec({
      probe: async () => ({ present: true, version: "1.0" }),
      plan: () => ({ kind: "skip", reason: "already there" }),
    });
    const result = await runComponent(s, env(), false);
    expect(result.status).toBe("skipped");
    expect(result.message).toContain("already there");
    expect(result.component).toBe("Test");
  });

  test("calls probe → plan → install → verify in order", async () => {
    const order: string[] = [];
    const s = spec({
      probe: async () => { order.push("probe"); return { present: false }; },
      plan: () => { order.push("plan"); return { kind: "install", steps: [] }; },
      install: async () => {
        order.push("install");
        return { component: "Test", status: "installed", message: "ok", verifyPassed: true };
      },
      verify: async () => { order.push("verify"); return true; },
    });
    await runComponent(s, env(), false);
    expect(order).toEqual(["probe", "plan", "install", "verify"]);
  });

  test("dry-run does NOT call verify (verify only runs after real install)", async () => {
    let verifyCalled = false;
    const s = spec({
      verify: async () => { verifyCalled = true; return true; },
      install: async (_env, _plan, dryRun) => ({
        component: "Test",
        status: dryRun ? "skipped" : "installed",
        message: dryRun ? "[dry-run]" : "ok",
        verifyPassed: false,
      }),
    });
    await runComponent(s, env(), true);
    expect(verifyCalled).toBe(false);
  });

  test("verify === false flips verifyPassed even when install succeeded", async () => {
    const s = spec({
      probe: async () => ({ present: false }),
      plan: () => ({ kind: "install", steps: [] }),
      install: async () => ({ component: "Test", status: "installed", message: "ok", verifyPassed: true }),
      verify: async () => false,
    });
    const result = await runComponent(s, env(), false);
    expect(result.verifyPassed).toBe(false);
    expect(result.status).toBe("installed");
  });

  test("warningNote surfaces on InstallResult.message", async () => {
    const s = spec({
      warningNote: "known CVE — pin >= 1.2",
      install: async () => ({ component: "Test", status: "installed", message: "ok", verifyPassed: true }),
    });
    const result = await runComponent(s, env(), false);
    expect(result.message).toContain("known CVE");
  });

  test("probe errors bubble up (no silent swallow)", async () => {
    const s = spec({
      probe: async () => { throw new Error("probe boom"); },
    });
    expect(runComponent(s, env(), false)).rejects.toThrow("probe boom");
  });

  test("passes ProbeState into plan()", async () => {
    let receivedState: ProbeState | null = null;
    const s = spec({
      probe: async () => ({ present: true, version: "3.14", meta: { foo: "bar" } }),
      plan: (_env, state) => {
        receivedState = state;
        return { kind: "skip", reason: "present" };
      },
    });
    await runComponent(s, env(), false);
    expect(receivedState).toEqual({ present: true, version: "3.14", meta: { foo: "bar" } });
  });

  test("passes resolved plan into install()", async () => {
    let receivedPlan: InstallPlan | null = null;
    const s = spec({
      probe: async () => ({ present: false }),
      plan: () => ({ kind: "install", steps: [{ kind: "curl", script: "echo hi" }] }),
      install: async (_env, plan) => {
        receivedPlan = plan;
        return { component: "Test", status: "installed", message: "ok", verifyPassed: true };
      },
    });
    await runComponent(s, env(), false);
    expect(receivedPlan).not.toBeNull();
    expect(receivedPlan!.kind).toBe("install");
  });

  test("dry-run passes dryRun=true into install()", async () => {
    let received: boolean | null = null;
    const s = spec({
      install: async (_env, _plan, dryRun) => {
        received = dryRun;
        return { component: "Test", status: "skipped", message: "[dry-run]", verifyPassed: false };
      },
    });
    await runComponent(s, env(), true);
    expect(received).toBe(true);
  });
});

describe("runStep dry-run", () => {
  test("binary step: delegates to installBinary (result carries the package displayName)", async () => {
    const r = await runStep({ kind: "binary", pkg: { name: "__nope_abs_missing__", displayName: "nope", apt: "sudo apt-get install -y nope" } }, env(), true);
    expect(r.component).toBe("nope");
  });

  test("curl step: dry-run logs Would run: <script>", async () => {
    const r = await runStep({ kind: "curl", script: "echo hi", label: "hello" }, env(), true);
    expect(r.status).toBe("skipped");
    expect(r.component).toBe("hello");
    expect(r.message).toContain("[dry-run]");
    expect(logs.some((l) => l.includes("echo hi"))).toBe(true);
  });

  test("mcp step: dry-run logs Would register <name>", async () => {
    const r = await runStep({
      kind: "mcp",
      name: "myserver",
      spec: { transport: "stdio", command: "foo" },
    }, env(), true);
    expect(r.status).toBe("skipped");
    expect(r.component).toBe("myserver");
    expect(logs.some((l) => l.includes("myserver"))).toBe(true);
  });

  test("plugin step: dry-run logs Would install <name>@<marketplace>", async () => {
    const r = await runStep({ kind: "plugin", name: "feature-dev", marketplace: "claude-plugins-official" }, env(), true);
    expect(r.status).toBe("skipped");
    expect(r.message).toContain("feature-dev@claude-plugins-official");
  });

  test("shell-rc step: dry-run logs append", async () => {
    const r = await runStep({ kind: "shell-rc", section: "starship", lines: ['eval "$(starship init bash)"'] }, env(), true);
    expect(r.status).toBe("skipped");
    expect(r.component).toBe("starship");
    expect(logs.some((l) => l.includes("starship"))).toBe(true);
  });
});

describe("multi-step install aggregation via install() callback", () => {
  test("spec.install can aggregate runSteps results into one InstallResult", async () => {
    const { runSteps } = await import("../../src/components/framework.js");
    const s = spec({
      probe: async () => ({ present: false }),
      plan: () => ({
        kind: "install",
        steps: [
          { kind: "curl", script: "echo one", label: "step-1" },
          { kind: "curl", script: "echo two", label: "step-2" },
        ],
      }),
      install: async (e, plan, dryRun) => {
        const partials = await runSteps(plan, e, dryRun);
        return {
          component: "Multi",
          status: partials.every((p) => p.status === "skipped" || p.status === "installed") ? "skipped" : "failed",
          message: partials.map((p) => p.message).join(" | "),
          verifyPassed: false,
        };
      },
    });
    const result = await runComponent(s, env(), true);
    expect(result.component).toBe("Multi");
    expect(result.message).toContain("[dry-run]");
    expect(result.message.split("|").length).toBe(2);
  });
});
