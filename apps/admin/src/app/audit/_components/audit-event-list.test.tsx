import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AuditEventList from "./audit-event-list";
import { listAuditEvents } from "@/lib/audit";

vi.mock("@/lib/audit", () => ({
  listAuditEvents: vi.fn(),
}));

const mockedListAuditEvents = vi.mocked(listAuditEvents);

describe("AuditEventList (E11-S015)", () => {
  it("shows a loading indicator before the list resolves", () => {
    mockedListAuditEvents.mockReturnValue(new Promise(() => {}));

    render(<AuditEventList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedListAuditEvents.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<AuditEventList />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows an empty state when there are no audit events — the real production state today", async () => {
    mockedListAuditEvents.mockResolvedValue({ ok: true, value: [] });

    render(<AuditEventList />);

    expect(await screen.findByText("尚無稽核紀錄。")).toBeInTheDocument();
  });

  it("shows each event's own actor, action, and target once loaded", async () => {
    mockedListAuditEvents.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "a1",
          actor: "it_administrator",
          action: "停用使用者",
          target: "demo-user@example.com",
          occurredAt: "2026-08-17T01:00:00.000Z",
        },
      ],
    });

    render(<AuditEventList />);

    expect(await screen.findByText("it_administrator")).toBeInTheDocument();
    expect(screen.getByText("停用使用者")).toBeInTheDocument();
    expect(screen.getByText("demo-user@example.com")).toBeInTheDocument();
  });

  it("renders every event it's given, not just the first few — a silent truncation would slip past a small fixture", async () => {
    const actors = ["it_administrator", "ai_administrator", "auditor", "super_administrator", "it_administrator"];
    mockedListAuditEvents.mockResolvedValue({
      ok: true,
      value: actors.map((actor, index) => ({
        id: `a${index}`,
        actor,
        action: `動作 ${index}`,
        target: `目標 ${index}`,
        occurredAt: "2026-08-17T01:00:00.000Z",
      })),
    });

    render(<AuditEventList />);

    await screen.findByText("動作 0");
    for (let index = 0; index < actors.length; index += 1) {
      expect(screen.getByText(`動作 ${index}`)).toBeInTheDocument();
      expect(screen.getByText(`目標 ${index}`)).toBeInTheDocument();
    }
  });

  it("shows each event's own occurred-at time", async () => {
    mockedListAuditEvents.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "a1",
          actor: "it_administrator",
          action: "停用使用者",
          target: "demo-user@example.com",
          occurredAt: "2026-08-17T01:00:00.000Z",
        },
      ],
    });

    render(<AuditEventList />);
    await screen.findByText("it_administrator");

    expect(document.querySelector('time[datetime="2026-08-17T01:00:00.000Z"]')).toBeInTheDocument();
  });

  it("does not show the empty state once events are loaded", async () => {
    mockedListAuditEvents.mockResolvedValue({
      ok: true,
      value: [{ id: "a1", actor: "it_administrator", action: "停用使用者", target: "demo-user@example.com", occurredAt: "2026-08-17T01:00:00.000Z" }],
    });

    render(<AuditEventList />);

    await screen.findByText("it_administrator");
    expect(screen.queryByText("尚無稽核紀錄。")).not.toBeInTheDocument();
  });
});
