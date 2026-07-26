import type { ReactNode } from "react";

import "./admin.css";
import { AdminProviders } from "./ui/AdminProviders";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminProviders>{children}</AdminProviders>;
}
