import { useEffect } from "react";

export function Lightbox({
  urls,
  index,
  onClose,
  onIndex,
}: {
  urls: string[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const src = urls[index];
  const total = urls.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % total);
      if (e.key === "ArrowLeft") onIndex((index - 1 + total) % total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, total, onClose, onIndex]);

  if (!src) return null;

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="muted">
          {index + 1} / {total}
        </span>
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() => onIndex((index - 1 + total) % total)}
            disabled={total < 2}
          >
            ←
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onIndex((index + 1) % total)}
            disabled={total < 2}
          >
            →
          </button>
          <a className="btn" href={src} target="_blank" rel="noreferrer">
            Открыть
          </a>
          <button type="button" className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
      <img
        className="lightbox-img"
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
