/**
 * PAST DATES (C04). Neither the wizard's "Schedule for later" nor the lesson
 * page's Opens/Due editor looked at the calendar: a teacher could schedule a
 * lesson to open at a moment already behind them, or move a live lesson's due
 * date into last week, and both screens took it without comment.
 *
 * C07i draws the answer for the wizard - "Chosen date has passed" - and these
 * are the two facts it needs. Wall-clock dates, not timings: nothing here is
 * sent to the engine.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** A local day as the `yyyy-mm-dd` a date input holds. */
export function dayOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * When the moment a teacher picked is already behind them, the soonest day
 * that same time is still ahead: today while it is, tomorrow once it is not.
 * Null while the moment is still to come, or when it does not read.
 *
 * The time is the teacher's and is kept - C07i suggests a day, not a moment.
 */
export function soonestOpening(date: string, time: string, now: Date): string | null {
  if (!date || !time) return null;
  const at = new Date(`${date}T${time}`);
  if (Number.isNaN(at.getTime()) || at > now) return null;
  const [h, m] = time.split(":").map(Number);
  const todayAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  return todayAt > now
    ? dayOf(now)
    : dayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
}

/** "Monday 14 July", as C07i writes a day. */
export function longDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
