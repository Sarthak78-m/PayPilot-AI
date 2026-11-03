"use client";

import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SearchProvider } from "@/lib/context/search-context";

export default function DashboardLayout({ children }) {
  return (
    <SearchProvider>
      <AppShell>{children}</AppShell>
    </SearchProvider>
  );
}

