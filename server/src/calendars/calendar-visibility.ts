// Shared by CalendarsService (main app) and DisplaysService (kiosk) so both
// apply the EXACT same rule for "is this calendar visible at this location" -
// see PLANNING.md §16. Before this existed, each service had its own
// near-identical query computing a slightly different answer (the main app
// inferred visibility from the SHARER's own location; the kiosk picker used a
// separate, subtly different version of the same inference) - two systems
// that happened to agree most of the time, and silently didn't the moment a
// calendar's sharer lived somewhere other than where the calendar was
// actually meant to show up.
//
// No CalendarLocationShare rows for a calendar = visible everywhere (whole
// family) - the explicit equivalent of the old "sharer has no location"
// fallback, so a single-location family's behavior never changes.
export function isVisibleAtLocations(locationShares: Array<{ locationId: string }>, locationIds: Set<string>): boolean {
  return locationShares.length === 0 || locationShares.some((ls) => locationIds.has(ls.locationId));
}
