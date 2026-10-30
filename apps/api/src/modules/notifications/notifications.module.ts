import { Module } from '@nestjs/common';
import { NotificationDispatcher } from './notification-dispatcher.service.js';

@Module({
  providers: [NotificationDispatcher],
  exports: [NotificationDispatcher],
})
export class NotificationsModule {}
