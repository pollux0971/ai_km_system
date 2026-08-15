import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MaintenanceCaseList from "./maintenance-case-list";
import { listMaintenanceCases } from "@/lib/maintenance-cases";

vi.mock("@/lib/maintenance-cases", () => ({
  listMaintenanceCases: vi.fn(),
}));

const mockedListMaintenanceCases = vi.mocked(listMaintenanceCases);

describe("MaintenanceCaseList (E07-S001)", () => {
  it("shows a loading state before the list resolves", () => {
    mockedListMaintenanceCases.mockReturnValue(new Promise(() => {}));

    render(<MaintenanceCaseList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows each case's title and timestamp once loaded", async () => {
    mockedListMaintenanceCases.mockResolvedValue({
      ok: true,
      value: [{ id: "case1", title: "測試維修案例", updatedAt: "2026-08-14T06:30:00.000Z" }],
    });

    render(<MaintenanceCaseList />);

    expect(await screen.findByText("測試維修案例")).toBeInTheDocument();
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedListMaintenanceCases.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<MaintenanceCaseList />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入維修案例列表。");
  });

  it("shows an empty state (not an error) when there are no cases", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [] });

    render(<MaintenanceCaseList />);

    expect(await screen.findByText("尚無維修案例。")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders no links on any case item (E07-S021 owns the not-yet-existing detail route)", async () => {
    mockedListMaintenanceCases.mockResolvedValue({
      ok: true,
      value: [{ id: "case1", title: "測試維修案例", updatedAt: "2026-08-14T06:30:00.000Z" }],
    });

    render(<MaintenanceCaseList />);
    await screen.findByText("測試維修案例");

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("MaintenanceCaseList serialNumber (E07-S003)", () => {
  it("shows the serial number when the case has one", async () => {
    mockedListMaintenanceCases.mockResolvedValue({
      ok: true,
      value: [
        { id: "case1", title: "測試維修案例", updatedAt: "2026-08-14T06:30:00.000Z", serialNumber: "SN-2026-0042" },
      ],
    });

    render(<MaintenanceCaseList />);

    expect(await screen.findByText("序號:SN-2026-0042")).toBeInTheDocument();
  });

  it("shows no serial number line when the case doesn't have one", async () => {
    mockedListMaintenanceCases.mockResolvedValue({
      ok: true,
      value: [{ id: "case1", title: "測試維修案例", updatedAt: "2026-08-14T06:30:00.000Z" }],
    });

    render(<MaintenanceCaseList />);
    await screen.findByText("測試維修案例");

    expect(screen.queryByText(/^序號:/)).not.toBeInTheDocument();
  });
});
