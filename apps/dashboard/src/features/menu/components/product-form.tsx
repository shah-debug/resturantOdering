'use client';

import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import {
  type AddOnGroup,
  type Category,
  MENU_LIMITS,
  type ProductDetail,
  type ProductStatus,
} from '@app/contracts';
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
  Select,
  Switch,
  Textarea,
} from '@app/web/ui';
import { FormError } from '@/components/form-error';
import type { FieldErrors } from '@/lib/form';
import { cn } from '@/lib/utils';
import { useCreateProductMutation, useUpdateProductMutation } from '../menu-api';
import {
  buildProductRequest,
  draftFromProduct,
  emptyProductDraft,
  getDottedFieldErrors,
  newVariantDraft,
  type ProductDraft,
  selectionSummary,
  type VariantDraft,
} from '../menu-forms';
import { menuBase, RupeeInput } from './menu-parts';

const DESCRIPTION_MAX = 1000;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

function InlineError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  className,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint ? (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function StatusOption({
  value,
  label,
  hint,
  checked,
  onSelect,
}: {
  value: ProductStatus;
  label: string;
  hint: string;
  checked: boolean;
  onSelect: (status: ProductStatus) => void;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 transition-colors',
        checked && 'border-primary bg-accent/40',
      )}
    >
      <input
        id={id}
        type="radio"
        name="status"
        value={value}
        checked={checked}
        aria-describedby={`${id}-hint`}
        onChange={() => onSelect(value)}
        className="mt-0.5 size-4 accent-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
    </div>
  );
}

function VariantRow({
  index,
  variant,
  errors,
  canRemove,
  defaultGroupName,
  onChange,
  onMakeDefault,
  onRemove,
}: {
  index: number;
  variant: VariantDraft;
  errors: FieldErrors;
  canRemove: boolean;
  defaultGroupName: string;
  onChange: (patch: Partial<VariantDraft>) => void;
  onMakeDefault: () => void;
  onRemove: () => void;
}) {
  const defaultId = useId();
  const availableId = useId();
  const prefix = `variants.${index}`;
  return (
    <fieldset className="grid gap-3 rounded-lg border p-3 sm:p-4">
      <legend className="px-1 text-sm font-medium">Option {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
        <Field label="Option name" error={errors[`${prefix}.name`]}>
          {(control) => (
            <Input
              {...control}
              placeholder="e.g. Regular"
              maxLength={80}
              value={variant.name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          )}
        </Field>
        <Field label="Price (Rs)" error={errors[`${prefix}.priceMinor`]}>
          {(control) => (
            <RupeeInput
              {...control}
              placeholder="0"
              value={variant.price}
              onChange={(event) => onChange({ price: event.target.value })}
            />
          )}
        </Field>
        <Field label="SKU (optional)" error={errors[`${prefix}.sku`]}>
          {(control) => (
            <Input
              {...control}
              maxLength={64}
              autoCapitalize="characters"
              spellCheck={false}
              value={variant.sku}
              onChange={(event) => onChange({ sku: event.target.value })}
            />
          )}
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <input
              id={defaultId}
              type="radio"
              name={defaultGroupName}
              checked={variant.isDefault}
              onChange={onMakeDefault}
              className="size-4 accent-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <label htmlFor={defaultId} className="text-sm">
              Default
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={availableId}
              checked={variant.isAvailable}
              onCheckedChange={(isAvailable) => onChange({ isAvailable })}
            />
            <label htmlFor={availableId} className="text-sm">
              Available
            </label>
          </div>
        </div>
        {canRemove ? (
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
        ) : null}
      </div>
    </fieldset>
  );
}

function GroupPicker({
  organizationId,
  groups,
  selectedIds,
  fallbackNames,
  error,
  onChange,
}: {
  organizationId: string;
  groups: readonly AddOnGroup[];
  selectedIds: readonly string[];
  fallbackNames: ReadonlyMap<string, string>;
  error: string | undefined;
  onChange: (ids: string[]) => void;
}) {
  const [pick, setPick] = useState('');
  const byId = new Map(groups.map((group) => [group.id, group]));
  const remaining = groups.filter((group) => !selectedIds.includes(group.id));
  const full = selectedIds.length >= MENU_LIMITS.addOnGroupsPerProduct;
  const errorId = useId();

  function move(index: number, offset: -1 | 1) {
    const ids = [...selectedIds];
    const current = ids[index];
    const swap = ids[index + offset];
    if (current === undefined || swap === undefined) return;
    ids[index] = swap;
    ids[index + offset] = current;
    onChange(ids);
  }

  if (groups.length === 0 && selectedIds.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No customization groups yet.{' '}
        <Link
          href={`${menuBase(organizationId)}/customizations`}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Create one
        </Link>{' '}
        to offer choices like drinks or extra toppings.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {selectedIds.length > 0 ? (
        <ol aria-label="Selected customization groups" className="grid gap-2">
          {selectedIds.map((id, index) => {
            const group = byId.get(id);
            const name = group?.name ?? fallbackNames.get(id) ?? 'Customization group';
            return (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 pl-3"
              >
                <div className="grid min-w-0">
                  <span className="truncate text-sm font-medium">{name}</span>
                  {group ? (
                    <span className="text-xs text-muted-foreground">{selectionSummary(group)}</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Move ${name} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Move ${name} down`}
                    disabled={index === selectedIds.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Remove ${name}`}
                    onClick={() => onChange(selectedIds.filter((entry) => entry !== id))}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      {remaining.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="Add a customization group">
            {(control) => (
              <Select
                {...control}
                aria-describedby={error ? errorId : undefined}
                value={pick}
                disabled={full}
                onChange={(event) => setPick(event.target.value)}
              >
                <option value="">Choose a group…</option>
                {remaining.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({selectionSummary(group)})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button
            variant="outline"
            disabled={!pick || full}
            onClick={() => {
              onChange([...selectedIds, pick]);
              setPick('');
            }}
          >
            <Plus aria-hidden="true" />
            Add group
          </Button>
        </div>
      ) : null}
      <InlineError id={errorId} message={error} />
    </div>
  );
}

export function ProductForm({
  organizationId,
  product,
  categories,
  groups,
  initialCategoryId,
  canManage,
}: {
  organizationId: string;
  product: ProductDetail | null;
  categories: readonly Category[];
  groups: readonly AddOnGroup[];
  initialCategoryId?: string | undefined;
  canManage: boolean;
}) {
  const router = useRouter();
  const [createProduct, creation] = useCreateProductMutation();
  const [updateProduct, update] = useUpdateProductMutation();
  const mutation = product ? update : creation;
  const [draft, setDraft] = useState<ProductDraft>(() =>
    product
      ? draftFromProduct(product)
      : emptyProductDraft(
          categories.some((category) => category.id === initialCategoryId)
            ? (initialCategoryId ?? '')
            : (categories[0]?.id ?? ''),
        ),
  );
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);
  const errors = { ...getDottedFieldErrors(mutation.error), ...clientErrors };
  const hasFieldErrors = Object.keys(errors).length > 0;
  const variantsErrorId = useId();
  const defaultGroupName = useId();
  const fallbackNames = new Map(product?.addOnGroups.map((group) => [group.id, group.name]));

  function change(patch: Partial<ProductDraft>) {
    setSaved(false);
    setDraft((current) => ({ ...current, ...patch }));
  }

  function changeVariant(key: string, patch: Partial<VariantDraft>) {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((variant) =>
        variant.key === key ? { ...variant, ...patch } : variant,
      ),
    }));
  }

  function makeDefault(key: string) {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((variant) => ({ ...variant, isDefault: variant.key === key })),
    }));
  }

  function removeVariant(key: string) {
    setSaved(false);
    setDraft((current) => {
      const variants = current.variants.filter((variant) => variant.key !== key);
      const first = variants[0];
      if (first && !variants.some((variant) => variant.isDefault)) {
        variants[0] = { ...first, isDefault: true };
      }
      return { ...current, variants };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.reset();
    setSaved(false);
    const result = buildProductRequest(draft);
    if (!result.success) {
      setClientErrors(result.errors);
      return;
    }
    setClientErrors({});
    if (product) {
      const response = await updateProduct({
        organizationId,
        productId: product.id,
        body: result.data,
      });
      if (response.data) {
        setDraft(draftFromProduct(response.data));
        setSaved(true);
      }
      return;
    }
    const response = await createProduct({ organizationId, body: result.data });
    if (response.data) {
      router.push(`${menuBase(organizationId)}/products/${encodeURIComponent(response.data.id)}`);
    }
  }

  const variantsError = errors.variants;

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-5">
      {saved ? <Alert variant="success">Product saved.</Alert> : null}
      {mutation.error ? (
        <FormError error={mutation.error} />
      ) : hasFieldErrors ? (
        <Alert variant="destructive">Check the highlighted fields and try again.</Alert>
      ) : null}
      <fieldset disabled={!canManage || mutation.isLoading} className="grid min-w-0 gap-5">
        <Section title="Details">
          <Field label="Category" error={errors.categoryId}>
            {(control) => (
              <Select
                {...control}
                value={draft.categoryId}
                onChange={(event) => change({ categoryId: event.target.value })}
              >
                {draft.categoryId === '' ? <option value="">Choose a category…</option> : null}
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Product name" error={errors.name}>
            {(control) => (
              <Input
                {...control}
                maxLength={160}
                autoComplete="off"
                value={draft.name}
                onChange={(event) => change({ name: event.target.value })}
              />
            )}
          </Field>
          <Field
            label="Description"
            hint={`Optional. ${draft.description.length}/${DESCRIPTION_MAX} characters.`}
            error={errors.description}
          >
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                maxLength={DESCRIPTION_MAX}
                value={draft.description}
                onChange={(event) => change({ description: event.target.value })}
              />
            )}
          </Field>
        </Section>

        <Section title="Visibility">
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Status</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <StatusOption
                value="DRAFT"
                label="Draft"
                hint="Only your team can see it."
                checked={draft.status === 'DRAFT'}
                onSelect={(status) => change({ status })}
              />
              <StatusOption
                value="PUBLISHED"
                label="Published"
                hint="Shown on your storefront."
                checked={draft.status === 'PUBLISHED'}
                onSelect={(status) => change({ status })}
              />
            </div>
            <InlineError id={`${variantsErrorId}-status`} message={errors.status} />
          </fieldset>
          <SwitchRow
            label="Available to order"
            hint="Turn off when it is sold out. It stays on the menu but cannot be ordered."
            checked={draft.isAvailable}
            onCheckedChange={(isAvailable) => change({ isAvailable })}
            className="rounded-lg border p-3"
          />
        </Section>

        <Section
          title="Options and prices"
          description="Add sizes or portions. Customers pick one; the default is preselected."
        >
          {draft.variants.map((variant, index) => (
            <VariantRow
              key={variant.key}
              index={index}
              variant={variant}
              errors={errors}
              canRemove={canManage}
              defaultGroupName={defaultGroupName}
              onChange={(patch) => changeVariant(variant.key, patch)}
              onMakeDefault={() => makeDefault(variant.key)}
              onRemove={() => removeVariant(variant.key)}
            />
          ))}
          {variantsError ? (
            <p id={variantsErrorId} role="alert" className="text-sm text-destructive">
              {variantsError}
            </p>
          ) : null}
          {canManage ? (
            <div>
              <Button
                variant="outline"
                disabled={draft.variants.length >= MENU_LIMITS.variantsPerProduct}
                onClick={() =>
                  change({
                    variants: [...draft.variants, newVariantDraft(draft.variants.length === 0)],
                  })
                }
              >
                <Plus aria-hidden="true" />
                Add option
              </Button>
            </div>
          ) : null}
        </Section>

        <Section
          title="Customizations"
          description="Extra choices like drinks or toppings, shown to customers in this order."
        >
          <GroupPicker
            organizationId={organizationId}
            groups={groups}
            selectedIds={draft.addOnGroupIds}
            fallbackNames={fallbackNames}
            error={errors.addOnGroupIds}
            onChange={(addOnGroupIds) => change({ addOnGroupIds })}
          />
        </Section>
      </fieldset>
      {canManage ? (
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button asChild variant="outline">
            <Link href={menuBase(organizationId)}>Cancel</Link>
          </Button>
          <Button type="submit" pending={mutation.isLoading} pendingText="Saving…">
            Save product
          </Button>
        </div>
      ) : null}
    </form>
  );
}
