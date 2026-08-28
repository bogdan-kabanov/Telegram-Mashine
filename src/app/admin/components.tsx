"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { HelpTip } from "./ui/HelpTip";
import { HelpNavLink, RestartTourButton } from "./ui/Onboarding";

export { colors } from "./styles";

const LINKS = [
  { href: "/admin", label: "Главная", tour: "tour-nav-home" },
  { href: "/admin/constructor", label: "Конструктор", tour: "tour-nav-constructor" },
  { href: "/admin/media", label: "Медиатека", tour: "tour-nav-media" },
  { href: "/admin/projects", label: "Проекты", tour: "tour-nav-projects" },
  { href: "/admin/settings", label: "Истории", tour: "tour-nav-stories" },
  { href: "/admin/ai", label: "Настройки", tour: "tour-nav-ai" },
  { href: "/admin/schedule", label: "Расписание", tour: "tour-nav-schedule" },
  { href: "/admin/help", label: "Справка", tour: "tour-nav-help" },
];

function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Разделы панели" data-tour="tour-nav">
      {LINKS.map((link) => {
        const isActive =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`admin-nav-link${isActive ? " is-active" : ""}`}
            data-tour={link.tour}
          >
            <strong>{link.label}</strong>
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  title,
  description,
  children,
  wide,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="admin-root">
      <aside className="admin-side">
        <div className="admin-side-brand">
          <div className="admin-side-brand-mark">BOT AI</div>
        </div>
        <AdminNav />
        <div className="admin-side-foot">
          <RestartTourButton />
          <HelpNavLink />
        </div>
      </aside>

      <div className="admin-main">
        <div className={`admin-main-inner${wide ? " is-wide" : ""}`}>
          <header className="admin-topbar">
            <div>
              <div className="admin-brand-kicker">Раздел</div>
              <h1 className="admin-brand-title">{title}</h1>
              {description ? <p className="admin-brand-sub">{description}</p> : null}
            </div>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  color,
  tip,
}: {
  label: string;
  value: string;
  color?: string;
  tip?: string;
}) {
  return (
    <div className="admin-stat">
      <div className="admin-stat-label">
        {label}
        {tip ? <HelpTip text={tip} placement="below" /> : null}
      </div>
      <div className="admin-stat-value" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

export function PageIntro({
  title,
  tip,
  children,
}: {
  title: string;
  tip?: string;
  children: ReactNode;
}) {
  return (
    <div className="page-intro">
      <h1>
        {title}
        {tip ? <HelpTip text={tip} placement="below" /> : null}
      </h1>
      <p>{children}</p>
    </div>
  );
}

export function SectionCard({
  title,
  tip,
  description,
  children,
  tourId,
}: {
  title: string;
  tip?: string;
  description?: string;
  children: ReactNode;
  tourId?: string;
}) {
  return (
    <section className="admin-card" {...(tourId ? { "data-tour": tourId } : {})}>
      <h2 className="admin-card-title">
        {title}
        {tip ? <HelpTip text={tip} placement="below" /> : null}
      </h2>
      {description ? <p className="admin-card-desc">{description}</p> : null}
      {children}
    </section>
  );
}
