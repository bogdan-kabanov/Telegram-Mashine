"use client";

import Link from "next/link";

import { AdminShell, SectionCard } from "../components";
import { HelpTip } from "../ui/HelpTip";
import { RestartTourButton, TOUR_STEPS } from "../ui/Onboarding";

export default function HelpPage() {
  return (
    <AdminShell
      title="Справка"
      description="Словарь и FAQ. Интерактивное обучение (с подсветкой блоков) — кнопка «Обучение» в левом меню."
    >
      <SectionCard
        title="Как пройти обучение"
        tip="Обучение не открывается само — только по кнопке в меню."
        description="Нажмите «Обучение» слева: панель по очереди подсветит меню и блоки и объяснит, за что каждый отвечает."
      >
        <RestartTourButton />
      </SectionCard>

      <SectionCard
        title="Что делает эта программа"
        tip="Одно предложение: автоматические «отзывы» в Telegram."
        description="Система имитирует переписку клиента и менеджера, делает скриншоты чата, генерирует чеки и публикует материалы в канал по расписанию."
      >
        <div className="admin-steps">
          {TOUR_STEPS.filter((s) => s.target.startsWith("tour-nav-") && s.id !== "nav").map((step, index) => (
            <div className="admin-step" key={step.id}>
              <div className="admin-step-num">{index + 1}</div>
              <div>
                <h3>
                  {step.title} <HelpTip text={step.body} />
                </h3>
                <p>{step.body}</p>
                <p style={{ marginTop: "0.35rem" }}>
                  <Link href={step.href} className="admin-btn-ghost" style={{ paddingLeft: 0 }}>
                    Перейти →
                  </Link>
                </p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Словарь простых терминов" tip="Короткие объяснения слов из панели.">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Слово</th>
              <th>Что это значит</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Проект</td>
              <td>Менеджер / актриса (Nancy, Maya…). У каждого свой стиль чата.</td>
            </tr>
            <tr>
              <td>Легенда / история</td>
              <td>Предыстория клиента: проблема, сомнения, благодарность.</td>
            </tr>
            <tr>
              <td>Кружок</td>
              <td>Круглое видео в Telegram (video note).</td>
            </tr>
            <tr>
              <td>Двухчастная публикация</td>
              <td>Сначала тизер (4 скрина), через ~1.5 часа — полный отзыв. Только Nancy.</td>
            </tr>
            <tr>
              <td>Слот</td>
              <td>Время в расписании, когда бот готовит и публикует отзыв.</td>
            </tr>
            <tr>
              <td>Пробный отзыв</td>
              <td>Генерация скриншотов только в панели, без отправки в канал.</td>
            </tr>
            <tr>
              <td>Вкладка «Диалог»</td>
              <td>Просмотр переписки, перевод на русский для себя, правка текста, перерисовка скринов и публикация.</td>
            </tr>
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Частые вопросы" tip="Если что-то непонятно — начните отсюда.">
        <div className="admin-steps">
          <div className="admin-step">
            <div className="admin-step-num">?</div>
            <div>
              <h3>Почему отзывы «пустые»?</h3>
              <p>Скорее всего не загружены кружки, ставки или фото. Откройте Медиатеку и добавьте файлы.</p>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">?</div>
            <div>
              <h3>Как понять, о чём диалог на испанском?</h3>
              <p>
                Проекты → пробный отзыв → вкладка «Диалог» → «Перевести на RU». Перевод только для
                оператора, на скриншоты не попадает. После правок текста — «Перерисовать скрины».
              </p>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">?</div>
            <div>
              <h3>Почему на чеке старые имена и сумма?</h3>
              <p>
                Чек и ставка — ваши готовые скрины. Программа закрашивает старые поля и печатает новые
                (сумма, имена, дата, 4 цифры на чеке; депозит и прибыль на ставке) на том же кадре, без ИИ. В конструкторе выберите пак
                сумм или укажите сумму при клике по чеку/ставке. Если поля чека не нашлись — придёт HTML-заглушка
                или исходный шаблон.
              </p>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">?</div>
            <div>
              <h3>Почему ИИ не пишет имена на фото клиента?</h3>
              <p>
                Фото в чате — кадр из жизни (больница и т.п.), без надписей. Имена и суммы меняются
                только на чеках и на готовых скринах ставок — без перерисовки кадра.
              </p>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">?</div>
            <div>
              <h3>Бот ничего не публикует</h3>
              <p>Проверьте на Главной: статус должен быть «Работает». Если «Остановлен» — нажмите «Запустить».</p>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">?</div>
            <div>
              <h3>Что означают знаки «?»</h3>
              <p>Наведите курсор (или нажмите на телефоне) — появится короткая подсказка по этому элементу.</p>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">?</div>
            <div>
              <h3>Обучение само не открылось</h3>
              <p>Так и задумано. Оно стартует только по кнопке «Обучение» в левом меню.</p>
            </div>
          </div>
        </div>
      </SectionCard>
    </AdminShell>
  );
}
