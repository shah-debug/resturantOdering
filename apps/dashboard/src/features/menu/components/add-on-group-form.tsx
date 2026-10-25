'use client';

import { Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { type AddOnGroup, MENU_LIMITS } from '@app/contracts';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Field,
  Input,
  Label,
  Switch,
} from '@app/web/ui';
import { FormError } from '@/components/form-error';
import type { FieldErrors } from '@/lib/form';
import { useCreateAddOnGroupMutation, useUpdateAddOnGroupMutation } from '../menu-api';
import {
  type AddOnDraft,
  type AddOnGroupDraft,
  buildAddOnGroupRequest,
  draftFromAddOnGroup,
  emptyAddOnGroupDraft,
  getDottedFieldErrors,
  newAddOnDraft,
} from '../menu-forms';
import { RupeeInput } from './menu-parts';

function AddOnRow({
  index,
  addOn,
  errors,
  onChange,
  onRemove,
}: {
  index: number;
  addOn: AddOnDraft;
  errors: FieldErrors;
  onChange: (patch: Partial<AddOnDraft>) => void;
  onRemove: () => void;
}) {
  const availableId = useId();
  const prefix = `addOns.${index}`;
  return (
    <fieldset className="grid gap-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">Option {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <Field label="Option name" error={errors[`${prefix}.name`]}>
          {(control) => (
            <Input
              {...control}
              maxLength={120}
              placeholder="e.g. Extra cheese"
              value={addOn.name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          )}
        </Field>
        <Field label="Price (Rs)" error={errors[`${prefix}.priceMinor`]}>
          {(control) => (
            <RupeeInput
              {...control}
              value={addOn.price}
              onChange={(event) => onChange({ price: event.target.value })}
            />
          )}
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            id={availableId}
            checked={addOn.isAvailable}
            onCheckedChange={(isAvailable) => onChange({ isAvailable })}
          />
          <label htmlFor={availableId} className="text-sm">
            Available
          </label>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          aria-label={`Remove option ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
          Remove
        </Button>
      </div>
    </fieldset>
  );
}

export function AddOnGroupForm({
  organizationId,
  group,
  onDone,
}: {
  organizationId: string;
  group: AddOnGroup | null;
  onDone: () => void;
}) {
  const [createGroup, creation] = useCreateAddOnGroupMutation();
  const [updateGroup, update] = useUpdateAddOnGroupMutation();
  const mutation = group ? update : creation;
  const [draft, setDraft] = useState<AddOnGroupDraft>(() =>
    group ? draftFromAddOnGroup(group) : emptyAddOnGroupDraft(),
  );
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const errors = { ...getDottedFieldErrors(mutation.error), ...clientErrors };
  const requiredId = useId();
  const headingId = useId();

  function change(patch: Partial<AddOnGroupDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function changeAddOn(key: string, patch: Partial<AddOnDraft>) {
    setDraft((current) => ({
      ...current,
      addOns: current.addOns.map((addOn) => (addOn.key === key ? { ...addOn, ...patch } : addOn)),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.reset();
    const result = buildAddOnGroupRequest(draft);
    if (!result.success) {
      setClientErrors(result.errors);
      return;
    }
    setClientErrors({});
    const response = group
      ? await updateGroup({ organizationId, groupId: group.id, body: result.data })
      : await createGroup({ organizationId, body: result.data });
    if (response.data) {
      onDone();
    }
  }

  return (
    <Card aria-labelledby={headingId} role="region">
      <CardHeader>
        <h2 id={headingId} className="text-lg font-semibold tracking-tight">
          {group ? `Edit ${group.name}` : 'New customization group'}
        </h2>
        <CardDescription>
          For example “Choose a drink” (required, choose 1) or “Extra toppings” (optional).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-5">
          {mutation.error ? (
            <FormError error={mutation.error} />
          ) : Object.keys(errors).length > 0 ? (
            <Alert variant="destructive">Check the highlighted fields and try again.</Alert>
          ) : null}
          <fieldset disabled={mutation.isLoading} className="grid min-w-0 gap-5">
            <Field label="Group name" error={errors.name}>
              {(control) => (
                <Input
                  {...control}
                  maxLength={120}
                  autoComplete="off"
                  value={draft.name}
                  onChange={(event) => change({ name: event.target.value })}
                />
              )}
            </Field>
            <div className="grid gap-4 rounded-lg border p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="grid gap-0.5">
                  <Label htmlFor={requiredId}>Required</Label>
                  <p id={`${requiredId}-hint`} className="text-xs text-muted-foreground">
                    Customers must make a choice before adding the product.
                  </p>
                </div>
                <Switch
                  id={requiredId}
                  aria-describedby={`${requiredId}-hint`}
                  checked={draft.required}
                  onCheckedChange={(required) =>
                    change({
                      required,
                      minSelect:
                        required && !(Number(draft.minSelect) >= 1) ? '1' : draft.minSelect,
                    })
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {draft.required ? (
                  <Field
                    label="Minimum choices"
                    hint="At least 1 for a required group."
                    error={errors.minSelect}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        inputMode="numeric"
                        value={draft.minSelect}
                        onChange={(event) => change({ minSelect: event.target.value })}
                      />
                    )}
                  </Field>
                ) : null}
                <Field
                  label="Maximum choices"
                  hint="How many options a customer can pick."
                  error={errors.maxSelect}
                >
                  {(control) => (
                    <Input
                      {...control}
                      inputMode="numeric"
                      value={draft.maxSelect}
                      onChange={(event) => change({ maxSelect: event.target.value })}
                    />
                  )}
                </Field>
              </div>
            </div>
            <div className="grid gap-3">
              <h3 className="text-sm font-medium">Options</h3>
              {draft.addOns.map((addOn, index) => (
                <AddOnRow
                  key={addOn.key}
                  index={index}
                  addOn={addOn}
                  errors={errors}
                  onChange={(patch) => changeAddOn(addOn.key, patch)}
                  onRemove={() =>
                    change({ addOns: draft.addOns.filter((entry) => entry.key !== addOn.key) })
                  }
                />
              ))}
              {errors.addOns ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.addOns}
                </p>
              ) : null}
              <div>
                <Button
                  variant="outline"
                  disabled={draft.addOns.length >= MENU_LIMITS.addOnsPerGroup}
                  onClick={() => change({ addOns: [...draft.addOns, newAddOnDraft()] })}
                >
                  <Plus aria-hidden="true" />
                  Add option
                </Button>
              </div>
            </div>
          </fieldset>
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onDone} disabled={mutation.isLoading}>
              Cancel
            </Button>
            <Button type="submit" pending={mutation.isLoading} pendingText="Saving…">
              Save group
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
