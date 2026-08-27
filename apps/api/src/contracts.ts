/**
 * Contract loader (E04-S039, ADR 0003 §3).
 *
 * `contracts/openapi/*.yaml` is the single source of truth. Routes bind their
 * request schemas straight out of the loaded contract instead of keeping a
 * hand-written copy, so a route cannot drift from the contract without the
 * contract test going red. Nothing here ever writes a contract — the contract
 * is an input, never an output.
 */
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import ajvModule from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";

// `ajv` and `ajv-formats` ship CommonJS with ESM-shaped .d.ts files. Under
// `module: NodeNext` TypeScript therefore types the default import as the
// module namespace, not the class. Both packages set `module.exports` AND
// `exports.default` to the same value, so reaching through `.default` is
// correct at runtime and gives TypeScript the constructor it is looking for.
const Ajv2020 = ajvModule.default;
const addFormats = addFormatsModule.default;
type AjvInstance = InstanceType<typeof Ajv2020>;

export type JsonSchema = Record<string, unknown>;

export interface ResponseValidationResult {
  valid: boolean;
  /** Human-readable failures, each naming the field involved. */
  errors: string[];
}

export interface ContractRegistry {
  specNames(): string[];
  /** A named schema from `components.schemas`, fully dereferenced. */
  getSchema(specName: string, schemaName: string): JsonSchema;
  /** The `application/json` response schema for one operation, or undefined. */
  getResponseSchema(
    specName: string,
    routePath: string,
    method: string,
    status: number,
  ): JsonSchema | undefined;
  validateResponse(
    specName: string,
    routePath: string,
    method: string,
    status: number,
    body: unknown,
  ): ResponseValidationResult;
}

/**
 * Walks up from this module looking for `contracts/openapi`. Works from
 * `src/` under tsx and from `dist/` under node, without either needing to know
 * how deep it is, and without a new env var.
 */
export function resolveContractsDir(from: string = fileURLToPath(import.meta.url)): string {
  let dir = path.dirname(from);
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = path.join(dir, "contracts", "openapi");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `找不到 contracts/openapi 目錄(從 ${from} 逐層往上找)。apps/api 必須在 monorepo 內執行。`,
  );
}

/**
 * Ajv rejects an unknown `format` under strict mode. Registering the formats a
 * contract actually uses keeps everything else strict — the alternative,
 * turning strict off wholesale, would also silence real schema mistakes such
 * as a misspelled keyword.
 */
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

interface LoadedSpec {
  document: Record<string, unknown>;
  validators: Map<string, ValidateFunction>;
  ajv: AjvInstance;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => {
    const where = error.instancePath === "" ? "(root)" : error.instancePath;
    const params = error.params as Record<string, unknown>;
    const named =
      typeof params.missingProperty === "string"
        ? ` [${params.missingProperty}]`
        : typeof params.additionalProperty === "string"
          ? ` [${params.additionalProperty}]`
          : "";
    return `${where}${named} ${error.message ?? "invalid"}`.trim();
  });
}

export async function loadContracts(dir: string): Promise<ContractRegistry> {
  const entries = await readdir(dir);
  const specs = new Map<string, LoadedSpec>();

  for (const entry of entries) {
    if (!entry.endsWith(".yaml") && !entry.endsWith(".yml")) continue;
    const absolute = path.join(dir, entry);
    const raw = yaml.load(await readFile(absolute, "utf8"));
    // Dereference relative to the file so cross-file $ref (e.g. into
    // core.yaml) resolves. After this there are no $ref left to follow at
    // request time.
    const document = (await $RefParser.dereference(absolute, raw as object, {})) as Record<
      string,
      unknown
    >;
    const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true });
    addFormats(ajv);
    registerUnknownFormats(ajv, document);
    specs.set(path.basename(entry).replace(/\.ya?ml$/, ""), {
      document,
      validators: new Map(),
      ajv,
    });
  }

  function requireSpec(specName: string): LoadedSpec {
    const spec = specs.get(specName);
    if (!spec) {
      throw new Error(
        `契約 "${specName}" 不存在。已載入:${[...specs.keys()].join(", ") || "(無)"}。`,
      );
    }
    return spec;
  }

  function getResponseSchema(
    specName: string,
    routePath: string,
    method: string,
    status: number,
  ): JsonSchema | undefined {
    const spec = requireSpec(specName);
    const paths = spec.document.paths as Record<string, Record<string, unknown>> | undefined;
    const item = paths?.[routePath];
    if (!item) return undefined;
    const operation = item[method.toLowerCase()] as Record<string, unknown> | undefined;
    if (!operation) return undefined;
    const responses = operation.responses as Record<string, Record<string, unknown>> | undefined;
    const response = responses?.[String(status)];
    if (!response) return undefined;
    const content = response.content as Record<string, { schema?: JsonSchema }> | undefined;
    return content?.["application/json"]?.schema;
  }

  return {
    specNames: () => [...specs.keys()],

    getSchema(specName, schemaName) {
      const spec = requireSpec(specName);
      const components = spec.document.components as
        | { schemas?: Record<string, JsonSchema> }
        | undefined;
      const schema = components?.schemas?.[schemaName];
      if (!schema) {
        throw new Error(
          `契約 "${specName}" 沒有名為 "${schemaName}" 的 schema。可用:${Object.keys(
            components?.schemas ?? {},
          ).join(", ")}。`,
        );
      }
      return schema;
    },

    getResponseSchema,

    validateResponse(specName, routePath, method, status, body) {
      const spec = requireSpec(specName);
      const schema = getResponseSchema(specName, routePath, method, status);
      if (!schema) {
        return {
          valid: false,
          errors: [
            `契約 "${specName}" 未定義 ${method.toUpperCase()} ${routePath} 的 ${status} application/json 回應。`,
          ],
        };
      }
      const key = `${routePath}|${method.toLowerCase()}|${status}`;
      const cached = spec.validators.get(key);
      const validate: ValidateFunction = cached ?? spec.ajv.compile(schema);
      if (!cached) spec.validators.set(key, validate);
      const valid = validate(body) as boolean;
      return { valid, errors: valid ? [] : formatAjvErrors(validate.errors) };
    },
  };
}
