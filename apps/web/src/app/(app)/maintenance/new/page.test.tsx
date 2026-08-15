import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewMaintenanceCasePage from "./page";
import { createMaintenanceCase } from "@/lib/maintenance-cases";
import { EQUIPMENT_OPTIONS } from "@/lib/equipment";
import { trackEvent } from "@/lib/telemetry";

const { mockReplace, mockRefresh, mockRouter } = vi.hoisted(() => {
  const mockReplace = vi.fn();
  const mockRefresh = vi.fn();
  return { mockReplace, mockRefresh, mockRouter: { replace: mockReplace, refresh: mockRefresh } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/lib/maintenance-cases", () => ({
  createMaintenanceCase: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedCreateMaintenanceCase = vi.mocked(createMaintenanceCase);
const mockedTrackEvent = vi.mocked(trackEvent);

const firstEquipment = EQUIPMENT_OPTIONS[0]!;

const sampleCase = {
  id: "case-new-1",
  title: firstEquipment.name,
  updatedAt: "2026-08-15T00:00:00.000Z",
  equipmentId: firstEquipment.id,
};

beforeEach(() => {
  mockReplace.mockReset();
  mockRefresh.mockReset();
  mockedCreateMaintenanceCase.mockReset();
  mockedTrackEvent.mockReset();
});

describe("NewMaintenanceCasePage (E07-S002)", () => {
  it("renders the equipment select with the submit button disabled until an option is chosen", () => {
    render(<NewMaintenanceCasePage />);

    expect(screen.getByLabelText("選擇設備")).toHaveValue("");
    expect(screen.getByRole("button", { name: "建立案例" })).toBeDisabled();
  });

  it("lists every EQUIPMENT_OPTIONS entry as a selectable option", () => {
    render(<NewMaintenanceCasePage />);

    for (const option of EQUIPMENT_OPTIONS) {
      expect(screen.getByRole("option", { name: option.name })).toBeInTheDocument();
    }
  });

  it("enables the submit button once an equipment option is selected", () => {
    render(<NewMaintenanceCasePage />);

    fireEvent.change(screen.getByLabelText("選擇設備"), { target: { value: firstEquipment.id } });

    expect(screen.getByRole("button", { name: "建立案例" })).toBeEnabled();
  });

  it("the cancel link points back to /maintenance", () => {
    render(<NewMaintenanceCasePage />);

    expect(screen.getByRole("link", { name: "取消" })).toHaveAttribute("href", "/maintenance");
  });

  it("submits the selected equipmentId with an empty serial number, then redirects to /maintenance and refreshes the router cache", async () => {
    mockedCreateMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });

    render(<NewMaintenanceCasePage />);
    fireEvent.change(screen.getByLabelText("選擇設備"), { target: { value: firstEquipment.id } });
    fireEvent.click(screen.getByRole("button", { name: "建立案例" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/maintenance"));
    expect(mockedCreateMaintenanceCase).toHaveBeenCalledWith(firstEquipment.id, "");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows a distinct error alert when creation fails, does not navigate away, and keeps the selection", async () => {
    mockedCreateMaintenanceCase.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<NewMaintenanceCasePage />);
    fireEvent.change(screen.getByLabelText("選擇設備"), { target: { value: firstEquipment.id } });
    fireEvent.click(screen.getByRole("button", { name: "建立案例" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("無法建立維修案例");
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("選擇設備")).toHaveValue(firstEquipment.id);
  });

  it("disables the submit button while the request is pending, preventing a double submit", async () => {
    let resolveCreate!: (result: Awaited<ReturnType<typeof createMaintenanceCase>>) => void;
    mockedCreateMaintenanceCase.mockReturnValueOnce(new Promise((resolve) => (resolveCreate = resolve)));

    render(<NewMaintenanceCasePage />);
    fireEvent.change(screen.getByLabelText("選擇設備"), { target: { value: firstEquipment.id } });
    fireEvent.click(screen.getByRole("button", { name: "建立案例" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "建立案例" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "建立案例" }));

    resolveCreate({ ok: true, value: sampleCase });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    expect(mockedCreateMaintenanceCase).toHaveBeenCalledTimes(1);
  });

  it("emits attempt and success telemetry sharing the same correlation id", async () => {
    mockedCreateMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });

    render(<NewMaintenanceCasePage />);
    fireEvent.change(screen.getByLabelText("選擇設備"), { target: { value: firstEquipment.id } });
    fireEvent.click(screen.getByRole("button", { name: "建立案例" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "maintenance_case_create_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "maintenance_case_create_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attemptId = (attemptCall as [string, { correlationId: string }])[1].correlationId;
    const successId = (successCall as [string, { correlationId: string }])[1].correlationId;
    expect(attemptId).toBe(successId);
  });

  it("emits failure telemetry with the error code when creation fails", async () => {
    mockedCreateMaintenanceCase.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<NewMaintenanceCasePage />);
    fireEvent.change(screen.getByLabelText("選擇設備"), { target: { value: firstEquipment.id } });
    fireEvent.click(screen.getByRole("button", { name: "建立案例" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "maintenance_case_create_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("NewMaintenanceCasePage serialNumber field (E07-S003)", () => {
  it("renders the optional serial number field, starting empty, submit still enabled by equipment alone", () => {
    render(<NewMaintenanceCasePage />);

    expect(screen.getByLabelText("設備序號(選填)")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("選擇設備"), { target: { value: firstEquipment.id } });
    expect(screen.getByRole("button", { name: "建立案例" })).toBeEnabled();
  });

  it("submits the typed serial number alongside the selected equipmentId", async () => {
    mockedCreateMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });

    render(<NewMaintenanceCasePage />);
    fireEvent.change(screen.getByLabelText("選擇設備"), { target: { value: firstEquipment.id } });
    fireEvent.change(screen.getByLabelText("設備序號(選填)"), { target: { value: "SN-2026-0042" } });
    fireEvent.click(screen.getByRole("button", { name: "建立案例" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockedCreateMaintenanceCase).toHaveBeenCalledWith(firstEquipment.id, "SN-2026-0042");
  });

  it("never includes the serial number itself in telemetry properties", async () => {
    mockedCreateMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });

    render(<NewMaintenanceCasePage />);
    fireEvent.change(screen.getByLabelText("選擇設備"), { target: { value: firstEquipment.id } });
    fireEvent.change(screen.getByLabelText("設備序號(選填)"), { target: { value: "SN-2026-0042" } });
    fireEvent.click(screen.getByRole("button", { name: "建立案例" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    for (const call of mockedTrackEvent.mock.calls) {
      const properties = (call as [string, { properties?: Record<string, unknown> }])[1]?.properties;
      expect(JSON.stringify(properties ?? {})).not.toContain("SN-2026-0042");
    }
  });
});
