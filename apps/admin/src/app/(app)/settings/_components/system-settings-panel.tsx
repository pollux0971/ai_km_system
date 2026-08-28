"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { disableSso, enableSso, getSystemSettings, type SystemSettings } from "@/lib/system-settings";

const logger = createLogger("admin:system-settings-panel");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; settings: SystemSettings };

/**
 * E11-S020 "System settings" — same loading/error/loaded shape every
 * other admin page already establishes, plus a `UserStatusToggle`
 * (E11-S005) style toggle for the one real setting that exists
 * (`system-settings.ts`'s own doc comment explains why it's the only
 * one). No list here — unlike Users/Models/Connectors, there is exactly
 * one global setting, not a collection of rows.
 */
export default function SystemSettingsPanel() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [toggleError, setToggleError] = useState(false);

  const fetchSettings = useCallback((cancelledRef?: { current: boolean }) => {
    const correlationId = crypto.randomUUID();
    logger.info("loading system settings", { correlationId });

    getSystemSettings().then((result) => {
      if (cancelledRef?.current) return;

      if (!result.ok) {
        logger.error("failed to load system settings", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("system settings loaded", { correlationId });
      setState({ status: "loaded", settings: result.value });
    });
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };
    fetchSettings(cancelledRef);

    return () => {
      cancelledRef.current = true;
    };
  }, [fetchSettings]);

  async function handleToggle() {
    if (state.status !== "loaded" || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setToggleError(false);
    logger.info(state.settings.ssoEnabled ? "disabling sso" : "enabling sso", { correlationId });

    const result = state.settings.ssoEnabled ? await disableSso() : await enableSso();
    setPending(false);

    if (!result.ok) {
      logger.error("failed to toggle sso", { correlationId, code: result.error.code });
      setToggleError(true);
      return;
    }

    logger.info("sso toggled", { correlationId, ssoEnabled: result.value.ssoEnabled });
    setState({ status: "loaded", settings: result.value });
  }

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入系統設定。" />;
  }

  return (
    <div>
      <p>
        <strong>SSO 登入</strong>
      </p>
      <p>{state.settings.ssoEnabled ? "已啟用" : "已停用"}</p>
      <button type="button" onClick={handleToggle} disabled={pending}>
        {state.settings.ssoEnabled ? "停用" : "啟用"}
      </button>
      {toggleError && (
        <span style={{ marginLeft: 8 }}>
          <ErrorMessage message="設定更新失敗，請稍後再試。" />
        </span>
      )}
    </div>
  );
}
