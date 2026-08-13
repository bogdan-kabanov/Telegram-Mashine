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
  story_photo: "Фото клиента (уникальные)",
  sticker: "Стикер",
  bet: "Ставка / скрин ставки",
  conditions: "Условия (картинка / GIF)",
  video_note: "Кружок",
  wallpaper: "Обои чата",
  avatar: "Аватар клиента",
  captura: "Captura (генерация)",
  receipt: "Чек (генерация)",
};

export const MEDIA_TYPE_HINTS: Record<string, string> = {
  story_photo:
    "Фото-доказательство истории (часто больной в больнице). Общий пул: каждое фото — один раз. ИИ генерирует больничные кадры по легенде.",
  sticker: "Стикер в начале диалога. Общий пул.",
  bet: "Скриншоты ставок для выбранного проекта. Не смешиваются с другими менеджерами.",
  conditions: "Картинка или GIF условий для выбранного проекта.",
  video_note:
    "Кружок для проекта. Выберите ту же историю, что здесь в «Истории» — SMS, фото и видео будут про одно (кредит / болезнь…). Standalone — только недельные общие «спасибо».",
  wallpaper: "Фон чата. Задаётся в Проекты → Настройки (не в медиатеке): «Выбрать из медиатеки» один раз на проект.",
  avatar: "Аватар в шапке чата для выбранного проекта.",
};
