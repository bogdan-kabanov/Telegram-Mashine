"use client";

import { useEffect, useId, useRef, useState } from "react";

interface HelpTipProps {
  text: string;
  /** Prefer opening below on crowded headers */
  placement?: "above" | "below";
}

export function HelpTip({ text, placement = "above" }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <span
      ref={ref}
      className={`help-tip${open ? " is-open" : ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="help-tip-btn"
        aria-label="Подсказка"
        aria-describedby={id}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ?
      </button>
      <span
        id={id}
        role="tooltip"
        className={`help-tip-panel${placement === "below" ? " is-below" : ""}`}
      >
        {text}
      </span>
    </span>
  );
}

export function LabelWithHelp({
  label,
  tip,
  placement,
}: {
  label: string;
  tip: string;
  placement?: "above" | "below";
}) {
  return (
    <span className="admin-field-label">
      {label}
      <HelpTip text={tip} {...(placement ? { placement } : {})} />
    </span>
  );
}
