import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgePermissionEditor from "./knowledge-permission-editor";
import { getKnowledgeBase, updateKnowledgeBaseVisibleRoles } from "@/lib/knowledge-bases";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/knowledge-bases", () => ({
  getKnowledgeBase: vi.fn(),
  updateKnowledgeBaseVisibleRoles: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedGetKnowledgeBase = vi.mocked(getKnowledgeBase);
const mockedUpdateKnowledgeBaseVisibleRoles = vi.mocked(updateKnowledgeBaseVisibleRoles);
const mockedTrackEvent = vi.mocked(trackEvent);

const sampleKnowledgeBase = {
  id: "kb1",
  name: "研發部門知識庫",
  description: "內部技術文件。",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

const ALL_LABELS = [
  "一般使用者",
  "部門主管",
  "知識管理者",
  "維修工程師",
  "業務/採購",
  "IT 管理員",
  "AI 管理員",
  "稽核人員",
  "系統管理員",
];

beforeEach(() => {
  mockedGetKnowledgeBase.mockReset();
  mockedUpdateKnowledgeBaseVisibleRoles.mockReset();
  mockedTrackEvent.mockReset();
});

describe("KnowledgePermissionEditor (E05-S006)", () => {
  it("shows a loading state before the knowledge base resolves", () => {
    mockedGetKnowledgeBase.mockReturnValue(new Promise(() => {}));

    render(<KnowledgePermissionEditor id="kb1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<KnowledgePermissionEditor id="kb1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入知識庫。");
  });

  it("shows a distinct not-found state (not the generic error) when the id doesn't match anything", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: null });

    render(<KnowledgePermissionEditor id="does-not-exist" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到您要的內容。");
  });

  it("shows a 返回知識庫詳情 link pointing back at /knowledge/{id}", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgePermissionEditor id="kb1" />);
    await screen.findByRole("group", { name: "可存取此知識庫的角色" });

    expect(screen.getByRole("link", { name: "返回知識庫詳情" })).toHaveAttribute("href", "/knowledge/kb1");
  });

  it("shows all 9 roles as checkboxes, none checked, when the knowledge base has no permission configured yet", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgePermissionEditor id="kb1" />);
    await screen.findByRole("group", { name: "可存取此知識庫的角色" });

    for (const label of ALL_LABELS) {
      expect(screen.getByRole("checkbox", { name: label })).not.toBeChecked();
    }
  });

  it("shows the already-configured roles checked", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, visibleToRoles: ["maintenance_engineer", "knowledge_manager"] },
    });

    render(<KnowledgePermissionEditor id="kb1" />);
    await screen.findByRole("group", { name: "可存取此知識庫的角色" });

    expect(screen.getByRole("checkbox", { name: "維修工程師" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "知識管理者" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "一般使用者" })).not.toBeChecked();
  });

  it("checking a box adds that role to the selection once the update succeeds", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseVisibleRoles.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, visibleToRoles: ["general_user"] },
    });

    render(<KnowledgePermissionEditor id="kb1" />);
    await screen.findByRole("group", { name: "可存取此知識庫的角色" });

    fireEvent.click(screen.getByRole("checkbox", { name: "一般使用者" }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "一般使用者" })).toBeChecked());
    expect(mockedUpdateKnowledgeBaseVisibleRoles).toHaveBeenCalledWith("kb1", ["general_user"]);
  });

  it("unchecking a box removes that role, sending the rest of the selection unchanged", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, visibleToRoles: ["general_user", "auditor"] },
    });
    mockedUpdateKnowledgeBaseVisibleRoles.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, visibleToRoles: ["auditor"] },
    });

    render(<KnowledgePermissionEditor id="kb1" />);
    await screen.findByRole("group", { name: "可存取此知識庫的角色" });

    fireEvent.click(screen.getByRole("checkbox", { name: "一般使用者" }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "一般使用者" })).not.toBeChecked());
    expect(mockedUpdateKnowledgeBaseVisibleRoles).toHaveBeenCalledWith("kb1", ["auditor"]);
    expect(screen.getByRole("checkbox", { name: "稽核人員" })).toBeChecked();
  });

  it("shows a distinct error state and keeps the previous selection when the update fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, visibleToRoles: ["general_user"] },
    });
    mockedUpdateKnowledgeBaseVisibleRoles.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "找不到這個知識庫。" },
    });

    render(<KnowledgePermissionEditor id="kb1" />);
    await screen.findByRole("group", { name: "可存取此知識庫的角色" });

    fireEvent.click(screen.getByRole("checkbox", { name: "稽核人員" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("更新權限失敗，請稍後再試。");
    expect(screen.getByRole("checkbox", { name: "一般使用者" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "稽核人員" })).not.toBeChecked();
  });

  it("disables every checkbox while an update is in flight, preventing a second toggle from racing the first", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseVisibleRoles.mockReturnValue(new Promise(() => {}));

    render(<KnowledgePermissionEditor id="kb1" />);
    await screen.findByRole("group", { name: "可存取此知識庫的角色" });

    fireEvent.click(screen.getByRole("checkbox", { name: "一般使用者" }));

    expect(await screen.findByRole("status")).toHaveTextContent("儲存中…");
    expect(screen.getByRole("checkbox", { name: "一般使用者" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "稽核人員" })).toBeDisabled();
  });

  it("emits attempt and success telemetry (including the from/to role lists) sharing the same correlation id", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseVisibleRoles.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, visibleToRoles: ["general_user"] },
    });

    render(<KnowledgePermissionEditor id="kb1" />);
    await screen.findByRole("group", { name: "可存取此知識庫的角色" });
    fireEvent.click(screen.getByRole("checkbox", { name: "一般使用者" }));

    await waitFor(() => expect(mockedUpdateKnowledgeBaseVisibleRoles).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_permission_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_permission_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attempt = attemptCall as [string, { correlationId: string; properties: { from: string[]; to: string[] } }];
    const success = successCall as [string, { correlationId: string; properties: { roles: string[] } }];
    expect(attempt[1].properties.from).toEqual([]);
    expect(attempt[1].properties.to).toEqual(["general_user"]);
    expect(success[1].properties.roles).toEqual(["general_user"]);
    expect(attempt[1].correlationId).toBe(success[1].correlationId);
  });

  it("emits failure telemetry with the error code when the update fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseVisibleRoles.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "找不到這個知識庫。" },
    });

    render(<KnowledgePermissionEditor id="kb1" />);
    await screen.findByRole("group", { name: "可存取此知識庫的角色" });
    fireEvent.click(screen.getByRole("checkbox", { name: "一般使用者" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_permission_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("NOT_FOUND");
  });
});
