import type { ReactNode } from "react";

import "./admin.css";
import { BasePathFetchPatch } from "./base-path-fetch";
import { AdminProviders } from "./ui/AdminProviders";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminProviders>
      <BasePathFetchPatch />
      {children}
    </AdminProviders>
  );
}
