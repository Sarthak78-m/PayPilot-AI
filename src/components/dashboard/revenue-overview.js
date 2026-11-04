"use client";

import React, { useState } from "react";
import { Card, CardTitle, Badge } from "@/components/ui";
import { TrendingUp } from "@/components/icons";

export function RevenueOverview({
  data = [],
  period = "6M",
  onPeriodChange = () => {},
  loading = false,
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const periods = [
    { label: "6 Months", value: "6M" },
    { label: "1 Year", value: "1Y" },
    { label: "All Time", value: "ALL" },
  ];

  // Calculate maximum for scaling
  const maxRevenue = data.length > 0 ? Math.max(...data.map((d) => d.revenue)) * 1.2 : 10000;
  const totalInPeriod = data.reduce((acc, curr) => acc + curr.revenue, 0);

  return (
    <Card variant="raised" className="space-y-3">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg">Revenue Overview</CardTitle>
            <Badge variant="primary" size="sm">
              Live Trends
            </Badge>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Total for selected period:{" "}
            <span className="font-mono font-bold text-[#172033]">
              ${totalInPeriod.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </p>
        </div>

        {/* Time-Period Toggle Buttons */}
        <div className="p-1 rounded-xl bg-[#E8EDF4] shadow-inset-sm flex items-center gap-1 self-start sm:self-auto">
          {periods.map((p) => {
            const isActive = period === p.value;
            return (
              <button
                key={p.value}
                onClick={() => onPeriodChange(p.value)}
                className={`text-xs font-semibold px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg transition-all duration-150 select-none ${
                  isActive
                    ? "bg-[#2563EB] text-white shadow-primary-glow"
                    : "text-[#64748B] hover:text-[#172033]"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* SVG Interactive Neumorphic Chart */}
      <div className="pt-2 pb-1">
        <div className="relative w-full h-44 sm:h-52 flex flex-col justify-end">
          {/* Subtle Grid Lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-40">
            <div className="border-b border-[#CBD5E1] border-dashed w-full" />
            <div className="border-b border-[#CBD5E1] border-dashed w-full" />
            <div className="border-b border-[#CBD5E1] border-dashed w-full" />
            <div className="border-b border-[#CBD5E1] border-dashed w-full" />
          </div>

          {/* Bar Columns Container */}
          <div className="relative z-10 w-full h-full flex items-end justify-between gap-2 sm:gap-4 px-2">
            {data.map((item, index) => {
              const heightPercent = Math.max(8, Math.round((item.revenue / maxRevenue) * 100));
              const isHovered = hoveredIndex === index;

              return (
                <div
                  key={item.label}
                  className="flex-1 h-full flex flex-col items-center justify-end group cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Neumorphic Tooltip */}
                  {isHovered && (
                    <div className="absolute top-2 z-20 p-2.5 rounded-xl bg-[#172033] text-white shadow-raised-lg text-xs pointer-events-none transform -translate-y-1 transition-all">
                      <p className="font-semibold text-blue-200">{item.month || item.label}</p>
                      <p className="text-sm font-mono font-bold mt-0.5">
                        ${item.revenue.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-zinc-300">
                        {item.invoices} {item.invoices === 1 ? "invoice" : "invoices"}
                      </p>
                    </div>
                  )}

                  {/* Tactile Bar */}
                  <div className="w-full max-w-[42px] flex flex-col items-center h-full justify-end">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-t-xl transition-all duration-300 ${
                        isHovered
                          ? "bg-gradient-to-t from-[#2563EB] to-[#60A5FA] shadow-primary-glow"
                          : "bg-gradient-to-t from-[#2563EB]/85 to-[#3B82F6]/90 shadow-raised-sm group-hover:from-[#2563EB] group-hover:to-[#60A5FA]"
                      }`}
                    />
                  </div>

                  {/* X-Axis Label */}
                  <span
                    className={`mt-2 text-[11px] font-semibold transition-colors truncate max-w-full ${
                      isHovered ? "text-[#2563EB]" : "text-[#64748B]"
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Meta */}
      <div className="flex items-center justify-between text-xs text-[#64748B] pt-2 border-t border-[#CBD5E1]/60">
        <span className="flex items-center gap-1.5 font-medium text-[#16A34A] text-[11px] sm:text-xs">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Consistent positive billing momentum</span>
        </span>
        <span className="font-mono text-[10px] sm:text-[11px]">Hover bars for details</span>
      </div>
    </Card>
  );
}
