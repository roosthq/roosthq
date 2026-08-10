import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter, interval, map, merge } from 'rxjs';

interface DisplayEvent {
  familyId: string;
  data: unknown;
}

// Singleton broadcaster: owner setting changes are pushed to any live display
// devices for the same family over SSE.
@Injectable()
export class DisplayEventsService {
  private subject = new Subject<DisplayEvent>();

  publish(familyId: string, data: unknown) {
    this.subject.next({ familyId, data });
  }

  stream(familyId: string): Observable<{ data: unknown }> {
    const real = this.subject.pipe(
      filter((e) => e.familyId === familyId),
      map((e) => ({ data: e.data })),
    );
    // A quiet family (no chore/calendar/token activity for a while) never
    // naturally sends anything over this connection - Cloudflare's tunnel and
    // Caddy both eventually drop a genuinely idle HTTP connection, silently,
    // well before that happens. The kiosk's EventSource looks connected the
    // whole time (no error ever fires), so nothing tells it to reconnect -
    // it just quietly stops receiving anything, including a remote reload
    // push, until someone notices and manually reloads the Pi. A small
    // periodic no-op keeps real bytes flowing so the proxies never see it as
    // idle. The client explicitly no-ops on this type (see Display.tsx).
    const heartbeat = interval(20_000).pipe(map(() => ({ data: { type: 'ping' } })));
    return merge(real, heartbeat);
  }
}
