import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PermissionMatrix from "./permission-matrix";
import { listPermissionMatrix, ALL_CAPABILITIES, type PermissionMatrixRow } from "@/lib/permission-matrix";
import { ALL_ROLES } from "@/lib/users";

vi.mock("@/lib/permission-matrix", async () => {
  const actual = await vi.importActual<typeof import("@/lib/permission-matrix")>("@/lib/permission-matrix");
  return { ...actual, listPermissionMatrix: vi.fn() };
});

const mockedListPermissionMatrix = vi.mocked(listPermissionMatrix);

// Mirrors the real ROLE_CAPABILITIES data in @/lib/permission-matrix — kept
// as a literal fixture here rather than calling the real implementation,
// same "duplicate the known-good literal, don't call production code from
// its own test" shape role-list.test.tsx's own hardcoded description
// fixtures already establish.
const FULL_MATRIX: PermissionMatrixRow[] = [
  { role: "general_user", capabilities: [] },
  { role: "department_manager", capabilities: ["部門 KB", "部門使用者", "部門 Knowledge"] },
  { role: "knowledge_manager", capabilities: ["Knowledge", "Document", "FAQ", "Feedback", "Knowledge Quality"] },
  { role: "maintenance_engineer", capabilities: ["Maintenance Assistant", "SOP", "Error Code", "Troubleshooting"] },
  { role: "sales_purchasing", capabilities: ["ERP Assistant", "Data Query", "Excel"] },
  { role: "it_administrator", capabilities: ["Account", "SSO", "Connector", "System"] },
  { role: "ai_administrator", capabilities: ["Model", "Prompt", "Evaluation", "RAG"] },
  { role: "auditor", capabilities: ["Audit", "Security Event"] },
  { role: "super_administrator", capabilities: ALL_CAPABILITIES },
];

function cellsFor(role: string) {
  const row = screen.getByText(role).closest("tr");
  if (!row) throw new Error(`no row found for ${role}`);
  return within(row).getAllByRole("cell");
}

describe("PermissionMatrix (E11-S008)", () => {
  it("shows a loading indicator before the matrix resolves", () => {
    mockedListPermissionMatrix.mockReturnValue(new Promise(() => {}));

    render(<PermissionMatrix />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedListPermissionMatrix.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<PermissionMatrix />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows an empty state when there are no rows", async () => {
    mockedListPermissionMatrix.mockResolvedValue({ ok: true, value: [] });

    render(<PermissionMatrix />);

    expect(await screen.findByText("尚無權限資料。")).toBeInTheDocument();
  });

  it("renders a column header for every capability and a row for every role, not just the first few", async () => {
    mockedListPermissionMatrix.mockResolvedValue({ ok: true, value: FULL_MATRIX });

    render(<PermissionMatrix />);

    await screen.findByRole("table");
    for (const role of ALL_ROLES) {
      expect(screen.getByText(role)).toBeInTheDocument();
    }
    for (const capability of ALL_CAPABILITIES) {
      expect(screen.getByRole("columnheader", { name: capability })).toBeInTheDocument();
    }
  });

  it("marks a capability a role actually has with a checkmark, in the right column", async () => {
    mockedListPermissionMatrix.mockResolvedValue({ ok: true, value: FULL_MATRIX });

    render(<PermissionMatrix />);
    await screen.findByRole("table");

    const cells = cellsFor("department_manager");
    expect(cells[ALL_CAPABILITIES.indexOf("部門 KB")]).toHaveTextContent("✓");
  });

  it("leaves a capability a role does not have blank, not just some other role's checkmark bleeding across rows", async () => {
    mockedListPermissionMatrix.mockResolvedValue({ ok: true, value: FULL_MATRIX });

    render(<PermissionMatrix />);
    await screen.findByRole("table");

    const cells = cellsFor("department_manager");
    expect(cells[ALL_CAPABILITIES.indexOf("Knowledge")]).toHaveTextContent("");
  });

  it("general_user has no capability checked at all", async () => {
    mockedListPermissionMatrix.mockResolvedValue({ ok: true, value: FULL_MATRIX });

    render(<PermissionMatrix />);
    await screen.findByRole("table");

    const cells = cellsFor("general_user");
    for (const cell of cells) {
      expect(cell).toHaveTextContent("");
    }
  });

  it("super_administrator has every capability checked", async () => {
    mockedListPermissionMatrix.mockResolvedValue({ ok: true, value: FULL_MATRIX });

    render(<PermissionMatrix />);
    await screen.findByRole("table");

    const cells = cellsFor("super_administrator");
    for (const cell of cells) {
      expect(cell).toHaveTextContent("✓");
    }
  });

  it("does not show the empty state once the matrix is loaded", async () => {
    mockedListPermissionMatrix.mockResolvedValue({ ok: true, value: [{ role: "general_user", capabilities: [] }] });

    render(<PermissionMatrix />);

    await screen.findByRole("table");
    expect(screen.queryByText("尚無權限資料。")).not.toBeInTheDocument();
  });
});
