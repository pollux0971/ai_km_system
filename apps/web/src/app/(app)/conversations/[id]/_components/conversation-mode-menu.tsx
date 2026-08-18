"use client";

import { useState, type ReactNode } from "react";
import type { ConversationMode } from "@/lib/conversations";

/**
 * ux/enterprise-polish: Claude-style disclosure for the mode switch.
 * The existing ModeSwitch component (E03-S002) is untouched — this only
 * relocates WHERE its two buttons appear: inside a small pop-up panel
 * anchored to a trigger button in the composer's action row, instead of
 * the permanent stack conversation-detail.tsx used to render above the
 * thread.
 *
 * Trigger label is「對話模式：一般/進階」— deliberately NOT containing
 * the substrings "一般模式"/"進階模式". Playwright's getByRole name
 * matching is substring-by-default (the exact trap E13-S002 documented),
 * so a trigger named e.g.「模式：一般模式」would strict-mode-collide
 * with every existing spec that queries the real switch buttons.
 *
 * Plain conditional render (open/closed state), not a native <dialog> or
 * focus-trapped popover — the panel only hosts two toggle buttons, and
 * the codebase precedent for lightweight disclosure UI (E01-S014's
 * notification center, user-menu) is the same conditional-render shape.
 */
export function ConversationModeMenu({ mode, children }: { mode: ConversationMode | null; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const modeLabel = mode === "advanced" ? "進階" : "一般";

  return (
    <div className="mode-menu">
      <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((previous) => !previous)}>
        對話模式：{modeLabel}
      </button>
      {open && (
        <div className="mode-menu-panel" role="group" aria-label="選擇對話模式">
          {children}
        </div>
      )}
    </div>
  );
}
