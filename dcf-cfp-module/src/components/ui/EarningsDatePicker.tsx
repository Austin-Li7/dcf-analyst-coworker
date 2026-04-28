"use client";

import { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { isSameDay } from "date-fns";
import { CalendarDays, Loader2 } from "lucide-react";

interface EarningsDatePickerProps {
  companyName: string;
  selected: Date | null;
  onChange: (date: Date | null) => void;
  label?: string;
  minDate?: Date;
}

/**
 * Reusable calendar component that:
 * 1. Auto-fetches the next earnings date from Yahoo Finance
 * 2. Highlights that date in red on the calendar
 * 3. Wraps react-datepicker with dark theme styling
 */
export default function EarningsDatePicker({
  companyName,
  selected,
  onChange,
  label = "Select Expiration Date",
  minDate,
}: EarningsDatePickerProps) {
  const [earningsDate, setEarningsDate] = useState<Date | null>(null);
  const [resolvedTicker, setResolvedTicker] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  // Fetch earnings date on mount / when company name changes
  useEffect(() => {
    if (!companyName.trim()) return;

    let cancelled = false;

    Promise.resolve()
      .then(() => {
        if (!cancelled) setIsFetching(true);
        return fetch(`/api/earnings-date?companyName=${encodeURIComponent(companyName)}`);
      })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.earningsDate) {
          setEarningsDate(new Date(data.earningsDate));
        }
        if (data.ticker) {
          setResolvedTicker(data.ticker);
        }
      })
      .catch(() => {
        // Silently fail — calendar still works without earnings highlight
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyName]);

  /** Apply red highlight class if the day matches the earnings date */
  const dayClassName = (date: Date): string => {
    if (earningsDate && isSameDay(date, earningsDate)) {
      return "!bg-red-500 !text-white !font-bold !rounded-full hover:!bg-red-600";
    }
    return "";
  };

  return (
    <div className="space-y-2">
      <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-zinc-300">
        <CalendarDays size={14} />
        {label}
        {isFetching && <Loader2 size={12} className="animate-spin text-zinc-500" />}
      </label>

      <DatePicker
        selected={selected}
        onChange={onChange}
        dayClassName={dayClassName}
        minDate={minDate || new Date()}
        dateFormat="MM/dd/yyyy"
        placeholderText="Pick a date..."
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        calendarClassName="!bg-zinc-900 !border-zinc-700 !text-zinc-100 !rounded-lg !shadow-2xl"
        wrapperClassName="w-full"
        showPopperArrow={false}
      />

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        {earningsDate && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
            Next Expected Earnings
            {resolvedTicker && <span className="text-zinc-600">({resolvedTicker})</span>}
            <span className="text-zinc-400">
              {earningsDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </span>
        )}
        {!earningsDate && !isFetching && (
          <span className="text-zinc-600">Earnings date not available</span>
        )}
      </div>
    </div>
  );
}
