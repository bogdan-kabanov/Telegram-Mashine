"use client";

import { Fragment, type ReactNode } from "react";

import { appleEmojiUrl, splitAppleEmojiParts } from "@/lib/emoji/apple";

/** Render chat text with Apple-style emoji images (not Windows Segoe). */
export function AppleEmojiText({ text }: { text: string }): ReactNode {
  const parts = splitAppleEmojiParts(text);
  if (parts.length === 1 && parts[0]?.type === "text") {
    return text;
  }

  return parts.map((part, i) => {
    if (part.type === "text") {
      return <Fragment key={i}>{part.value}</Fragment>;
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={i}
        className="apple-emoji"
        src={appleEmojiUrl(part.value)}
        alt={part.value}
        draggable={false}
      />
    );
  });
}
