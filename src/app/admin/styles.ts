import type { CSSProperties } from "react";

export const colors = {
  bg: "#e6ebee",
  card: "#ffffff",
  border: "#dfe3e6",
  text: "#0f1419",
  muted: "#707579",
  accent: "#2aabee",
  success: "#4dcd5e",
  warning: "#faa21a",
  danger: "#e53935",
};

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
};

export const styles: Record<string, CSSProperties> = {
  page: {
    fontFamily: "var(--font)",
    margin: 0,
    background: "transparent",
    color: "var(--ink)",
    minHeight: "100vh",
  },
  container: {
    maxWidth: "none",
    margin: 0,
    padding: 0,
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  navLink: {
    color: "inherit",
    textDecoration: "none",
    padding: "0.65rem 0.7rem",
    fontSize: "0.875rem",
  },
  navLinkActive: {
    fontWeight: 650,
  },
  card: {
    background: "var(--panel)",
    padding: "1rem 1.05rem",
    borderRadius: 10,
    marginBottom: "0.85rem",
    border: "1px solid var(--line)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "0.65rem",
    marginBottom: "0.85rem",
  },
  button: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    padding: "0.55rem 1rem",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: "0.84rem",
    fontWeight: 650,
    fontFamily: "inherit",
  },
  buttonSecondary: {
    background: "#fff",
    color: "var(--accent-strong, #229ed9)",
    border: "1px solid var(--line)",
    padding: "0.55rem 1rem",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: "0.84rem",
    fontWeight: 650,
    fontFamily: "inherit",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.86rem",
  },
  th: {
    textAlign: "left",
    padding: "0.5rem 0.4rem",
    borderBottom: "1px solid var(--line)",
    color: "var(--mute)",
    fontWeight: 700,
    fontSize: "0.72rem",
  },
  td: {
    padding: "0.55rem 0.4rem",
    borderBottom: "1px solid var(--line)",
  },
  sectionTitle: {
    margin: "0 0 0.3rem",
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "var(--ink)",
  },
};

export function inputStyle(): CSSProperties {
  return {
    width: "100%",
    padding: "0.5rem 0.65rem",
    borderRadius: 10,
    border: "1px solid var(--line)",
    background: "#fff",
    color: "var(--ink)",
    fontSize: "0.875rem",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };
}
