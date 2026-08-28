import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./format-time";

const NOW = new Date("2026-08-29T12:00:00.000Z");

function minutesAgo(n: number): string {
  return new Date(NOW.getTime() - n * 60_000).toISOString();
}
function secondsAgo(n: number): string {
  return new Date(NOW.getTime() - n * 1_000).toISOString();
}
function hoursAgo(n: number): string {
  return new Date(NOW.getTime() - n * 3_600_000).toISOString();
}
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

describe("formatRelativeTime (E01-S024 AC3)", () => {
  it("30 秒前", () => {
    expect(formatRelativeTime(secondsAgo(30), NOW)).toBe("30 秒前");
  });

  it("5 分鐘前", () => {
    expect(formatRelativeTime(minutesAgo(5), NOW)).toBe("5 分鐘前");
  });

  it("3 小時前", () => {
    expect(formatRelativeTime(hoursAgo(3), NOW)).toBe("3 小時前");
  });

  it("2 天前", () => {
    expect(formatRelativeTime(daysAgo(2), NOW)).toBe("2 天前");
  });

  it("超過 7 天顯示日期，不是「30 天前」", () => {
    const result = formatRelativeTime(daysAgo(30), NOW);
    expect(result).not.toContain("天前");
    expect(result).toBe(new Date(daysAgo(30)).toLocaleDateString("zh-TW"));
  });

  it("剛好 7 天仍顯示「7 天前」，超過 7 天(第 8 天)才切換成日期", () => {
    expect(formatRelativeTime(daysAgo(7), NOW)).toBe("7 天前");
    expect(formatRelativeTime(daysAgo(8), NOW)).not.toContain("天前");
  });

  it("未滿 1 分鐘顯示秒數，不是 0 分鐘前", () => {
    expect(formatRelativeTime(secondsAgo(5), NOW)).toBe("5 秒前");
  });

  it("未滿 1 小時但滿 1 分鐘顯示分鐘數", () => {
    expect(formatRelativeTime(minutesAgo(59), NOW)).toBe("59 分鐘前");
  });

  it("未滿 1 天但滿 1 小時顯示小時數", () => {
    expect(formatRelativeTime(hoursAgo(23), NOW)).toBe("23 小時前");
  });

  it("防禦：未來時間(時鐘飄移)不顯示負數，夾在 0 秒前", () => {
    const future = new Date(NOW.getTime() + 5_000).toISOString();
    expect(formatRelativeTime(future, NOW)).toBe("0 秒前");
  });
});
