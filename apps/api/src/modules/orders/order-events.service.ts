import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { OrderEvent } from '@app/contracts';
import { defer, filter, finalize, map, type Observable, Subject } from 'rxjs';

interface Envelope {
  organizationId: string;
  event: OrderEvent;
}

@Injectable()
export class OrderEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(OrderEventsService.name);
  private readonly events = new Subject<Envelope>();
  private connections = 0;

  get connectionCount(): number {
    return this.connections;
  }

  track<T>(source: Observable<T>): Observable<T> {
    return defer(() => {
      this.connections += 1;
      return source.pipe(
        finalize(() => {
          this.connections -= 1;
        }),
      );
    });
  }

  publish(organizationId: string, event: OrderEvent): void {
    try {
      this.events.next({ organizationId, event });
    } catch (error) {
      this.logger.error(
        `Failed to publish ${event.type}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  stream(organizationId: string, branchId: string | null): Observable<OrderEvent> {
    return this.events.pipe(
      filter(
        (envelope) =>
          envelope.organizationId === organizationId &&
          (branchId === null || envelope.event.branchId === branchId),
      ),
      map((envelope) => envelope.event),
    );
  }

  onModuleDestroy(): void {
    this.events.complete();
  }
}
