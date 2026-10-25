import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { MediaController } from './media.controller.js';
import { LocalObjectStorage, ObjectStorage, SupabaseObjectStorage } from './object-storage.js';

@Global()
@Module({
  controllers: [MediaController],
  providers: [
    {
      provide: ObjectStorage,
      inject: [AppConfig],
      useFactory: (config: AppConfig): ObjectStorage => {
        const { driver, localDirectory, bucket, supabaseUrl, supabaseServiceRoleKey } =
          config.storage;
        if (driver === 'supabase' && supabaseUrl && supabaseServiceRoleKey) {
          return new SupabaseObjectStorage(supabaseUrl, supabaseServiceRoleKey, bucket);
        }
        return new LocalObjectStorage(localDirectory);
      },
    },
  ],
  exports: [ObjectStorage],
})
export class StorageModule {}
