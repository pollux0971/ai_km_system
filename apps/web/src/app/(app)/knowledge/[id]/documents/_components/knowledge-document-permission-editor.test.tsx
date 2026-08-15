import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeDocumentPermissionEditor from "./knowledge-document-permission-editor";
import { updateKnowledgeBaseDocumentVisibleRoles } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/knowledge-documents", () => ({
  updateKnowledgeBaseDocumentVisibleRoles: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedUpdateKnowledgeBaseDocumentVisibleRoles = vi.mocked(updateKnowledgeBaseDocumentVisibleRoles);
const mockedTrackEvent = vi.mocked(trackEvent);

const ALL_LABELS = ["一般使用者", "部門主管", "知識管理者", "維修工程師", "業務/採購", "IT 管理員", "AI 管理員", "稽核人員", "系統管理員"];

beforeEach(() => {
  mockedUpdateKnowledgeBaseDocumentVisibleRoles.mockReset();
  mockedTrackEvent.mockReset();
});

describe("KnowledgeDocumentPermissionEditor (E05-S027)", () => {
  it("shows a 文件權限 toggle button, collapsed initially with no checkboxes visible", () => {
    render(<KnowledgeDocumentPermissionEditor knowledgeBaseId="kb1" documentId="doc1" />);

    expect(screen.getByRole("button", { name: "文件權限" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("expanding shows all 9 roles as checkboxes, none checked, when no permission is configured yet", () => {
    render(<KnowledgeDocumentPermissionEditor knowledgeBaseId="kb1" documentId="doc1" />);

    fireEvent.click(screen.getByRole("button", { name: "文件權限" }));

    expect(screen.getByRole("button", { name: "收合文件權限" })).toHaveAttribute("aria-expanded", "true");
    for (const label of ALL_LABELS) {
      expect(screen.getByRole("checkbox", { name: label })).not.toBeChecked();
    }
  });

  it("shows the already-configured roles checked", () => {
    render(
      <KnowledgeDocumentPermissionEditor knowledgeBaseId="kb1" documentId="doc1" initialVisibleToRoles={["maintenance_engineer", "knowledge_manager"]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "文件權限" }));

    expect(screen.getByRole("checkbox", { name: "維修工程師" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "知識管理者" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "一般使用者" })).not.toBeChecked();
  });

  it("collapsing hides the checkboxes again, without losing the current selection", () => {
    render(<KnowledgeDocumentPermissionEditor knowledgeBaseId="kb1" documentId="doc1" initialVisibleToRoles={["general_user"]} />);
    fireEvent.click(screen.getByRole("button", { name: "文件權限" }));

    fireEvent.click(screen.getByRole("button", { name: "收合文件權限" }));

    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "文件權限" }));
    expect(screen.getByRole("checkbox", { name: "一般使用者" })).toBeChecked();
  });

  it("checking a box adds that role to the selection once the update succeeds", async () => {
    mockedUpdateKnowledgeBaseDocumentVisibleRoles.mockResolvedValue({
      ok: true,
      value: { id: "doc1", knowledgeBaseId: "kb1", name: "文件.pdf", uploadedAt: "2026-08-15T00:00:00.000Z", visibleToRoles: ["general_user"] },
    });
    render(<KnowledgeDocumentPermissionEditor knowledgeBaseId="kb1" documentId="doc1" />);
    fireEvent.click(screen.getByRole("button", { name: "文件權限" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "一般使用者" }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "一般使用者" })).toBeChecked());
    expect(mockedUpdateKnowledgeBaseDocumentVisibleRoles).toHaveBeenCalledWith("kb1", "doc1", ["general_user"]);
  });

  it("unchecking a box removes that role, sending the rest of the selection unchanged", async () => {
    mockedUpdateKnowledgeBaseDocumentVisibleRoles.mockResolvedValue({
      ok: true,
      value: { id: "doc1", knowledgeBaseId: "kb1", name: "文件.pdf", uploadedAt: "2026-08-15T00:00:00.000Z", visibleToRoles: ["auditor"] },
    });
    render(<KnowledgeDocumentPermissionEditor knowledgeBaseId="kb1" documentId="doc1" initialVisibleToRoles={["general_user", "auditor"]} />);
    fireEvent.click(screen.getByRole("button", { name: "文件權限" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "一般使用者" }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "一般使用者" })).not.toBeChecked());
    expect(mockedUpdateKnowledgeBaseDocumentVisibleRoles).toHaveBeenCalledWith("kb1", "doc1", ["auditor"]);
    expect(screen.getByRole("checkbox", { name: "稽核人員" })).toBeChecked();
  });

  it("shows a distinct error state and keeps the previous selection when the update fails", async () => {
    mockedUpdateKnowledgeBaseDocumentVisibleRoles.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } });
    render(<KnowledgeDocumentPermissionEditor knowledgeBaseId="kb1" documentId="doc1" initialVisibleToRoles={["general_user"]} />);
    fireEvent.click(screen.getByRole("button", { name: "文件權限" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "稽核人員" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("更新文件權限失敗，請稍後再試。");
    expect(screen.getByRole("checkbox", { name: "一般使用者" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "稽核人員" })).not.toBeChecked();
  });

  it("disables every checkbox while an update is in flight, preventing a second toggle from racing the first", async () => {
    mockedUpdateKnowledgeBaseDocumentVisibleRoles.mockReturnValue(new Promise(() => {}));
    render(<KnowledgeDocumentPermissionEditor knowledgeBaseId="kb1" documentId="doc1" />);
    fireEvent.click(screen.getByRole("button", { name: "文件權限" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "一般使用者" }));

    expect(await screen.findByRole("status")).toHaveTextContent("儲存中…");
    expect(screen.getByRole("checkbox", { name: "一般使用者" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "稽核人員" })).toBeDisabled();
  });

  it("emits attempt and success telemetry (including the from/to role lists and documentId) sharing the same correlation id", async () => {
    mockedUpdateKnowledgeBaseDocumentVisibleRoles.mockResolvedValue({
      ok: true,
      value: { id: "doc1", knowledgeBaseId: "kb1", name: "文件.pdf", uploadedAt: "2026-08-15T00:00:00.000Z", visibleToRoles: ["general_user"] },
    });
    render(<KnowledgeDocumentPermissionEditor knowledgeBaseId="kb1" documentId="doc1" />);
    fireEvent.click(screen.getByRole("button", { name: "文件權限" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "一般使用者" }));

    await waitFor(() => expect(mockedUpdateKnowledgeBaseDocumentVisibleRoles).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_permission_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_permission_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attempt = attemptCall as [string, { correlationId: string; properties: { knowledgeBaseId: string; documentId: string; from: string[]; to: string[] } }];
    const success = successCall as [string, { correlationId: string; properties: { roles: string[] } }];
    expect(attempt[1].properties.knowledgeBaseId).toBe("kb1");
    expect(attempt[1].properties.documentId).toBe("doc1");
    expect(attempt[1].properties.from).toEqual([]);
    expect(attempt[1].properties.to).toEqual(["general_user"]);
    expect(success[1].properties.roles).toEqual(["general_user"]);
    expect(attempt[1].correlationId).toBe(success[1].correlationId);
  });

  it("emits failure telemetry with the error code when the update fails", async () => {
    mockedUpdateKnowledgeBaseDocumentVisibleRoles.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "down" } });
    render(<KnowledgeDocumentPermissionEditor knowledgeBaseId="kb1" documentId="doc1" />);
    fireEvent.click(screen.getByRole("button", { name: "文件權限" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "一般使用者" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_permission_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("NOT_FOUND");
  });
});
