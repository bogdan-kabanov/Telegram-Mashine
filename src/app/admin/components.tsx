"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { colors, styles } from "./styles";

const LINKS = [
  { href: "/admin", label: "Обзор" },
  { href: "/admin/projects", label: "Проекты" },
  { href: "/admin/media", label: "Медиа" },
  { href: "/admin/settings", label: "Легенды" },
  { href: "/admin/schedule", label: "Расписание" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav style={styles.nav}>
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            style={{
              ...styles.navLink,
              ...(active ? styles.navLinkActive : {}),
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={{ marginBottom: "0.75rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>{title}</h1>
        </header>
        <AdminNav />
        {children}
      </div>
    </div>
  );
}

export function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={styles.card}>
      <div style={{ color: colors.muted, fontSize: "0.75rem", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ fontSize: "1.125rem", fontWeight: 600, color: color ?? colors.text, textTransform: "capitalize" }}>
        {value}
      </div>
    </div>
  );
}
