/**
 * Test-only helper: validates a response body against the REAL
 * `contracts/openapi/auth.yaml` (E02-S031) — the frozen contract, not a
 * hand-copied schema — so a drift between this plugin's responses and the
 * contract fails a test here (AC: "回應通過 auth.yaml contract 驗證").
 *
 * Deliberately not a dependency on apps/api/src/contracts.ts: that would
 * make services/identity depend on the app that depends on it. This is a
 * small, self-contained rebuild of just the "dereference + ajv-compile a
 * named response schema" slice that file provides.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

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

interface AuthYamlDocument {
  paths: Record<string, Record<string, { responses?: Record<string, { content?: Record<string, { schema?: object }> }> }>>;
}

let cachedDocument: AuthYamlDocument | undefined;

async function loadAuthContract(): Promise<AuthYamlDocument> {
  if (cachedDocument) return cachedDocument;
  const absolute = path.join(resolveContractsDir(), "auth.yaml");
  const raw = yaml.load(readFileSync(absolute, "utf8"));
  cachedDocument = (await $RefParser.dereference(absolute, raw as object, {})) as unknown as AuthYamlDocument;
  return cachedDocument;
}

export async function validateAgainstAuthContract(
  routePath: string,
  method: string,
  status: number,
  body: unknown,
): Promise<{ valid: boolean; errors: string[] }> {
  const document = await loadAuthContract();
  const schema = document.paths[routePath]?.[method.toLowerCase()]?.responses?.[String(status)]?.content?.[
    "application/json"
  ]?.schema;
  if (!schema) {
    return { valid: false, errors: [`auth.yaml 未定義 ${method.toUpperCase()} ${routePath} 的 ${status} 回應。`] };
  }
  const ajv = new Ajv2020.default({ strict: true, allErrors: true, allowUnionTypes: true });
  addFormats.default(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(body) as boolean;
  return { valid, errors: (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ""}`) };
}
