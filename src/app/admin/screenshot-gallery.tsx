"use client";

import { useState } from "react";

import { colors, radius } from "./styles";
import { ZoomPhotoLightbox } from "./ui/ZoomPhotoLightbox";

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

  const activeUrl = lightbox !== null ? normalizeUrl(screenshots[lightbox]!) : null;

  return (
    <div>
      <div style={{ fontSize: "0.8rem", color: colors.muted, marginBottom: "0.5rem" }}>
        {screenshots.length} шт.{reviewId ? ` · ${reviewId.slice(0, 8)}` : ""} · клик — фото с зумом
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
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

      {activeUrl ? (
        <ZoomPhotoLightbox
          src={activeUrl}
          title={`Скрин ${lightbox! + 1} / ${screenshots.length}`}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}
