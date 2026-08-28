import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DangerousActionConfirm } from "./dangerous-action-confirm";

describe("DangerousActionConfirm (E11-S024)", () => {
  it("shows only the trigger button initially, not the confirmation dialog", () => {
    render(
      <DangerousActionConfirm
        triggerLabel="刪除部門"
        dialogLabel="確認刪除部門：資訊部"
        message="確定要刪除「資訊部」嗎？此操作無法復原。"
        confirmLabel="確認刪除"
        errorMessage="刪除失敗，請稍後再試。"
        onConfirm={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "刪除部門" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("clicking the trigger reveals a role=alertdialog with the target's own name in its accessible name and the confirmation message", () => {
    render(
      <DangerousActionConfirm
        triggerLabel="刪除部門"
        dialogLabel="確認刪除部門：資訊部"
        message="確定要刪除「資訊部」嗎？此操作無法復原。"
        confirmLabel="確認刪除"
        errorMessage="刪除失敗，請稍後再試。"
        onConfirm={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "刪除部門" }));

    expect(screen.getByRole("alertdialog", { name: "確認刪除部門：資訊部" })).toBeInTheDocument();
    expect(screen.getByText("確定要刪除「資訊部」嗎？此操作無法復原。")).toBeInTheDocument();
  });

  it("clicking 取消 hides the dialog and does not call onConfirm", () => {
    const onConfirm = vi.fn();
    render(
      <DangerousActionConfirm
        triggerLabel="刪除部門"
        dialogLabel="確認刪除部門：資訊部"
        message="確定要刪除「資訊部」嗎？此操作無法復原。"
        confirmLabel="確認刪除"
        errorMessage="刪除失敗，請稍後再試。"
        onConfirm={onConfirm}
        onConfirmed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "刪除部門" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刪除部門" })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("clicking 確認刪除 calls onConfirm, and on success calls onConfirmed and closes the dialog", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    const onConfirmed = vi.fn();
    render(
      <DangerousActionConfirm
        triggerLabel="刪除部門"
        dialogLabel="確認刪除部門：資訊部"
        message="確定要刪除「資訊部」嗎？此操作無法復原。"
        confirmLabel="確認刪除"
        errorMessage="刪除失敗，請稍後再試。"
        onConfirm={onConfirm}
        onConfirmed={onConfirmed}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "刪除部門" }));
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows a distinct error message and keeps the dialog open when onConfirm fails, without calling onConfirmed", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });
    const onConfirmed = vi.fn();
    render(
      <DangerousActionConfirm
        triggerLabel="刪除部門"
        dialogLabel="確認刪除部門：資訊部"
        message="確定要刪除「資訊部」嗎？此操作無法復原。"
        confirmLabel="確認刪除"
        errorMessage="刪除失敗，請稍後再試。"
        onConfirm={onConfirm}
        onConfirmed={onConfirmed}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "刪除部門" }));
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("刪除失敗，請稍後再試。");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("clears the previous error and closes the dialog once a retry succeeds", async () => {
    const onConfirm = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } })
      .mockResolvedValueOnce({ ok: true, value: undefined });
    const onConfirmed = vi.fn();
    render(
      <DangerousActionConfirm
        triggerLabel="刪除部門"
        dialogLabel="確認刪除部門：資訊部"
        message="確定要刪除「資訊部」嗎？此操作無法復原。"
        confirmLabel="確認刪除"
        errorMessage="刪除失敗，請稍後再試。"
        onConfirm={onConfirm}
        onConfirmed={onConfirmed}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "刪除部門" }));
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("刪除失敗，請稍後再試。");

    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("reopening after cancel clears any previous error state", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });
    render(
      <DangerousActionConfirm
        triggerLabel="刪除部門"
        dialogLabel="確認刪除部門：資訊部"
        message="確定要刪除「資訊部」嗎？此操作無法復原。"
        confirmLabel="確認刪除"
        errorMessage="刪除失敗，請稍後再試。"
        onConfirm={onConfirm}
        onConfirmed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "刪除部門" }));
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "刪除部門" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the confirm and cancel buttons while the confirmation is in flight, preventing a double click", async () => {
    let resolveConfirm!: (value: { ok: true; value: undefined }) => void;
    const onConfirm = vi.fn().mockReturnValue(new Promise((resolve) => (resolveConfirm = resolve)));
    render(
      <DangerousActionConfirm
        triggerLabel="刪除部門"
        dialogLabel="確認刪除部門：資訊部"
        message="確定要刪除「資訊部」嗎？此操作無法復原。"
        confirmLabel="確認刪除"
        errorMessage="刪除失敗，請稍後再試。"
        onConfirm={onConfirm}
        onConfirmed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "刪除部門" }));
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));
    expect(screen.getByRole("button", { name: "確認刪除" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));

    resolveConfirm({ ok: true, value: undefined });
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });
});
