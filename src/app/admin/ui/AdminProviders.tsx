"use client";

import type { ReactNode } from "react";

import { OnboardingHost, OnboardingProvider } from "./Onboarding";

/** Keeps tour state across page navigations while the tour runs. */
export function AdminProviders({ children }: { children: ReactNode }) {
  return (
    <OnboardingProvider>
      {children}
      <OnboardingHost />
    </OnboardingProvider>
  );
}
