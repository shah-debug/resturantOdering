import { Controller, Get, HttpStatus, Param, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AppException } from '../../common/errors/app.exception.js';
import { Public } from '../auth/http/decorators.js';
import { contentTypeForKey, STORAGE_KEY_PATTERN } from './image-type.js';
import { LocalObjectStorage, ObjectStorage } from './object-storage.js';

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Image not found');
}

@Public()
@SkipThrottle()
@Controller('media')
export class MediaController {
  constructor(private readonly storage: ObjectStorage) {}

  @Get(':organizationId/:folder/:file')
  async serve(
    @Param('organizationId') organizationId: string,
    @Param('folder') folder: string,
    @Param('file') file: string,
    @Res() response: Response,
  ): Promise<void> {
    const key = `${organizationId}/${folder}/${file}`;
    const contentType = contentTypeForKey(key);
    if (
      !(this.storage instanceof LocalObjectStorage) ||
      !STORAGE_KEY_PATTERN.test(key) ||
      !contentType
    ) {
      throw notFound();
    }
    const body = await this.storage.read(key);
    if (!body) {
      throw notFound();
    }
    response
      .status(HttpStatus.OK)
      .set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Security-Policy': "default-src 'none'",
        'Cross-Origin-Resource-Policy': 'same-site',
      })
      .send(body);
  }
}
