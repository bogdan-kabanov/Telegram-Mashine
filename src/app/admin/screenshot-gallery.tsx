"use client";

import { useState } from "react";

import { colors, radius, styles } from "./styles";

function normalizeUrl(path: string): string {
  if (path.startsWith("http") || path.startsWith("/")) return path;
  return `/${path}`;
}

export function ScreenshotGallery({
  screenshots,
  reviewId,
}: {
  screenshots: string[];
  reviewId?: string;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);

  if (screenshots.length === 0) return null;

  return (
    <div>
      <div style={{ fontSize: "0.8rem", color: colors.muted, marginBottom: "0.5rem" }}>
        {screenshots.length} шт.{reviewId ? ` · ${reviewId.slice(0, 8)}` : ""}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
        {screenshots.map((raw, idx) => {
          const url = normalizeUrl(raw);
          return (
            <button
              key={`${url}-${idx}`}
              type="button"
              onClick={() => setLightbox(idx)}
              style={{
                flex: "0 0 auto",
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                padding: 0,
                background: colors.card,
                cursor: "pointer",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <img
                src={url}
                alt={`${idx + 1}`}
                style={{
                  display: "block",
                  width: 120,
                  height: 216,
                  objectFit: "cover",
                  objectPosition: "top",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  bottom: 4,
                  right: 4,
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  fontSize: "0.65rem",
                  padding: "1px 5px",
                  borderRadius: radius.sm,
                }}
              >
                {idx + 1}
              </span>
            </button>
          );
        })}
      </div>

      {lightbox !== null && (
        <div
          role="presentation"
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div style={{ position: "relative", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
            <img
              src={normalizeUrl(screenshots[lightbox]!)}
              alt=""
              style={{ maxHeight: "85vh", borderRadius: radius.md }}
            />
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "0.5rem" }}>
              <button type="button" disabled={lightbox <= 0} onClick={() => setLightbox((i) => Math.max(0, (i ?? 0) - 1))} style={navBtnStyle}>
                Назад
              </button>
              <span style={{ color: "#fff", alignSelf: "center", fontSize: "0.875rem" }}>
                {lightbox + 1} / {screenshots.length}
              </span>
              <button
                type="button"
                disabled={lightbox >= screenshots.length - 1}
                onClick={() => setLightbox((i) => Math.min(screenshots.length - 1, (i ?? 0) + 1))}
                style={navBtnStyle}
              >
                Далее
              </button>
              <button type="button" onClick={() => setLightbox(null)} style={navBtnStyle}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  ...styles.buttonSecondary,
  background: colors.card,
};
