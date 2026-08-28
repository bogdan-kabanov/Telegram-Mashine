import { describe, expect, it } from "vitest";

import { buildMessageClock, computeMessageTimes, formatStatusBarTime } from "../src/lib/format";
import { formatClockTime, formatLocalDate, formatMexicoDateTime, dateFromZonedLocal, formatDateTimeLocal } from "../src/lib/timezone";

const MX = "America/Mexico_City";
const AR = "America/Argentina/Buenos_Aires";
const VE = "America/Caracas";

/** 19:34 in Mexico City on 13 Aug 2026. */
const NOW = new Date("2026-08-13T19:34:00.000-06:00");

describe("shared conversation clock", () => {
  it("aligns the last bubble to now and walks earlier turns back by delay", () => {
    const times = computeMessageTimes([{ delayMinutes: 0 }, { delayMinutes: 2 }, { delayMinutes: 165 }], {
      now: NOW,
      timeZone: MX,
    });
    expect(times).toEqual(["16:49", "16:51", "19:34"]);
  });

  it("never goes backwards when delays are non-monotonic", () => {
    const times = computeMessageTimes([{ delayMinutes: 10 }, { delayMinutes: 4 }, { delayMinutes: 12 }], {
      now: NOW,
      timeZone: MX,
    });
    expect(times).toEqual(["19:32", "19:32", "19:34"]);
  });

  it("uses the project timezone so MX / AR / VE clocks differ for the same instant", () => {
    const mx = formatClockTime(MX, NOW);
    const ar = formatClockTime(AR, NOW);
    const ve = formatClockTime(VE, NOW);
    expect(mx).toBe("19:34");
    expect(ar).toBe("22:34");
    expect(ve).toBe("21:34");
    expect(new Set([mx, ar, ve]).size).toBe(3);
  });

  it("stamps captura earlier than payout on the same clock", () => {
    const messages = [
      { delayMinutes: 0, type: "text" },
      { delayMinutes: 40, type: "captura" },
      { delayMinutes: 118, type: "receipt" },
      { delayMinutes: 165, type: "text" },
    ];
    const clock = buildMessageClock(messages, { now: NOW, timeZone: MX, locale: "es-MX" });
    const captura = clock.stampForType(messages, "captura");
    const receipt = clock.stampForType(messages, "receipt");
    expect(clock.lastTime).toBe("19:34");
    expect(captura?.time).toBe("17:29");
    expect(receipt?.time).toBe("18:47");
    expect(captura?.date).toMatch(/13/);
    expect(receipt?.date).toMatch(/13/);
  });

  it("formats Mexico receipts as 24-hour HH:mm without am/pm", () => {
    const stamped = formatMexicoDateTime(NOW);
    expect(stamped.time).toBe("19:34");
    expect(stamped.time).toMatch(/^\d{2}:\d{2}$/);
    expect(stamped.time.toLowerCase()).not.toMatch(/m/);
  });

  it("formats VE dates as dd/MM/yyyy", () => {
    expect(formatLocalDate(NOW, { timeZone: VE, locale: "es-VE", dateFormat: "dd/MM/yyyy" })).toBe(
      "13/08/2026",
    );
  });

  it("wraps past midnight onto the previous calendar day", () => {
    const late = new Date("2026-08-13T00:10:00.000-06:00");
    const clock = buildMessageClock([{ delayMinutes: 0 }, { delayMinutes: 30 }], {
      now: late,
      timeZone: MX,
      locale: "es-MX",
    });
    expect(clock.times).toEqual(["23:40", "00:10"]);
    expect(clock.stampAt(0).date).toMatch(/12/);
    expect(clock.stampAt(1).date).toMatch(/13/);
  });

  it("keeps status bar on the same timezone clock", () => {
    expect(formatStatusBarTime(NOW, MX)).toBe("19:34");
    expect(formatStatusBarTime(NOW, AR)).toBe("22:34");
  });

  it("round-trips datetime-local in the project timezone, not the machine TZ", () => {
    const local = formatDateTimeLocal(NOW, MX);
    expect(local).toBe("2026-08-13T19:34");
    const back = dateFromZonedLocal(local, MX);
    expect(formatClockTime(MX, back)).toBe("19:34");
    expect(formatClockTime(AR, back)).toBe("22:34");
  });
});
