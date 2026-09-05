import "dotenv/config";
import { describe, test, expect } from "bun:test";
import { describeWeatherCode } from "../utils/weatherCode";

describe("describeWeatherCode", () => {
  test("code 0 returns Cer senin", () => {
    expect(describeWeatherCode(0)).toBe("Cer senin");
  });

  test("code 1 returns Predominant senin", () => {
    expect(describeWeatherCode(1)).toBe("Predominant senin");
  });

  test("code 2 returns Parțial noros", () => {
    expect(describeWeatherCode(2)).toBe("Parțial noros");
  });

  test("code 3 returns Acoperit", () => {
    expect(describeWeatherCode(3)).toBe("Acoperit");
  });

  test("code 45 returns Ceață", () => {
    expect(describeWeatherCode(45)).toBe("Ceață");
  });

  test("code 61 returns Ploaie ușoară", () => {
    expect(describeWeatherCode(61)).toBe("Ploaie ușoară");
  });

  test("code 63 returns Ploaie", () => {
    expect(describeWeatherCode(63)).toBe("Ploaie");
  });

  test("code 71 returns Ninsoare ușoară", () => {
    expect(describeWeatherCode(71)).toBe("Ninsoare ușoară");
  });

  test("code 73 returns Ninsoare", () => {
    expect(describeWeatherCode(73)).toBe("Ninsoare");
  });

  test("code 75 returns Ninsoare puternică", () => {
    expect(describeWeatherCode(75)).toBe("Ninsoare puternică");
  });

  test("code 80 returns Averse ușoare", () => {
    expect(describeWeatherCode(80)).toBe("Averse ușoare");
  });

  test("code 95 returns Furtună cu tunete", () => {
    expect(describeWeatherCode(95)).toBe("Furtună cu tunete");
  });

  test("code 96 returns Furtună cu grindină", () => {
    expect(describeWeatherCode(96)).toBe("Furtună cu grindină");
  });

  test("code 99 returns Furtună puternică", () => {
    expect(describeWeatherCode(99)).toBe("Furtună puternică");
  });

  test("unknown code returns Necunoscut fallback", () => {
    expect(describeWeatherCode(999)).toBe("Necunoscut");
  });

  test("another unknown code returns Necunoscut fallback", () => {
    expect(describeWeatherCode(-1)).toBe("Necunoscut");
  });
});
