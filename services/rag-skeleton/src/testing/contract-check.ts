/**
 * Runtime contract-response checker for the two provider seams.
 *
 * WHY THIS EXISTS ON TOP OF `__checks__/*-compat.ts`
 *
 * `contracts/openapi/__checks__/embedding-compat.ts` and `generation-compat.ts`
 * bind the contract to the provider types at COMPILE time, and the two fake
 * servers in `../../testing/` are typed against the same generated types, so
 * neither can drift silently. That is PF0 evidence and it stops at shapes.
 *
 * It cannot see `additionalProperties: false`, `minItems`, `maxItems`,
 * `maxLength` or `minimum` — the constraints that only exist in the schema.
 * A fake server can be perfectly type-correct and still emit a payload the
 * contract forbids, and then the real provider gets written against the fake's
 * behaviour rather than the contract's. This module closes that by validating
 * what actually comes off the socket against the real, frozen yaml.
 *
 * Deliberate duplication of `services/model-gateway/src/testing/
 * contract-check.ts`'s loading/validation logic, for the same reason recorded
 * there: a service package cannot depend on `apps/api`, and the 2026-09-02
 * assignment's boundary is `services/rag-skeleton/**` plus the two new
 * contracts.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import ajvModule from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import type { ProviderFidelity, FidelityRatedComponent } from "@ai-km/service-retrieval";

const Ajv2020 = ajvModule.default;
const addFormats = addFormatsModule.default;
type AjvInstance = InstanceType<typeof Ajv2020>;

/** The contracts this module knows how to load. */
export type ContractName = "embedding" | "generation";

export interface ContractCheckRegistry {
  readonly name: ContractName;
  readonly document: Record<string, unknown>;
  readonly ajv: AjvInstance;
}

/**
 * A fake HTTP server's evidence ceiling is PF2, not PF1 and not PF3: real socket,
 * real serialisation, real error mapping — and a model that is still a stub.
 * Declared here so a test that wires one can `requireProviderFidelity` against it
 * rather than asserting the tier in a comment.
 */
export function fakeServerComponent(
  componentId: string,
  fidelityCeiling: ProviderFidelity = "PF2",
): FidelityRatedComponent {
  return { componentId, fidelityCeiling };
}

function resolveContractsDir(from: string = fileURLToPath(import.meta.url)): string {
  let dir = path.dirname(from);
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = path.join(dir, "contracts", "openapi");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`找不到 contracts/openapi 目錄(從 ${from} 逐層往上找)。`);
}

function registerUnknownFormats(ajv: AjvInstance, schema: unknown): void {
  const seen = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const format = record.format;
    if (typeof format === "string" && !seen.has(format)) {
      seen.add(format);
      if (!ajv.formats[format]) ajv.addFormat(format, true);
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(schema);
}

const cache = new Map<ContractName, ContractCheckRegistry>();

/** Loads (once per name) the repo's real, frozen `contracts/openapi/<name>.yaml`. */
export async function loadContract(name: ContractName): Promise<ContractCheckRegistry> {
  const hit = cache.get(name);
  if (hit) return hit;
  const file = path.join(resolveContractsDir(), `${name}.yaml`);
  const raw = yaml.load(await readFile(file, "utf8"));
  const document = (await $RefParser.dereference(file, raw as object, {})) as Record<
    string,
    unknown
  >;
  const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  registerUnknownFormats(ajv, document);
  const registry: ContractCheckRegistry = { name, document, ajv };
  cache.set(name, registry);
  return registry;
}

function schemaFor(
  registry: ContractCheckRegistry,
  routePath: string,
  method: string,
  status: number,
): Record<string, unknown> {
  const paths = registry.document.paths as Record<string, Record<string, unknown>> | undefined;
  const item = paths?.[routePath];
  if (!item) throw new Error(`契約 ${registry.name} 沒有路徑 ${routePath}。`);
  const operation = item[method.toLowerCase()] as Record<string, unknown> | undefined;
  if (!operation) {
    throw new Error(`契約 ${registry.name} 的 ${routePath} 沒有 ${method.toUpperCase()} 操作。`);
  }
  const responses = operation.responses as Record<string, Record<string, unknown>> | undefined;
  const response = responses?.[String(status)];
  if (!response) {
    throw new Error(
      `契約 ${registry.name} 的 ${method.toUpperCase()} ${routePath} 沒有定義 ${status} 回應。`,
    );
  }
  const content = response.content as
    | Record<string, { schema?: Record<string, unknown> }>
    | undefined;
  const schema = content?.["application/json"]?.schema;
  if (!schema) {
    throw new Error(
      `契約 ${registry.name} 的 ${method.toUpperCase()} ${routePath} → ${status} 沒有 application/json schema。`,
    );
  }
  return schema;
}

/** Throws with a readable diff unless `body` matches the contract's schema for this operation/status. */
export function expectResponseMatchesContract(
  registry: ContractCheckRegistry,
  routePath: string,
  method: string,
  status: number,
  body: unknown,
): void {
  const validate = registry.ajv.compile(schemaFor(registry, routePath, method, status));
  const valid = validate(body) as boolean;
  if (!valid) {
    const details = (validate.errors ?? [])
      .map((error) => `  - ${error.instancePath || "(root)"} ${error.message ?? "invalid"}`)
      .join("\n");
    throw new Error(
      `回應不符合契約 ${registry.name} ${method.toUpperCase()} ${routePath} → ${status}:\n${details}`,
    );
  }
}

/** Same, for a request body — so the fake is held to the contract on the way in too. */
export function expectRequestMatchesContract(
  registry: ContractCheckRegistry,
  routePath: string,
  method: string,
  body: unknown,
): void {
  const paths = registry.document.paths as Record<string, Record<string, unknown>> | undefined;
  const operation = paths?.[routePath]?.[method.toLowerCase()] as
    | Record<string, unknown>
    | undefined;
  const requestBody = operation?.requestBody as
    | { content?: Record<string, { schema?: Record<string, unknown> }> }
    | undefined;
  const schema = requestBody?.content?.["application/json"]?.schema;
  if (!schema) {
    throw new Error(
      `契約 ${registry.name} 的 ${method.toUpperCase()} ${routePath} 沒有 application/json requestBody schema。`,
    );
  }
  const validate = registry.ajv.compile(schema);
  if (!(validate(body) as boolean)) {
    const details = (validate.errors ?? [])
      .map((error) => `  - ${error.instancePath || "(root)"} ${error.message ?? "invalid"}`)
      .join("\n");
    throw new Error(
      `請求不符合契約 ${registry.name} ${method.toUpperCase()} ${routePath}:\n${details}`,
    );
  }
}
