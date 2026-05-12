/**
 * Shared type definitions for forge CLI.
 * Boundary-validated shapes; internal code trusts these.
 */

/** Shape of Claude Code's user settings.json that forge reads/writes. */
export interface ClaudeSettings {
  enabledPlugins?: Record<string, boolean>;
  statusLine?: { type: "command"; command: string };
  permissions?: { allow?: string[]; defaultMode?: string };
  extraKnownMarketplaces?: Record<string, { source: { source: "github"; repo: string } }>;
}

/** A registered marketplace's name + GitHub repo. */
export interface MarketplaceEntry {
  name: string;
  repo: string;
}

/**
 * Template-literal type that enforces every plugin spec is
 * `<plugin-name>@<marketplace-name>`. Marketplace name is intentionally
 * `string` here; state.ts narrows it further via `satisfies` against the
 * actual MARKETPLACES table so invalid marketplaces fail at compile-time.
 */
export type PluginSpec<MP extends string = string> = `${string}@${MP}`;

/**
 * Discriminated union — `lines` is REQUIRED when status is warn/fail,
 * FORBIDDEN when status is ok. Compiler enforces the invariant.
 */
export type HealthResult =
  | { name: string; status: "ok"; detail: string }
  | { name: string; status: "warn" | "fail"; detail: string; lines: string[] };

/** Identity factory — keeps construction call-sites uniform; behavior added by future tests. */
export function makeHealthResult(r: HealthResult): HealthResult {
  return r;
}
