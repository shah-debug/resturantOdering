'use client';

import { ImageOff, Upload } from 'lucide-react';
import { type ChangeEvent, useId, useState } from 'react';
import { MENU_IMAGE_TYPES, type ProductDetail } from '@app/contracts';
import { getErrorMessage } from '@app/web/api';
import {
  Alert,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@app/web/ui';
import { cn } from '@/lib/utils';
import { useRemoveProductImageMutation, useUploadProductImageMutation } from '../menu-api';
import { imageFileError } from '../menu-forms';

export function ProductImageCard({
  organizationId,
  product,
  canManage,
}: {
  organizationId: string;
  product: ProductDetail;
  canManage: boolean;
}) {
  const [uploadImage, upload] = useUploadProductImageMutation();
  const [removeImage, removal] = useRemoveProductImageMutation();
  const [fileError, setFileError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const target = { organizationId, productId: product.id };
  const busy = upload.isLoading || removal.isLoading;
  const error = fileError ?? (upload.error ? getErrorMessage(upload.error) : null);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    upload.reset();
    removal.reset();
    const problem = imageFileError(file);
    setFileError(problem);
    if (!problem) {
      void uploadImage({ ...target, file });
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold tracking-tight">Photo</h2>
        <CardDescription id={hintId}>JPEG, PNG or WebP, up to 5 MB.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- media may be served from any https origin
            <img
              src={product.imageUrl}
              alt={`Photo of ${product.name}`}
              className="size-full object-cover"
            />
          ) : (
            <span className="grid justify-items-center gap-1 text-sm">
              <ImageOff className="size-6" aria-hidden="true" />
              No photo yet
            </span>
          )}
          {upload.isLoading ? (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-medium">
              Uploading…
            </span>
          ) : null}
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {upload.isLoading ? 'Uploading image…' : upload.isSuccess ? 'Image uploaded.' : ''}
          {removal.isSuccess ? 'Image removed.' : ''}
        </p>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {removal.error ? (
          <Alert variant="destructive">{getErrorMessage(removal.error)}</Alert>
        ) : null}
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <input
              id={inputId}
              type="file"
              accept={MENU_IMAGE_TYPES.join(',')}
              aria-describedby={hintId}
              disabled={busy}
              onChange={handleFile}
              className="peer sr-only"
            />
            <label
              htmlFor={inputId}
              aria-disabled={busy || undefined}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
              )}
            >
              <Upload aria-hidden="true" />
              {upload.isLoading ? 'Uploading…' : 'Upload image'}
            </label>
            {product.imageUrl ? (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                pending={removal.isLoading}
                pendingText="Removing…"
                disabled={busy}
                onClick={() => {
                  setFileError(null);
                  upload.reset();
                  void removeImage(target);
                }}
              >
                Remove image
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
