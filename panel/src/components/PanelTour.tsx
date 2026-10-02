import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { PANEL_TOUR_STEPS, TOUR_STORAGE_KEY, type TourStep } from "../tour/steps";
import type { Tab } from "../pages/WorkspacePage";

type Rect = { top: number; left: number; width: number; height: number };

function measureTarget(selector: string | undefined): Rect | null {
  if (!selector) return null;
  const el = document.querySelector(`[data-tour="${selector}"]`);
  if (!(el instanceof HTMLElement)) return null;
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  const r = el.getBoundingClientRect();
  if (r.width < 2 && r.height < 2) return null;
  const pad = 8;
  return {
    top: Math.max(0, r.top - pad),
    left: Math.max(0, r.left - pad),
    width: Math.min(window.innerWidth - 8, r.width + pad * 2),
    height: Math.min(window.innerHeight - 8, r.height + pad * 2),
  };
}

function cardStyle(rect: Rect | null, placement: TourStep["placement"]): CSSProperties {
  const cardW = Math.min(420, window.innerWidth - 32);
  if (!rect || placement === "center") {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: cardW,
    };
  }
  const spaceBelow = window.innerHeight - (rect.top + rect.height);
  const preferBottom = placement === "bottom" || (placement !== "top" && spaceBelow > 220);
  if (preferBottom) {
    return {
      position: "fixed",
      top: Math.min(rect.top + rect.height + 14, window.innerHeight - 280),
      left: Math.min(Math.max(16, rect.left), window.innerWidth - cardW - 16),
      width: cardW,
    };
  }
  return {
    position: "fixed",
    bottom: Math.min(window.innerHeight - rect.top + 14, window.innerHeight - 24),
    left: Math.min(Math.max(16, rect.left), window.innerWidth - cardW - 16),
    width: cardW,
  };
}

export function PanelTour({
  active,
  tab,
  onTab,
  onOpenTrial,
  onClosePopups,
  onFinish,
}: {
  active: boolean;
  tab: Tab;
  onTab: (tab: Tab) => void;
  onOpenTrial: () => void;
  onClosePopups: () => void;
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = PANEL_TOUR_STEPS[index] ?? PANEL_TOUR_STEPS[0]!;
  const total = PANEL_TOUR_STEPS.length;

  useEffect(() => {
    if (active) setIndex(0);
  }, [active]);

  const refresh = useCallback(() => {
    setRect(measureTarget(step.target));
  }, [step.target]);

  // Apply side effects for the current step (tab / popups).
  useEffect(() => {
    if (!active) return;
    if (step.closePopups) onClosePopups();
    if (step.tab && step.tab !== tab) onTab(step.tab);
    if (step.openTrial) {
      // Defer so tab switch paints first.
      const t = window.setTimeout(() => onOpenTrial(), 40);
      return () => window.clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, step.id]);

  useLayoutEffect(() => {
    if (!active) return;
    const t = window.setTimeout(refresh, 80);
    return () => window.clearTimeout(t);
  }, [active, index, tab, step.target, refresh]);

  useEffect(() => {
    if (!active) return;
    const onResize = () => refresh();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, refresh]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFinish();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        goNext();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  if (!active) return null;

  function goNext() {
    if (index >= total - 1) {
      try {
        localStorage.setItem(TOUR_STORAGE_KEY, "done");
      } catch {
        /* ignore */
      }
      onFinish();
      return;
    }
    setIndex((i) => i + 1);
  }

  function goPrev() {
    setIndex((i) => Math.max(0, i - 1));
  }

  function skip() {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "done");
    } catch {
      /* ignore */
    }
    onFinish();
  }

  const hole = rect;
  const style = cardStyle(rect, step.placement ?? "auto");

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-dim" aria-hidden="true">
        {hole ? (
          <div
            className="tour-hole"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
          />
        ) : null}
      </div>

      <div className="tour-card" style={style}>
        <div className="tour-card-top">
          <span className="tour-step">
            {index + 1} / {total}
          </span>
          <button type="button" className="btn tour-skip" onClick={skip}>
            Закрыть
          </button>
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <div className="tour-body">
          {step.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="tour-actions">
          <button type="button" className="btn" disabled={index === 0} onClick={goPrev}>
            Назад
          </button>
          <button type="button" className="btn primary" onClick={goNext}>
            {index >= total - 1 ? "Готово" : "Далее"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function shouldAutoStartTour(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) !== "done";
  } catch {
    return true;
  }
}
