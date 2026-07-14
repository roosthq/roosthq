import type { DisplayConfig, FamilyLocation } from './api';

// Locations a user is assigned to (adults: usually one; kids: possibly several).
export function myLocationIds(locations: FamilyLocation[], userId: string): string[] {
  return locations.filter((l) => l.users.some((u) => u.userId === userId)).map((l) => l.id);
}

// Displays scoped to any of those locations.
export function displaysForLocations(displays: DisplayConfig[], locationIds: string[]): DisplayConfig[] {
  if (!locationIds.length) return [];
  return displays.filter((d) => d.locationId && locationIds.includes(d.locationId));
}
