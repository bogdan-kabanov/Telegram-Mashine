import type { ReactNode } from "react";

export function RowPopup({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p className="sub drawer-sub">{subtitle}</p> : null}
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Закрыть
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
