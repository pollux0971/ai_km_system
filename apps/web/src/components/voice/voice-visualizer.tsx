"use client";

import { useEffect, useState, type CSSProperties } from "react";
import "./voice-visualizer.css";

export type VoiceVisualizerState = "idle" | "listening" | "transcribing" | "error";

export interface VoiceVisualizerProps {
  state: VoiceVisualizerState;
  /** 0–1 mic RMS level. Only used while `state === "listening"`. */
  level?: number;
  size?: 40 | 56 | 72;
}

const BAR_PHASE = [0.55, 0.8, 1, 0.8, 0.55];
const BAR_MIN_PX = 5;
const BAR_MAX_PX = 20;
const RIPPLE_MIN_SCALE = 0.9;
const RIPPLE_MAX_SCALE = 1.6;
const SMOOTHING_FACTOR = 0.35;

function clampLevel(level: number | undefined): number {
  if (typeof level !== "number" || Number.isNaN(level)) return 0;
  return Math.max(0, Math.min(1, level));
}

function useReducedMotionPreference(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReduced(mql.matches);
    handleChange();
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return reduced;
}

/** Exponentially-smoothed level, reset to 0 whenever not listening. */
function useSmoothedLevel(state: VoiceVisualizerState, clampedLevel: number): number {
  const [smoothed, setSmoothed] = useState(0);

  useEffect(() => {
    if (state !== "listening") {
      setSmoothed(0);
      return;
    }
    setSmoothed((prev) => prev + (clampedLevel - prev) * SMOOTHING_FACTOR);
  }, [state, clampedLevel]);

  return state === "listening" ? smoothed : 0;
}

export function VoiceVisualizer({ state, level, size = 56 }: VoiceVisualizerProps) {
  const reducedMotion = useReducedMotionPreference();
  const clamped = clampLevel(level);
  const smoothed = useSmoothedLevel(state, clamped);

  const style: CSSProperties = { width: size, height: size };

  return (
    <div
      className={`voice-visualizer voice-visualizer--${state}`}
      data-state={state}
      data-reduced={reducedMotion ? "true" : "false"}
      data-size={size}
      aria-hidden="true"
      style={style}
    >
      {state === "idle" && <MicIcon className="vv-icon" />}
      {state === "listening" && (
        <ListeningGlyph level={smoothed} reducedMotion={reducedMotion} />
      )}
      {state === "transcribing" && <TranscribingGlyph reducedMotion={reducedMotion} />}
      {state === "error" && <ErrorGlyph reducedMotion={reducedMotion} />}
    </div>
  );
}

function ListeningGlyph({
  level,
  reducedMotion,
}: {
  level: number;
  reducedMotion: boolean;
}) {
  if (reducedMotion) {
    return (
      <div className="vv-listening vv-listening--reduced" data-testid="vv-listening-reduced">
        <span
          className="vv-bar-static"
          data-testid="vv-bar-static"
          style={{ width: `${(20 + level * 80).toFixed(2)}%` }}
        />
      </div>
    );
  }

  const rippleScale = RIPPLE_MIN_SCALE + level * (RIPPLE_MAX_SCALE - RIPPLE_MIN_SCALE);

  return (
    <div className="vv-listening" data-testid="vv-listening">
      <span
        className="vv-ripple vv-ripple--outer"
        data-testid="vv-ripple-outer"
        style={{ transform: `scale(${rippleScale.toFixed(4)})` }}
      />
      <span
        className="vv-ripple vv-ripple--inner"
        data-testid="vv-ripple-inner"
        style={{ transform: `scale(${((rippleScale + 1) / 2).toFixed(4)})` }}
      />
      <div className="vv-bars">
        {BAR_PHASE.map((phase, index) => (
          <span
            key={index}
            className="vv-bar"
            data-testid="vv-bar"
            style={{ height: `${(BAR_MIN_PX + level * (BAR_MAX_PX - BAR_MIN_PX) * phase).toFixed(2)}px` }}
          />
        ))}
      </div>
    </div>
  );
}

function TranscribingGlyph({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="vv-transcribing">
      <span className={reducedMotion ? "vv-arc vv-arc--static" : "vv-arc"} data-testid="vv-arc" />
      <MicIcon className="vv-icon vv-icon--faded" />
    </div>
  );
}

function ErrorGlyph({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className={reducedMotion ? "vv-error" : "vv-error vv-error--shake"}>
      <MicErrorIcon className="vv-icon" />
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="6" height="12" x="9" y="2" rx="3" fill="currentColor" />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={2}
        d="M6 10a6 6 0 0 0 12 0m-6 6v4m-4 1h8"
      />
    </svg>
  );
}

function MicErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="6" height="12" x="9" y="2" rx="3" fill="currentColor" />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={2}
        d="M6 10a6 6 0 0 0 12 0m-6 6v4m-4 1h8"
      />
      <path stroke="currentColor" strokeLinejoin="round" strokeWidth={1.4} d="m18.5 2.5 4 7h-8z" />
      <path stroke="currentColor" strokeLinecap="round" strokeWidth={1.3} d="M18.5 6.5v1.1m0 1.1v.05" />
    </svg>
  );
}
