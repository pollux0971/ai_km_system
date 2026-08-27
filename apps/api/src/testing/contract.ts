/**
 * Contract-test harness (E04-S039 Functional AC7).
 *
 * Lets any story assert that a real response body matches the frozen
 * contract, in one line, with a failure message that names what was wrong.
 * A response that merely "looks right" is not evidence; this is.
 */
import { loadContracts, resolveContractsDir, type ContractRegistry } from "../contracts.js";

let sharedRegistry: ContractRegistry | undefined;

/** Loads (once) the repo's real contracts, for callers that pass no registry. */
export async function getContractRegistry(): Promise<ContractRegistry> {
  if (!sharedRegistry) sharedRegistry = await loadContracts(resolveContractsDir());
  return sharedRegistry;
}

/** Test-only: lets a suite pin a registry (e.g. fixtures) up front. */
export function setContractRegistry(registry: ContractRegistry | undefined): void {
  sharedRegistry = registry;
}

/**
 * Throws unless `body` matches the contract's schema for this operation and
 * status. Never returns a boolean — a contract check that can be ignored by
 * forgetting an `expect()` is not a gate.
 */
export function expectResponseMatchesContract(
  specName: string,
  routePath: string,
  method: string,
  status: number,
  body: unknown,
  registry: ContractRegistry | undefined = sharedRegistry,
): void {
  if (!registry) {
    throw new Error(
      "尚未載入契約:請先 await getContractRegistry() 或以第 6 個參數傳入 registry。",
    );
  }
  const result = registry.validateResponse(specName, routePath, method, status, body);
  if (result.valid) return;
  throw new Error(
    `回應不符合契約 ${specName} ${method.toLowerCase()} ${routePath} → ${status}:\n` +
      result.errors.map((line) => `  - ${line}`).join("\n"),
  );
}
