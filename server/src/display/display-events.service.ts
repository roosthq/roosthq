import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';

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
    return this.subject.pipe(
      filter((e) => e.familyId === familyId),
      map((e) => ({ data: e.data })),
    );
  }
}
