"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export interface TourStep {
  id: string;
  /** CSS selector via data-tour="..." */
  target: string;
  title: string;
  body: string;
  /** Page where the target lives */
  href: string;
  placement?: "auto" | "bottom" | "top" | "left" | "right";
}

/** Each step points at a real UI block and explains what it does. */
export const TOUR_STEPS: TourStep[] = [
  {
    id: "nav",
    target: "tour-nav",
    href: "/admin",
    title: "Меню разделов",
    body: "Это главное меню. Каждый пункт — отдельный раздел панели. Сейчас покажем, за что отвечает каждый блок.",
    placement: "bottom",
  },
  {
    id: "nav-home",
    target: "tour-nav-home",
    href: "/admin",
    title: "Главная",
    body: "Статус бота и кнопки Запустить / Пауза / Стоп. Сюда возвращайтесь, чтобы включить или выключить публикации.",
    placement: "bottom",
  },
  {
    id: "nav-constructor",
    target: "tour-nav-constructor",
    href: "/admin",
    title: "Конструктор",
    body: "Главный раздел: всё по шагам ТЗ в одной вкладке — проект, фон, условия, тексты, медиа, пробный отзыв и запуск.",
    placement: "bottom",
  },
  {
    id: "nav-media",
    target: "tour-nav-media",
    href: "/admin",
    title: "Медиатека",
    body: "Полная библиотека файлов. Для обычной настройки удобнее Конструктор; сюда — если нужно много файлов сразу.",
    placement: "bottom",
  },
  {
    id: "nav-projects",
    target: "tour-nav-projects",
    href: "/admin",
    title: "Проекты",
    body: "Список проектов и быстрый пробный отзыв. Полная настройка — в Конструкторе.",
    placement: "bottom",
  },
  {
    id: "nav-stories",
    target: "tour-nav-stories",
    href: "/admin",
    title: "Истории",
    body: "Истории клиентов (легенды): почему человек пишет, в чём сомневается, как благодарит. Бот подставляет их в диалог.",
    placement: "bottom",
  },
  {
    id: "nav-schedule",
    target: "tour-nav-schedule",
    href: "/admin",
    title: "Расписание",
    body: "Когда бот публикует и какая сейчас неделя трёхнедельного цикла. Обычно только смотрят, не правят.",
    placement: "bottom",
  },
  {
    id: "stats",
    target: "tour-home-stats",
    href: "/admin",
    title: "Карточки статуса",
    body: "Здесь видно: работает ли система, сколько отзывов уже готово и ушло в канал, какая неделя цикла.",
    placement: "bottom",
  },
  {
    id: "controls",
    target: "tour-home-controls",
    href: "/admin",
    title: "Блок управления",
    body: "«Запустить» — бот сам публикует по расписанию. «Пауза» — временно стоп. «Стоп» — полностью выключить.",
    placement: "bottom",
  },
  {
    id: "checklist",
    target: "tour-home-checklist",
    href: "/admin",
    title: "Быстрый старт",
    body: "Чеклист: откройте Конструктор и пройдите шаги ТЗ, затем Запустить. Нажимайте пункты, чтобы перейти.",
    placement: "top",
  },
  {
    id: "constructor",
    target: "tour-constructor",
    href: "/admin/constructor",
    title: "Шаги конструктора",
    body: "Идите слева направо: проект → профиль → фон/тема → условия → тексты → медиа → пробный отзыв → запуск.",
    placement: "bottom",
  },
  {
    id: "media-upload",
    target: "tour-media-upload",
    href: "/admin/media",
    title: "Форма загрузки",
    body: "Выберите тип файла (кружок, ставка, фото…), при необходимости проект или историю, затем файл с компьютера — и «Загрузить».",
    placement: "bottom",
  },
  {
    id: "media-library",
    target: "tour-media-library",
    href: "/admin/media",
    title: "Уже загружено",
    body: "Все ваши файлы. Фильтруйте по типу, открывайте превью, удаляйте лишнее. Сначала загрузите кружки и ставки.",
    placement: "top",
  },
  {
    id: "projects-guide",
    target: "tour-projects-guide",
    href: "/admin/projects",
    title: "Как работать с проектами",
    body: "Краткая шпаргалка. Ниже — карточки проектов: у каждой кнопка «Сделать пробный отзыв» (в канал не отправит).",
    placement: "bottom",
  },
  {
    id: "stories-guide",
    target: "tour-stories-guide",
    href: "/admin/settings",
    title: "Зачем истории",
    body: "Разные тексты клиентов, чтобы отзывы не звучали одинаково. Слева список историй, справа — поля и фото.",
    placement: "bottom",
  },
  {
    id: "schedule-slots",
    target: "tour-schedule-slots",
    href: "/admin/schedule",
    title: "Таблица слотов",
    body: "Каждая строка — время публикации, тип отзыва и проект. Бот сработает сам, если на Главной нажато «Запустить».",
    placement: "top",
  },
  {
    id: "help-tips",
    target: "tour-tour-button",
    href: "/admin",
    title: "Кнопка «Обучение»",
    body: "Обучение не включается само — только этой кнопкой в боковом меню. Знаки «?» у полей тоже дают короткие подсказки при наведении.",
    placement: "left",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

type TourApi = {
  open: boolean;
  step: number;
  steps: TourStep[];
  start: () => void;
  finish: () => void;
  next: () => void;
  prev: () => void;
  setStep: (n: number) => void;
};

const TourContext = createContext<TourApi | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const start = useCallback(() => {
    setStep(0);
    setOpen(true);
  }, []);

  const finish = useCallback(() => {
    setOpen(false);
    setStep(0);
  }, []);

  const next = useCallback(() => {
    setStep((s) => {
      if (s >= TOUR_STEPS.length - 1) {
        setOpen(false);
        return 0;
      }
      return s + 1;
    });
  }, []);

  const prev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  const api = useMemo(
    () => ({ open, step, steps: TOUR_STEPS, start, finish, next, prev, setStep }),
    [open, step, start, finish, next, prev],
  );

  return <TourContext.Provider value={api}>{children}</TourContext.Provider>;
}

export function useOnboardingContext(): TourApi {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useOnboardingContext must be used within OnboardingProvider");
  return ctx;
}

function useTargetRect(target: string | undefined, open: boolean, pathname: string) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);

  const measure = useCallback(() => {
    if (!open || !target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${target}"]`) as HTMLElement | null;
    if (!el) {
      setRect(null);
      setMissing(true);
      return;
    }
    setMissing(false);
    el.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
    const r = el.getBoundingClientRect();
    const pad = 8;
    setRect({
      top: r.top - pad,
      left: r.left - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
    });
  }, [open, target]);

  useLayoutEffect(() => {
    measure();
    const t = window.setTimeout(measure, 320);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure, pathname]);

  return { rect, missing, remeasure: measure };
}

function tooltipStyle(rect: Rect | null, placement: TourStep["placement"]): CSSProperties {
  const gap = 14;
  const tipW = Math.min(340, typeof window !== "undefined" ? window.innerWidth - 24 : 340);

  if (!rect) {
    return {
      position: "fixed",
      left: "50%",
      bottom: 24,
      transform: "translateX(-50%)",
      width: tipW,
    };
  }

  const place =
    placement === "auto"
      ? rect.top > 220
        ? "top"
        : "bottom"
      : placement ?? "bottom";

  if (place === "top") {
    return {
      position: "fixed",
      left: Math.min(Math.max(12, rect.left), (typeof window !== "undefined" ? window.innerWidth : 800) - tipW - 12),
      top: Math.max(12, rect.top - gap),
      transform: "translateY(-100%)",
      width: tipW,
    };
  }
  if (place === "left") {
    return {
      position: "fixed",
      left: Math.max(12, rect.left - gap),
      top: Math.max(12, rect.top),
      transform: "translateX(-100%)",
      width: tipW,
    };
  }
  if (place === "right") {
    return {
      position: "fixed",
      left: rect.left + rect.width + gap,
      top: Math.max(12, rect.top),
      width: tipW,
    };
  }
  // bottom
  return {
    position: "fixed",
    left: Math.min(Math.max(12, rect.left), (typeof window !== "undefined" ? window.innerWidth : 800) - tipW - 12),
    top: rect.top + rect.height + gap,
    width: tipW,
  };
}

export function OnboardingHost() {
  const router = useRouter();
  const pathname = usePathname();
  const { open, step, steps, finish, next, prev } = useOnboardingContext();
  const current = steps[step];
  const { rect, missing } = useTargetRect(current?.target, open, pathname);

  useEffect(() => {
    if (!open || !current) return;
    if (pathname !== current.href) {
      router.push(current.href);
    }
  }, [open, current, pathname, router]);

  if (!open || !current) return null;

  const isLast = step >= steps.length - 1;
  const tipPos = tooltipStyle(rect, current.placement);
  const onRightPage = pathname === current.href;

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-dim" onClick={finish} />
      {rect && onRightPage && !missing && (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}

      <div className="tour-card" style={tipPos}>
        <div className="tour-card-kicker">
          Обучение · шаг {step + 1} из {steps.length}
        </div>
        <h2 id="tour-title" className="tour-card-title">
          {current.title}
        </h2>
        <p className="tour-card-body">{current.body}</p>
        {!onRightPage && (
          <p className="tour-card-wait">Переходим на нужную страницу…</p>
        )}
        {onRightPage && missing && (
          <p className="tour-card-wait">Блок ещё загружается — нажмите «Далее», если подсветка не появилась.</p>
        )}
        <div className="tour-card-actions">
          <button type="button" className="admin-btn-ghost" onClick={finish}>
            Закрыть
          </button>
          <div className="onboard-actions-right">
            {step > 0 && (
              <button type="button" className="admin-btn-secondary" onClick={prev}>
                Назад
              </button>
            )}
            <button type="button" className="admin-btn" onClick={next}>
              {isLast ? "Готово" : "Далее"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RestartTourButton() {
  const { start, open } = useOnboardingContext();
  return (
    <button
      type="button"
      className="admin-btn-secondary"
      data-tour="tour-tour-button"
      onClick={start}
      disabled={open}
    >
      Обучение
    </button>
  );
}

export function HelpNavLink() {
  return (
    <Link href="/admin/help" className="admin-btn-ghost">
      Справка
    </Link>
  );
}

/** @deprecated use TOUR_STEPS */
export const ONBOARDING_STEPS = TOUR_STEPS.map((s) => ({
  id: s.id,
  title: s.title,
  body: s.body,
  href: s.href,
}));
