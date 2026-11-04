/**
 * The delivered-but-waiting reveal: the renders wait for the render agent (it is down, its night
 * window is closed, or the queue is long), so the app says when they should be ready instead of
 * showing a spinner.
 */

type WaitOptions = {
  /** Defaults to the device's locale. */
  locale?: string;
  /** Defaults to the device's time zone. */
  timeZone?: string;
  now?: Date;
};

function localDay(at: Date, timeZone: string | undefined) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

function localHour(at: Date, timeZone: string | undefined) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(at));
}

/** "7 AM", or "7:30 AM", in the user's locale and time zone. */
export function readyTimeLabel(expectedReadyAt: string, options: WaitOptions = {}): string {
  const at = new Date(expectedReadyAt);
  const minutes = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: options.timeZone, minute: '2-digit' }).format(at),
  );
  return new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    hour: 'numeric',
    ...(minutes === 0 ? {} : { minute: '2-digit' }),
  }).format(at);
}

/**
 * "Delivered — your reveal is being styled tonight and will be ready by about 7 AM. We'll send
 * you a push." With no estimate (null), it will be ready "shortly".
 */
export function revealWaitCopy(expectedReadyAt: string | null | undefined, options: WaitOptions = {}): string {
  const push = "We'll send you a push.";
  if (!expectedReadyAt || Number.isNaN(new Date(expectedReadyAt).getTime())) {
    return `Delivered — your reveal is being styled and will be ready shortly. ${push}`;
  }
  const now = options.now ?? new Date();
  const at = new Date(expectedReadyAt);
  const time = readyTimeLabel(expectedReadyAt, options);
  const sameDay = localDay(at, options.timeZone) === localDay(now, options.timeZone);
  if (sameDay) {
    return `Delivered — your reveal is being styled and will be ready by about ${time}. ${push}`;
  }
  // Ready tomorrow morning: it renders overnight.
  if (localHour(at, options.timeZone) < 12 && at.getTime() - now.getTime() < 36 * 3600_000) {
    return `Delivered — your reveal is being styled tonight and will be ready by about ${time}. ${push}`;
  }
  const day = new Intl.DateTimeFormat(options.locale, { timeZone: options.timeZone, weekday: 'long' }).format(at);
  return `Delivered — your reveal is being styled and will be ready by about ${time} ${day}. ${push}`;
}
