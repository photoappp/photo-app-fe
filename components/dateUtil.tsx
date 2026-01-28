import {
    addMonths,
    getDate,
    getDaysInMonth,
    isAfter,
    setDate,
    setHours,
    startOfDay,
    subMonths,
} from "date-fns";
  
  /**
   * 월 이동 (말일/윤년 자동 처리)
   * - 같은 day 유지
   * - 없으면 해당 월 말일로 처리
   */
  export function shiftMonthsClamped(date: Date, deltaMonths: number): Date {
    const base = setHours(date, 12); // DST 방지
    const originalDay = getDate(base);
  
    const moved =
      deltaMonths >= 0
        ? addMonths(base, deltaMonths)
        : subMonths(base, -deltaMonths);
  
    const daysInTargetMonth = getDaysInMonth(moved);
    return setDate(moved, Math.min(originalDay, daysInTargetMonth));
  }
  
  /**
   * 미래 날짜 미노출
   */
  export function assertNotFuture(date: Date, now = new Date()) {
    if (isAfter(startOfDay(date), startOfDay(now))) {
      throw new Error("Future dates are not allowed");
    }
  }

  // 미래 날짜면 오늘로 이동처리
  export function clampToToday(d: Date, now = new Date()): Date {
    const dd = startOfDay(d);
    const nn = startOfDay(now);
    return isAfter(dd, nn) ? nn : dd;
  }
  