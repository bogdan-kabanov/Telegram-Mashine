export const metadata = {
  title: "BOT AI — Панель",
  description: "Управление генерацией и публикацией отзывов",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
