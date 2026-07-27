"use client";

import type { ReactNode } from "react";

interface HelpTipProps {
  text: string;
  /** Prefer opening below on crowded headers */
  placement?: "above" | "below";
}

/** Help tooltips disabled project-wide. */
export function HelpTip(_props: HelpTipProps): null {
  return null;
}

export function LabelWithHelp({
  label,
}: {
  label: string;
  tip: string;
  placement?: "above" | "below";
}): ReactNode {
  return <span className="admin-field-label">{label}</span>;
}
