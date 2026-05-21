const TZ = "Asia/Shanghai";

export function formatLocal(
  d: Date | string | number,
  opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }
): string {
  return new Date(d).toLocaleString("zh-CN", { timeZone: TZ, ...opts });
}

export function formatTime(d: Date | string | number): string {
  return new Date(d).toLocaleTimeString("zh-CN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(
  d: Date | string | number,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
): string {
  return new Date(d).toLocaleDateString("zh-CN", { timeZone: TZ, ...opts });
}

// 把 Date 转成 <input type="datetime-local"> 接受的 "YYYY-MM-DDTHH:MM"（按上海时区）
export function toDatetimeLocalValue(d: Date | string | number): string {
  const date = new Date(d);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}-${get("minute")}`.replace(
    /T(\d{2})-(\d{2})$/,
    "T$1:$2"
  );
}
