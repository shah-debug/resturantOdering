import { Global, Module } from '@nestjs/common';
import { ErrorReporter, LoggingErrorReporter } from './error-reporter.js';

@Global()
@Module({
  providers: [{ provide: ErrorReporter, useClass: LoggingErrorReporter }],
  exports: [ErrorReporter],
})
export class ObservabilityModule {}
