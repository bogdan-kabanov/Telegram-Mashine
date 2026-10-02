import { NavLink, Route, Routes } from "react-router-dom";
import { StatusPage } from "./pages/StatusPage";
import { WorkspacePage } from "./pages/WorkspacePage";

export function App() {
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">BOT AI</div>
        <NavLink to="/" end>
          Статус
        </NavLink>
        <NavLink to="/app">Рабочий стол</NavLink>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<StatusPage />} />
          <Route path="/app" element={<WorkspacePage />} />
        </Routes>
      </main>
    </div>
  );
}
