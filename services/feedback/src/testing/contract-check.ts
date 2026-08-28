/**
 * Self-contained contract-response checker for THIS package's own tests —
 * a deliberate, small duplication of `services/conversation/src/testing/
 * contract-check.ts` (see that file's own header for why it isn't shared:
 * `apps/api` mounts every service package, so a service depending on
 * `apps/api`'s own harness would invert the dependency direction, and this
 * story's boundary only allows changes under `services/feedback/**`).
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import ajvModule from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

const Ajv2020 = ajvModule.default;
const addFormats = addFormatsModule.default;
type AjvInstance = InstanceType<typeof Ajv2020>;

export interface ContractCheckRegistry {
  readonly document: Record<string, unknown>;
  readonly ajv: AjvInstance;
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

let cached: ContractCheckRegistry | undefined;

/** Loads (once) the repo's real, frozen `contracts/openapi/analytics.yaml`. */
export async function loadAnalyticsContract(): Promise<ContractCheckRegistry> {
  if (cached) return cached;
  const dir = resolveContractsDir();
  const file = path.join(dir, "analytics.yaml");
  const raw = yaml.load(await readFile(file, "utf8"));
  const document = (await $RefParser.dereference(file, raw as object, {})) as Record<string, unknown>;
  const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  registerUnknownFormats(ajv, document);
  cached = { document, ajv };
  return cached;
}

/** Throws with a readable diff unless `body` matches the contract's schema for this operation/status. */
export function expectResponseMatchesContract(
  registry: ContractCheckRegistry,
  routePath: string,
  method: string,
  status: number,
  body: unknown,
): void {
  const paths = registry.document.paths as Record<string, Record<string, unknown>> | undefined;
  const item = paths?.[routePath];
  if (!item) throw new Error(`契約沒有路徑 ${routePath}。`);
  const operation = item[method.toLowerCase()] as Record<string, unknown> | undefined;
  if (!operation) throw new Error(`契約 ${routePath} 沒有 ${method.toUpperCase()} 操作。`);
  const responses = operation.responses as Record<string, Record<string, unknown>> | undefined;
  const response = responses?.[String(status)];
  if (!response) {
    throw new Error(`契約 ${method.toUpperCase()} ${routePath} 沒有定義 ${status} 回應。`);
  }
  const content = response.content as Record<string, { schema?: Record<string, unknown> }> | undefined;
  const schema = content?.["application/json"]?.schema;
  if (!schema) {
    throw new Error(`契約 ${method.toUpperCase()} ${routePath} → ${status} 沒有 application/json schema。`);
  }
  const validate = registry.ajv.compile(schema);
  const valid = validate(body) as boolean;
  if (!valid) {
    const details = (validate.errors ?? [])
      .map((error) => `  - ${error.instancePath || "(root)"} ${error.message ?? "invalid"}`)
      .join("\n");
    throw new Error(`回應不符合契約 ${method.toUpperCase()} ${routePath} → ${status}:\n${details}`);
  }
}
