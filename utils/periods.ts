import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import type { DateRange, StatisticsPeriod } from "../types/statistics";
import {
  calendarDateSchema,
  calendarDateToPicker,
  displayCalendarDate,
  localCalendarDate,
} from "./dates";
export function validateRange(range: DateRange): DateRange {
  calendarDateSchema.parse(range.fromDate);
  calendarDateSchema.parse(range.toDate);
  if (range.fromDate > range.toDate)
    throw new Error("Start date must be on or before end date");
  return range;
}
export function getPeriodRange(
  period: Exclude<StatisticsPeriod, "custom">,
  anchor: string,
): DateRange {
  const date = calendarDateToPicker(anchor);
  if (period === "day") return { fromDate: anchor, toDate: anchor };
  if (period === "week")
    return {
      fromDate: localCalendarDate(startOfWeek(date, { weekStartsOn: 1 })),
      toDate: localCalendarDate(endOfWeek(date, { weekStartsOn: 1 })),
    };
  if (period === "year")
    return {
      fromDate: localCalendarDate(startOfYear(date)),
      toDate: localCalendarDate(endOfYear(date)),
    };
  return {
    fromDate: localCalendarDate(startOfMonth(date)),
    toDate: localCalendarDate(endOfMonth(date)),
  };
}
export function movePeriod(
  period: Exclude<StatisticsPeriod, "custom">,
  anchor: string,
  direction: -1 | 1,
): string {
  const date = calendarDateToPicker(anchor);
  // Start at period boundaries so Jan 31 -> Feb -> March cannot drift.
  const next =
    period === "day"
      ? addDays(date, direction)
      : period === "week"
        ? addWeeks(date, direction)
        : period === "month"
          ? addMonths(startOfMonth(date), direction)
          : addYears(startOfYear(date), direction);
  return localCalendarDate(next);
}
export function periodLabel(
  period: StatisticsPeriod,
  anchor: string,
  range: DateRange,
): string {
  if (period === "month")
    return format(calendarDateToPicker(anchor), "MMMM yyyy");
  if (period === "year") return format(calendarDateToPicker(anchor), "yyyy");
  if (period === "day") return displayCalendarDate(anchor);
  return `${displayCalendarDate(range.fromDate)} – ${displayCalendarDate(range.toDate)}`;
}
export function calendarDayCount(range: DateRange): number {
  validateRange(range);
  return (
    differenceInCalendarDays(
      calendarDateToPicker(range.toDate),
      calendarDateToPicker(range.fromDate),
    ) + 1
  );
}
