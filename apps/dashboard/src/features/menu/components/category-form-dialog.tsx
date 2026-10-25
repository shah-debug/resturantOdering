'use client';

import { type FormEvent, useId, useState } from 'react';
import { type Category, createCategoryRequestSchema } from '@app/contracts';
import { getFieldErrors } from '@app/web/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Switch,
  Textarea,
} from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { type FieldErrors, validateForm } from '@/lib/form';
import { useCreateCategoryMutation, useUpdateCategoryMutation } from '../menu-api';

const messages = {
  name: 'Enter a name between 2 and 120 characters',
  description: 'Keep the description under 500 characters',
};

function CategoryForm({
  organizationId,
  category,
  onSaved,
  onCancel,
}: {
  organizationId: string;
  category: Category | null;
  onSaved: (category: Category) => void;
  onCancel: () => void;
}) {
  const [createCategory, creation] = useCreateCategoryMutation();
  const [updateCategory, update] = useUpdateCategoryMutation();
  const mutation = category ? update : creation;
  const [values, setValues] = useState({
    name: category?.name ?? '',
    description: category?.description ?? '',
    isActive: category?.isActive ?? true,
  });
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const errors = { ...getFieldErrors(mutation.error), ...clientErrors };
  const switchId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.reset();
    const result = validateForm(
      createCategoryRequestSchema,
      {
        name: values.name,
        description: values.description.trim() || null,
        isActive: values.isActive,
      },
      messages,
    );
    if (!result.success) {
      setClientErrors(result.errors);
      return;
    }
    setClientErrors({});
    const response = category
      ? await updateCategory({ organizationId, categoryId: category.id, body: result.data })
      : await createCategory({ organizationId, body: result.data });
    if (response.data) {
      onSaved(response.data);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-4">
      <FormError error={mutation.error} />
      <Field label="Category name" error={errors.name}>
        {(control) => (
          <Input
            {...control}
            name="name"
            autoComplete="off"
            maxLength={120}
            value={values.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
          />
        )}
      </Field>
      <Field
        label="Description"
        hint="Optional. Shown under the category name."
        error={errors.description}
      >
        {(control) => (
          <Textarea
            {...control}
            name="description"
            rows={3}
            maxLength={500}
            value={values.description}
            onChange={(event) => setValues({ ...values, description: event.target.value })}
          />
        )}
      </Field>
      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div className="grid gap-0.5">
          <label htmlFor={switchId} className="text-sm font-medium">
            Visible to customers
          </label>
          <p id={`${switchId}-hint`} className="text-xs text-muted-foreground">
            Hidden categories stay on your dashboard but not on your storefront.
          </p>
        </div>
        <Switch
          id={switchId}
          aria-describedby={`${switchId}-hint`}
          checked={values.isActive}
          onCheckedChange={(isActive) => setValues({ ...values, isActive })}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={mutation.isLoading}>
          Cancel
        </Button>
        <Button type="submit" pending={mutation.isLoading} pendingText="Saving…">
          {category ? 'Save category' : 'Create category'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CategoryFormDialog({
  organizationId,
  open,
  category,
  onOpenChange,
  onSaved,
}: {
  organizationId: string;
  open: boolean;
  category: Category | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (category: Category) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle>
          <DialogDescription>
            {category
              ? 'Rename the category or change whether customers can see it.'
              : 'Group related products, like Starters, Mains or Drinks.'}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <CategoryForm
            organizationId={organizationId}
            category={category}
            onCancel={() => onOpenChange(false)}
            onSaved={(saved) => {
              onOpenChange(false);
              onSaved?.(saved);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
