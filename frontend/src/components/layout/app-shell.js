"use client";

import React, { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export function AppShell({
  children,
  title = "Dashboard",
  subtitle = "Financial overview and cashflow intelligence",
  searchQuery,
  onSearchChange,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#E8EDF4] text-[#172033] flex overflow-x-hidden">
      {/* Sidebar (Desktop sticky & Mobile drawer) */}
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* Main App Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        <Header
          onOpenMobile={() => setMobileOpen(true)}
          title={title}
          subtitle={subtitle}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
        />

        {/* Removed max-w-7xl and mx-auto — content now fills the space beside the sidebar naturally.
            Padding: 16px mobile, 20px sm, 24px lg (was 32px). */}
        <main className="flex-1 p-4 sm:p-5 lg:p-6 space-y-4 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
