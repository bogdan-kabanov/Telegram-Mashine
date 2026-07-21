/** Canonical media folders used by upload + picker. */
export const MEDIA_TYPE_DIRS = {
  video_note: "media/video_notes",
  bet: "media/bets",
  conditions: "media/conditions",
  wallpaper: "media/wallpapers",
  sticker: "media/stickers",
  story_photo: "media/story_photos",
  avatar: "media/avatars",
  voice: "media/voices",
} as const;

export type UploadMediaType =
  | "video_note"
  | "bet"
  | "wallpaper"
  | "conditions"
  | "avatar"
  | "sticker"
  | "story_photo";

export const UPLOAD_MEDIA_TYPES: UploadMediaType[] = [
  "story_photo",
  "sticker",
  "bet",
  "conditions",
  "video_note",
  "wallpaper",
  "avatar",
];

export const MEDIA_TYPE_LABELS: Record<string, string> = {
  story_photo: "Фото в диалоге (легенда)",
  sticker: "Стикер",
  bet: "Ставка / скрин ставки",
  conditions: "Условия",
  video_note: "Кружок",
  wallpaper: "Обои чата",
  avatar: "Аватар клиента",
  captura: "Captura (генерация)",
  receipt: "Чек (генерация)",
};

export const MEDIA_TYPE_HINTS: Record<string, string> = {
  story_photo:
    "Фото клиента в переписке. Привязывается к легенде — бот случайно берёт одно из фото этой легенды.",
  sticker: "Стикер в начале диалога. Общий пул для всех проектов.",
  bet: "Скриншоты ставок. Подставляются в этапы bet_1 / bet_2 / bet_3.",
  conditions: "Картинка с условиями. Показывается в диалоге на этапе условий.",
  video_note: "Видео-кружок для публикации во второй фазе.",
  wallpaper: "Фон чата. Один файл на проект (перезаписывает предыдущий).",
  avatar: "Аватар клиента в шапке чата. Можно привязать к проекту.",
};
