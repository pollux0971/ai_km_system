/**
 * Loads and fully dereferences every `contracts/openapi/*.yaml` spec.
 *
 * Deliberately independent of `apps/api/src/contracts.ts`'s `loadContracts`:
 * that loader's `ContractRegistry` only exposes named `components.schemas`
 * by name and per-(path,method,status) response schemas — it has no way to
 * enumerate every operation's `parameters`/`requestBody` given only "the
 * paths object", which is exactly what path-matching against every live
 * Fastify route needs. This module keeps the fully-dereferenced raw
 * document instead, so `report.ts` can read `operation.requestBody`,
 * `operation.parameters` and `operation.responses` directly — already
 * `$ref`-free, since `$RefParser.dereference` (the same library
 * `apps/api/src/contracts.ts` uses) mutates `$ref` nodes in place.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import $RefParser from "@apidevtools/json-schema-ref-parser";

export type JsonValue = Record<string, unknown>;

export interface LoadedSpec {
  /** File basename without extension, e.g. "conversations" (matches `apps/api`'s spec-name convention). */
  readonly specName: string;
  /** File basename with extension, e.g. "conversations.yaml" — used in report output. */
  readonly yamlFile: string;
  /** Fully dereferenced OpenAPI document. No `$ref` nodes remain anywhere in it. */
  readonly document: JsonValue;
}

/** Every `.yaml`/`.yml` file directly under `dir` (not `__checks__/`, which holds no specs), dereferenced. */
export async function loadAllContracts(dir: string): Promise<LoadedSpec[]> {
  const entries = await readdir(dir);
  const specs: LoadedSpec[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".yaml") && !entry.endsWith(".yml")) continue;
    const absolute = path.join(dir, entry);
    const raw = yaml.load(await readFile(absolute, "utf8"));
    // Dereferenced relative to the file so cross-file $ref (e.g. into
    // core.yaml or auth.yaml) resolves, exactly like apps/api/src/contracts.ts.
    const document = (await $RefParser.dereference(absolute, raw as object, {})) as JsonValue;
    specs.push({
      specName: entry.replace(/\.ya?ml$/, ""),
      yamlFile: entry,
      document,
    });
  }
  return specs;
}

export function resolveContractsDir(repoRoot: string): string {
  return path.join(repoRoot, "contracts", "openapi");
}
