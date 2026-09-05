const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "Cer senin",
  1: "Predominant senin",
  2: "Parțial noros",
  3: "Acoperit",
  45: "Ceață",
  48: "Ceață cu chiciură",
  51: "Burniță ușoară",
  53: "Burniță",
  55: "Burniță abundentă",
  61: "Ploaie ușoară",
  63: "Ploaie",
  65: "Ploaie puternică",
  71: "Ninsoare ușoară",
  73: "Ninsoare",
  75: "Ninsoare puternică",
  77: "Boabe de zăpadă",
  80: "Averse ușoare",
  81: "Averse",
  82: "Averse puternice",
  85: "Averse de ninsoare",
  86: "Averse puternice de ninsoare",
  95: "Furtună cu tunete",
  96: "Furtună cu grindină",
  99: "Furtună puternică",
};

export function describeWeatherCode(code: number): string {
  return WMO_DESCRIPTIONS[code] ?? "Necunoscut";
}
