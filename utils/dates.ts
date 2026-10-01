import { format, isValid, parse } from "date-fns";
import { z } from "zod";
// Calendar dates stay YYYY-MM-DD; never pass them to new Date(string) or toISOString().
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = parse(value, "yyyy-MM-dd", new Date(2000, 0, 1));
    return isValid(date) && format(date, "yyyy-MM-dd") === value;
  }, "Enter a valid calendar date");
export function localCalendarDate(date = new Date()) {
  return format(date, "yyyy-MM-dd");
}
export function calendarDateToPicker(value: string): Date {
  const parsed = parse(
    calendarDateSchema.parse(value),
    "yyyy-MM-dd",
    new Date(2000, 0, 1),
  );
  parsed.setHours(12, 0, 0, 0);
  return parsed;
}
export function displayCalendarDate(value: string) {
  return format(
    parse(calendarDateSchema.parse(value), "yyyy-MM-dd", new Date(2000, 0, 1)),
    "d MMM yyyy",
  );
}
