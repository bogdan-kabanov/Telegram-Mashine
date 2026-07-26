import type { RenderMessage } from "@/modules/chat-renderer/template";

export interface ChatUiCopy {
  lang: string;
  statusRecently: string;
  inputPlaceholder: string;
  sampleClientName: string;
  sampleMessages: RenderMessage[];
}

const RU: ChatUiCopy = {
  lang: "ru",
  statusRecently: "был(а) недавно",
  inputPlaceholder: "Сообщение",
  sampleClientName: "Алексей",
  sampleMessages: [
    {
      id: "1",
      role: "client",
      type: "text",
      content: "Мне нужна ваша помощь",
      time: "17:08",
    },
    {
      id: "2",
      role: "client",
      type: "text",
      content: "Получил травму на работе",
      time: "17:08",
    },
    {
      id: "3",
      role: "client",
      type: "text",
      content: "Нет денег на лечение",
      time: "17:08",
    },
    {
      id: "4",
      role: "manager",
      type: "text",
      content: "Здравствуйте\nСейчас всё расскажу",
      time: "17:09",
      read: true,
    },
  ],
};

const ES: ChatUiCopy = {
  lang: "es",
  statusRecently: "últ. vez recientemente",
  inputPlaceholder: "Mensaje",
  sampleClientName: "Manuel",
  sampleMessages: [
    {
      id: "1",
      role: "client",
      type: "text",
      content: "Necesito tu ayuda",
      time: "17:08",
    },
    {
      id: "2",
      role: "client",
      type: "text",
      content: "Me lesioné en el trabajo",
      time: "17:08",
    },
    {
      id: "3",
      role: "client",
      type: "text",
      content: "No tengo dinero para pagar el tratamiento",
      time: "17:08",
    },
    {
      id: "4",
      role: "manager",
      type: "text",
      content: "Hola\nTe lo contaré todo",
      time: "17:09",
      read: true,
    },
  ],
};

export function chatUiForLocale(locale: string | null | undefined): ChatUiCopy {
  const code = (locale ?? "").toLowerCase();
  if (code.startsWith("ru")) return RU;
  return ES;
}
