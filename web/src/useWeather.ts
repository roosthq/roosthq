import { useEffect, useRef, useState } from 'react';

export interface ForecastDay {
  date: string; // YYYY-MM-DD
  hi: number;
  lo: number;
  icon: string;
  label: string;
}

export interface WeatherNow {
  tempF: number;
  label: string;
  icon: string;
  lat: number;
  lon: number;
  forecast: ForecastDay[];
}

// WMO weather codes (what Open-Meteo returns) collapsed to a simple icon +
// label — not exhaustive, just the common buckets a glance actually needs.
const WMO: Record<number, { icon: string; label: string }> = {
  0: { icon: '☀️', label: 'Clear' },
  1: { icon: '🌤️', label: 'Mostly clear' },
  2: { icon: '⛅', label: 'Partly cloudy' },
  3: { icon: '☁️', label: 'Overcast' },
  45: { icon: '🌫️', label: 'Fog' },
  48: { icon: '🌫️', label: 'Fog' },
  51: { icon: '🌦️', label: 'Light drizzle' },
  53: { icon: '🌦️', label: 'Drizzle' },
  55: { icon: '🌧️', label: 'Heavy drizzle' },
  61: { icon: '🌦️', label: 'Light rain' },
  63: { icon: '🌧️', label: 'Rain' },
  65: { icon: '🌧️', label: 'Heavy rain' },
  71: { icon: '🌨️', label: 'Light snow' },
  73: { icon: '🌨️', label: 'Snow' },
  75: { icon: '❄️', label: 'Heavy snow' },
  80: { icon: '🌦️', label: 'Rain showers' },
  81: { icon: '🌧️', label: 'Rain showers' },
  82: { icon: '⛈️', label: 'Violent showers' },
  95: { icon: '⛈️', label: 'Thunderstorm' },
  96: { icon: '⛈️', label: 'Thunderstorm' },
  99: { icon: '⛈️', label: 'Severe thunderstorm' },
};

function describe(code: number): { icon: string; label: string } {
  return WMO[code] ?? { icon: '🌡️', label: 'Weather' };
}

// `new Date("2026-08-06")` parses a date-only string as UTC midnight, so
// displaying it via toLocaleDateString (which converts to the browser's
// local zone) shifts it back a calendar day for anyone west of UTC —
// Phoenix (UTC-7) would show that instant as 5pm the day before, making
// every forecast date render one day early. Parse as local-time components
// instead, no UTC round-trip.
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const REFRESH_MS = 15 * 60_000;

// Geocodes `location` once per distinct string (Open-Meteo's free, keyless
// geocoding + forecast APIs), then polls current conditions + a 10-day daily
// forecast (one combined request) every 15 minutes. Shared by the kiosk
// header and the screensaver via one call site each — same data, same
// schedule, no duplicate polling.
export function useWeather(location: string | null | undefined): WeatherNow | null {
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const coordsRef = useRef<{ lat: number; lon: number } | null>(null);
  const geocodedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!location) {
      setWeather(null);
      return;
    }
    const loc = location;
    let stopped = false;

    async function tick() {
      try {
        if (geocodedForRef.current !== loc || !coordsRef.current) {
          const geo = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(loc)}`,
          ).then((r) => r.json());
          const hit = geo?.results?.[0];
          if (!hit) return;
          coordsRef.current = { lat: hit.latitude, lon: hit.longitude };
          geocodedForRef.current = loc;
        }
        const { lat, lon } = coordsRef.current;
        const data = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&temperature_unit=fahrenheit&timezone=auto&forecast_days=10`,
        ).then((r) => r.json());
        if (stopped) return;
        const temp = data?.current?.temperature_2m;
        const code = data?.current?.weather_code;
        if (typeof temp !== 'number') return;
        const desc = describe(code);
        const daily = data?.daily;
        const forecast: ForecastDay[] = Array.isArray(daily?.time)
          ? daily.time.map((date: string, i: number) => {
              const d = describe(daily.weather_code?.[i]);
              return {
                date,
                hi: Math.round(daily.temperature_2m_max?.[i]),
                lo: Math.round(daily.temperature_2m_min?.[i]),
                icon: d.icon,
                label: d.label,
              };
            })
          : [];
        setWeather({ tempF: Math.round(temp), icon: desc.icon, label: desc.label, lat, lon, forecast });
      } catch {
        // transient network blip — keep showing the last-known reading
        // rather than clearing it.
      }
    }

    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [location]);

  return weather;
}
