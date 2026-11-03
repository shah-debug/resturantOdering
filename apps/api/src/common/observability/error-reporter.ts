import { Injectable, Logger } from '@nestjs/common';

export interface ErrorContext {
  source: 'http' | 'worker' | 'process';
  requestId?: string | null;
  method?: string;
  path?: string;
  task?: string;
}

export abstract class ErrorReporter {
  abstract report(error: unknown, context: ErrorContext): void;
}

@Injectable()
export class LoggingErrorReporter extends ErrorReporter {
  private readonly logger = new Logger('ErrorReporter');

  report(error: unknown, context: ErrorContext): void {
    this.logger.error(
      {
        ...context,
        error: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
      },
      error instanceof Error ? error.stack : undefined,
    );
  }
}
