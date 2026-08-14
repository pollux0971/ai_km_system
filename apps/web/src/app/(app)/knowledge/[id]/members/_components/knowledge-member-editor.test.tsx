import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeMemberEditor from "./knowledge-member-editor";
import { getKnowledgeBase, updateKnowledgeBaseMembers } from "@/lib/knowledge-bases";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/knowledge-bases", () => ({
  getKnowledgeBase: vi.fn(),
  updateKnowledgeBaseMembers: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedGetKnowledgeBase = vi.mocked(getKnowledgeBase);
const mockedUpdateKnowledgeBaseMembers = vi.mocked(updateKnowledgeBaseMembers);
const mockedTrackEvent = vi.mocked(trackEvent);

const sampleKnowledgeBase = {
  id: "kb1",
  name: "研發部門知識庫",
  description: "內部技術文件。",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

beforeEach(() => {
  mockedGetKnowledgeBase.mockReset();
  mockedUpdateKnowledgeBaseMembers.mockReset();
  mockedTrackEvent.mockReset();
});

describe("KnowledgeMemberEditor (E05-S007)", () => {
  it("shows a loading state before the knowledge base resolves", () => {
    mockedGetKnowledgeBase.mockReturnValue(new Promise(() => {}));

    render(<KnowledgeMemberEditor id="kb1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<KnowledgeMemberEditor id="kb1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入知識庫。");
  });

  it("shows a distinct not-found state (not the generic error) when the id doesn't match anything", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: null });

    render(<KnowledgeMemberEditor id="does-not-exist" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到您要的內容。");
  });

  it("shows 尚無成員 when the knowledge base has no members yet", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeMemberEditor id="kb1" />);

    expect(await screen.findByText("尚無成員。")).toBeInTheDocument();
  });

  it("shows the existing members, each with a 移除 button", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, members: ["demo-user", "demo-maintenance"] },
    });

    render(<KnowledgeMemberEditor id="kb1" />);

    expect(await screen.findByText("demo-user")).toBeInTheDocument();
    expect(screen.getByText("demo-maintenance")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "移除" })).toHaveLength(2);
  });

  it("disables the 新增 button until a member identifier is entered", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeMemberEditor id="kb1" />);
    await screen.findByText("尚無成員。");

    expect(screen.getByRole("button", { name: "新增" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("新增成員(使用者代號)"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "新增" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("新增成員(使用者代號)"), { target: { value: "demo-user" } });
    expect(screen.getByRole("button", { name: "新增" })).toBeEnabled();
  });

  it("adding a member succeeds, clears the input, and shows the new member", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseMembers.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, members: ["demo-user"] },
    });

    render(<KnowledgeMemberEditor id="kb1" />);
    await screen.findByText("尚無成員。");

    fireEvent.change(screen.getByLabelText("新增成員(使用者代號)"), { target: { value: "  demo-user  " } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));

    await waitFor(() => expect(screen.getByText("demo-user")).toBeInTheDocument());
    expect(mockedUpdateKnowledgeBaseMembers).toHaveBeenCalledWith("kb1", ["demo-user"]);
    expect(screen.getByLabelText("新增成員(使用者代號)")).toHaveValue("");
  });

  it("removing a member sends the rest of the list unchanged", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, members: ["demo-user", "demo-sales"] },
    });
    mockedUpdateKnowledgeBaseMembers.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, members: ["demo-sales"] },
    });

    render(<KnowledgeMemberEditor id="kb1" />);
    const removeButtons = await screen.findAllByRole("button", { name: "移除" });
    fireEvent.click(removeButtons[0]!);

    await waitFor(() => expect(screen.queryByText("demo-user")).not.toBeInTheDocument());
    expect(mockedUpdateKnowledgeBaseMembers).toHaveBeenCalledWith("kb1", ["demo-sales"]);
    expect(screen.getByText("demo-sales")).toBeInTheDocument();
  });

  it("shows a distinct error alert when adding fails, and keeps the typed draft so the user doesn't have to retype it", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseMembers.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "找不到這個知識庫。" },
    });

    render(<KnowledgeMemberEditor id="kb1" />);
    await screen.findByText("尚無成員。");

    fireEvent.change(screen.getByLabelText("新增成員(使用者代號)"), { target: { value: "demo-user" } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("更新成員失敗");
    expect(screen.getByLabelText("新增成員(使用者代號)")).toHaveValue("demo-user");
  });

  it("disables the add form and every remove button while a request is in flight, preventing a second action from racing the first", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, members: ["demo-user"] },
    });
    mockedUpdateKnowledgeBaseMembers.mockReturnValue(new Promise(() => {}));

    render(<KnowledgeMemberEditor id="kb1" />);
    await screen.findByText("demo-user");

    fireEvent.change(screen.getByLabelText("新增成員(使用者代號)"), { target: { value: "demo-sales" } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));

    expect(await screen.findByRole("status")).toHaveTextContent("儲存中…");
    expect(screen.getByLabelText("新增成員(使用者代號)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "新增" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "移除" })).toBeDisabled();
  });

  it("shows a 返回知識庫詳情 link pointing back at /knowledge/{id}", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeMemberEditor id="kb1" />);
    await screen.findByText("尚無成員。");

    expect(screen.getByRole("link", { name: "返回知識庫詳情" })).toHaveAttribute("href", "/knowledge/kb1");
  });

  it("emits attempt and success telemetry (including the from/to member lists) sharing the same correlation id", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseMembers.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, members: ["demo-user"] },
    });

    render(<KnowledgeMemberEditor id="kb1" />);
    await screen.findByText("尚無成員。");
    fireEvent.change(screen.getByLabelText("新增成員(使用者代號)"), { target: { value: "demo-user" } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));

    await waitFor(() => expect(mockedUpdateKnowledgeBaseMembers).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_members_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_members_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attempt = attemptCall as [string, { correlationId: string; properties: { from: string[]; to: string[] } }];
    const success = successCall as [string, { correlationId: string; properties: { members: string[] } }];
    expect(attempt[1].properties.from).toEqual([]);
    expect(attempt[1].properties.to).toEqual(["demo-user"]);
    expect(success[1].properties.members).toEqual(["demo-user"]);
    expect(attempt[1].correlationId).toBe(success[1].correlationId);
  });

  it("emits failure telemetry with the error code when the update fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseMembers.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "找不到這個知識庫。" },
    });

    render(<KnowledgeMemberEditor id="kb1" />);
    await screen.findByText("尚無成員。");
    fireEvent.change(screen.getByLabelText("新增成員(使用者代號)"), { target: { value: "demo-user" } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_members_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("NOT_FOUND");
  });
});
