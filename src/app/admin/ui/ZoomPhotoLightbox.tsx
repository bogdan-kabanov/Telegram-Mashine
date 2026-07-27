"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/** Logical phone size × @3x DPR from chat-renderer. */
const DEFAULT_IMG_W = 1170;
const DEFAULT_IMG_H = 2532;

/**
 * Full-res PNG viewer with wheel zoom + LMB pan.
 */
export function ZoomPhotoLightbox({
  src,
  title = "Превью",
  onClose,
}: {
  src: string;
  title?: string;
  onClose: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState({ w: DEFAULT_IMG_W, h: DEFAULT_IMG_H });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const fitToStage = useCallback((w: number, h: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = Math.min(1, (stage.clientHeight - 32) / h, (stage.clientWidth - 32) / w);
    setScale(Math.max(0.15, fit));
    setPos({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        fitToStage(imgSize.w, imgSize.h);
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, fitToStage, imgSize.w, imgSize.h]);

  useEffect(() => {
    setPos({ x: 0, y: 0 });
    const id = requestAnimationFrame(() => fitToStage(imgSize.w, imgSize.h));
    return () => cancelAnimationFrame(id);
  }, [src, imgSize.w, imgSize.h, fitToStage]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;
      setScale((prev) => {
        const next = Math.min(8, Math.max(0.12, prev * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        const ratio = next / prev;
        setPos((p) => ({
          x: mx - (mx - p.x) * ratio,
          y: my - (my - p.y) * ratio,
        }));
        return next;
      });
    };
    stage.addEventListener("wheel", onWheelNative, { passive: false });
    return () => stage.removeEventListener("wheel", onWheelNative);
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: pos.x,
        originY: pos.y,
      };
    },
    [pos.x, pos.y],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setPos({
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    });
  }, []);

  const endDrag = useCallback((e: ReactPointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }, []);

  return (
    <div className="zoom-photo-lightbox" role="dialog" aria-modal="true" aria-label={title}>
      <div className="zoom-photo-lightbox-toolbar">
        <strong>{title}</strong>
        <span className="zoom-photo-lightbox-hint">
          Колёсико — зум · ЛКМ — двигать · {Math.round(scale * 100)}% · {imgSize.w}×{imgSize.h}
        </span>
        <div className="zoom-photo-lightbox-actions">
          <button type="button" className="zoom-photo-btn" onClick={() => setScale((s) => Math.min(8, s * 1.2))}>
            +
          </button>
          <button type="button" className="zoom-photo-btn" onClick={() => setScale((s) => Math.max(0.12, s / 1.2))}>
            −
          </button>
          <button type="button" className="zoom-photo-btn" onClick={() => fitToStage(imgSize.w, imgSize.h)}>
            Сброс
          </button>
          <a href={src} target="_blank" rel="noreferrer" className="zoom-photo-btn">
            Вкладка
          </a>
          <a href={src} download className="zoom-photo-btn">
            Скачать
          </a>
          <button type="button" className="zoom-photo-btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
      <div
        ref={stageRef}
        className="zoom-photo-lightbox-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          src={src}
          alt={title}
          className="zoom-photo-lightbox-img"
          draggable={false}
          style={{
            width: imgSize.w,
            marginLeft: -imgSize.w / 2,
            marginTop: -imgSize.h / 2,
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          }}
          onLoad={(e) => {
            const w = e.currentTarget.naturalWidth || DEFAULT_IMG_W;
            const h = e.currentTarget.naturalHeight || DEFAULT_IMG_H;
            setImgSize({ w, h });
            fitToStage(w, h);
          }}
        />
      </div>
    </div>
  );
}
