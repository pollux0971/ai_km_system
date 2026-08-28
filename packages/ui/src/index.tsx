import type { ButtonHTMLAttributes } from "react";
import { colors, spacing } from "@ai-km/design-tokens";

/** Trivial primitive proving the shared UI package resolves end-to-end. Replace as real UI stories land. */
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        background: colors.primary,
        color: colors.background,
        padding: `${spacing.sm} ${spacing.md}`,
        border: "none",
        borderRadius: 6,
        ...props.style,
      }}
    />
  );
}

export * from "./loading";
export * from "./error-message";
export * from "./empty-state";
export * from "./crash-fallback";
export * from "./icon";
