import { existsSync } from "node:fs";

export function isInsideContainer(): boolean {
  return existsSync("/.dockerenv") || existsSync("/proc/1/cgroup");
}

export function assertInContainer(lane: string): void {
  if (!isInsideContainer()) {
    throw new Error(`Lane '${lane}' must run inside a container. Use 'bun run test:${lane}'`);
  }
}
