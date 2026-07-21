import type { CSSProperties } from "react";

export const colors = {
  bg: "#f4f4f5",
  card: "#ffffff",
  border: "#e4e4e7",
  text: "#18181b",
  muted: "#71717a",
  accent: "#2563eb",
  success: "#16a34a",
  warning: "#ca8a04",
  danger: "#dc2626",
};

export const radius = {
  sm: 2,
  md: 3,
  lg: 4,
};

export const styles: Record<string, CSSProperties> = {
  page: {
    fontFamily: "system-ui, -apple-system, sans-serif",
    margin: 0,
    background: colors.bg,
    color: colors.text,
    minHeight: "100vh",
  },
  container: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "1.25rem 1.5rem",
  },
  nav: {
    display: "flex",
    gap: "0.25rem",
    flexWrap: "wrap",
    marginBottom: "1.25rem",
    padding: "0.25rem",
    background: colors.card,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
  },
  navLink: {
    color: colors.muted,
    textDecoration: "none",
    padding: "0.45rem 0.85rem",
    borderRadius: radius.sm,
    fontSize: "0.875rem",
  },
  navLinkActive: {
    color: colors.text,
    background: colors.bg,
    fontWeight: 500,
  },
  card: {
    background: colors.card,
    padding: "1rem 1.15rem",
    borderRadius: radius.md,
    marginBottom: "0.75rem",
    border: `1px solid ${colors.border}`,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "0.75rem",
    marginBottom: "1rem",
  },
  button: {
    background: colors.accent,
    color: "#fff",
    border: "none",
    padding: "0.5rem 1rem",
    borderRadius: radius.sm,
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: 500,
  },
  buttonSecondary: {
    background: colors.card,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: "0.5rem 1rem",
    borderRadius: radius.sm,
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.875rem",
  },
  th: {
    textAlign: "left",
    padding: "0.5rem 0.6rem",
    borderBottom: `1px solid ${colors.border}`,
    color: colors.muted,
    fontWeight: 500,
    fontSize: "0.8rem",
  },
  td: {
    padding: "0.5rem 0.6rem",
    borderBottom: `1px solid ${colors.border}`,
  },
  sectionTitle: {
    margin: "0 0 0.75rem",
    fontSize: "0.875rem",
    fontWeight: 600,
    color: colors.text,
  },
};

export function inputStyle(): CSSProperties {
  return {
    width: "100%",
    padding: "0.45rem 0.6rem",
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    background: colors.card,
    color: colors.text,
    fontSize: "0.875rem",
    boxSizing: "border-box",
  };
}
