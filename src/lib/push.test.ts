import { describe, expect, it } from "vitest";
import { isExpoPushToken } from "./push";

describe("isExpoPushToken", () => {
  it("aceita Expo e Exponent", () => {
    expect(isExpoPushToken("ExpoPushToken[abc123]")).toBe(true);
    expect(isExpoPushToken("ExponentPushToken[abc123]")).toBe(true);
  });

  it("recusa token vazio ou de outro formato", () => {
    expect(isExpoPushToken("")).toBe(false);
    expect(isExpoPushToken("fcm-token")).toBe(false);
    expect(isExpoPushToken("ExpoPushToken[]")).toBe(false);
  });
});
