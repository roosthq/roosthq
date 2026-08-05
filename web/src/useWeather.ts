import { useEffect, useRef, useState } from 'react';

export interface WeatherNow {
  tempF: number;
  label: string;
  icon: string;
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

const REFRESH_MS = 15 * 60_000;

// Geocodes `location` once per distinct string (Open-Meteo's free, keyless
// geocoding + forecast APIs), then polls current conditions every 15
// minutes. Shared by the kiosk header and the screensaver via one call site
// each — same data, same schedule, no duplicate polling.
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
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`,
        ).then((r) => r.json());
        if (stopped) return;
        const temp = data?.current?.temperature_2m;
        const code = data?.current?.weather_code;
        if (typeof temp !== 'number') return;
        const desc = WMO[code] ?? { icon: '🌡️', label: 'Weather' };
        setWeather({ tempF: Math.round(temp), icon: desc.icon, label: desc.label });
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
