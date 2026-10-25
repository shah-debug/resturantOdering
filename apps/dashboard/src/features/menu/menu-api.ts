import { z } from 'zod';
import {
  type AddOnGroup,
  addOnGroupSchema,
  type AddOnGroupUpsertRequest,
  type Category,
  categorySchema,
  type CreateCategoryRequest,
  type Paginated,
  paginatedSchema,
  type ProductDetail,
  productDetailSchema,
  type ProductPatchRequest,
  type ProductStatus,
  type ProductSummary,
  productSummarySchema,
  type ProductUpsertRequest,
  type UpdateCategoryRequest,
} from '@app/contracts';
import { dashboardApi } from '@/lib/api';

const categoryListSchema = z.array(categorySchema);
const productPageSchema = paginatedSchema(productSummarySchema);
const addOnGroupListSchema = z.array(addOnGroupSchema);
const parseCategory = (response: unknown): Category => categorySchema.parse(response);
const parseProduct = (response: unknown): ProductDetail => productDetailSchema.parse(response);
const parseAddOnGroup = (response: unknown): AddOnGroup => addOnGroupSchema.parse(response);

export interface ProductListArgs {
  organizationId: string;
  search?: string | undefined;
  categoryId?: string | undefined;
  status?: ProductStatus | undefined;
  page: number;
  pageSize: number;
}

interface ProductTarget {
  organizationId: string;
  productId: string;
}

interface CategoryTarget {
  organizationId: string;
  categoryId: string;
}

interface AddOnGroupTarget {
  organizationId: string;
  groupId: string;
}

export function menuPath(organizationId: string): string {
  return `/organizations/${encodeURIComponent(organizationId)}/menu`;
}

function productPath({ organizationId, productId }: ProductTarget): string {
  return `${menuPath(organizationId)}/products/${encodeURIComponent(productId)}`;
}

function categoryPath({ organizationId, categoryId }: CategoryTarget): string {
  return `${menuPath(organizationId)}/categories/${encodeURIComponent(categoryId)}`;
}

function addOnGroupPath({ organizationId, groupId }: AddOnGroupTarget): string {
  return `${menuPath(organizationId)}/add-on-groups/${encodeURIComponent(groupId)}`;
}

const list = (organizationId: string) => `LIST-${organizationId}`;
const details = (organizationId: string) => `DETAILS-${organizationId}`;

export const menuApi = dashboardApi.injectEndpoints({
  endpoints: (build) => ({
    listCategories: build.query<Category[], string>({
      query: (organizationId) => `${menuPath(organizationId)}/categories`,
      transformResponse: (response: unknown) => categoryListSchema.parse(response),
      providesTags: (result, _error, organizationId) => [
        { type: 'Category', id: list(organizationId) },
        ...(result ?? []).map(({ id }) => ({ type: 'Category' as const, id })),
      ],
    }),
    createCategory: build.mutation<
      Category,
      { organizationId: string; body: CreateCategoryRequest }
    >({
      query: ({ organizationId, body }) => ({
        url: `${menuPath(organizationId)}/categories`,
        method: 'POST',
        body,
      }),
      transformResponse: parseCategory,
      invalidatesTags: (result, _error, { organizationId }) =>
        result ? [{ type: 'Category', id: list(organizationId) }] : [],
    }),
    updateCategory: build.mutation<Category, CategoryTarget & { body: UpdateCategoryRequest }>({
      query: ({ body, ...target }) => ({ url: categoryPath(target), method: 'PATCH', body }),
      transformResponse: parseCategory,
      invalidatesTags: (result, _error, { organizationId, categoryId }) =>
        result
          ? [
              { type: 'Category', id: categoryId },
              { type: 'Category', id: list(organizationId) },
              { type: 'Product', id: list(organizationId) },
              { type: 'Product', id: details(organizationId) },
            ]
          : [],
    }),
    deleteCategory: build.mutation<void, CategoryTarget>({
      query: (target) => ({ url: categoryPath(target), method: 'DELETE' }),
      invalidatesTags: (_result, error, { organizationId, categoryId }) =>
        error
          ? []
          : [
              { type: 'Category', id: categoryId },
              { type: 'Category', id: list(organizationId) },
            ],
    }),
    reorderCategories: build.mutation<Category[], { organizationId: string; ids: string[] }>({
      query: ({ organizationId, ids }) => ({
        url: `${menuPath(organizationId)}/categories/order`,
        method: 'PUT',
        body: { ids },
      }),
      transformResponse: (response: unknown) => categoryListSchema.parse(response),
      async onQueryStarted({ organizationId, ids }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          menuApi.util.updateQueryData('listCategories', organizationId, (draft) => {
            const order = new Map(ids.map((id, index) => [id, index]));
            draft.sort(
              (a, b) =>
                (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
                (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
            );
          }),
        );
        try {
          const { data } = await queryFulfilled;
          void dispatch(menuApi.util.upsertQueryData('listCategories', organizationId, data));
        } catch {
          patch.undo();
        }
      },
    }),
    listProducts: build.query<Paginated<ProductSummary>, ProductListArgs>({
      query: ({ organizationId, search, categoryId, status, page, pageSize }) => ({
        url: `${menuPath(organizationId)}/products`,
        params: { search: search || undefined, categoryId, status, page, pageSize },
      }),
      transformResponse: (response: unknown) => productPageSchema.parse(response),
      providesTags: (result, _error, { organizationId }) => [
        { type: 'Product', id: list(organizationId) },
        ...(result?.items ?? []).map(({ id }) => ({ type: 'Product' as const, id })),
      ],
    }),
    getProduct: build.query<ProductDetail, ProductTarget>({
      query: (target) => productPath(target),
      transformResponse: parseProduct,
      providesTags: (_result, _error, { organizationId, productId }) => [
        { type: 'Product', id: productId },
        { type: 'Product', id: details(organizationId) },
      ],
    }),
    createProduct: build.mutation<
      ProductDetail,
      { organizationId: string; body: ProductUpsertRequest }
    >({
      query: ({ organizationId, body }) => ({
        url: `${menuPath(organizationId)}/products`,
        method: 'POST',
        body,
      }),
      transformResponse: parseProduct,
      invalidatesTags: (result, _error, { organizationId }) =>
        result
          ? [
              { type: 'Product', id: list(organizationId) },
              { type: 'Category', id: list(organizationId) },
              { type: 'AddOnGroup', id: list(organizationId) },
            ]
          : [],
    }),
    updateProduct: build.mutation<ProductDetail, ProductTarget & { body: ProductUpsertRequest }>({
      query: ({ body, ...target }) => ({ url: productPath(target), method: 'PUT', body }),
      transformResponse: parseProduct,
      invalidatesTags: (result, _error, { organizationId, productId }) =>
        result
          ? [
              { type: 'Product', id: productId },
              { type: 'Product', id: list(organizationId) },
              { type: 'Category', id: list(organizationId) },
              { type: 'AddOnGroup', id: list(organizationId) },
            ]
          : [],
    }),
    patchProduct: build.mutation<ProductDetail, ProductTarget & { body: ProductPatchRequest }>({
      query: ({ body, ...target }) => ({ url: productPath(target), method: 'PATCH', body }),
      transformResponse: parseProduct,
      invalidatesTags: (result, _error, { organizationId, productId }) =>
        result
          ? [
              { type: 'Product', id: productId },
              { type: 'Product', id: list(organizationId) },
            ]
          : [],
    }),
    deleteProduct: build.mutation<void, ProductTarget>({
      query: (target) => ({ url: productPath(target), method: 'DELETE' }),
      invalidatesTags: (_result, error, { organizationId }) =>
        error
          ? []
          : [
              { type: 'Product', id: list(organizationId) },
              { type: 'Category', id: list(organizationId) },
              { type: 'AddOnGroup', id: list(organizationId) },
            ],
    }),
    uploadProductImage: build.mutation<ProductDetail, ProductTarget & { file: File }>({
      query: ({ file, ...target }) => {
        const body = new FormData();
        body.append('file', file);
        return { url: `${productPath(target)}/image`, method: 'POST', body };
      },
      transformResponse: parseProduct,
      invalidatesTags: (result, _error, { organizationId, productId }) =>
        result
          ? [
              { type: 'Product', id: productId },
              { type: 'Product', id: list(organizationId) },
            ]
          : [],
    }),
    removeProductImage: build.mutation<ProductDetail, ProductTarget>({
      query: (target) => ({ url: `${productPath(target)}/image`, method: 'DELETE' }),
      transformResponse: parseProduct,
      invalidatesTags: (result, _error, { organizationId, productId }) =>
        result
          ? [
              { type: 'Product', id: productId },
              { type: 'Product', id: list(organizationId) },
            ]
          : [],
    }),
    listAddOnGroups: build.query<AddOnGroup[], string>({
      query: (organizationId) => `${menuPath(organizationId)}/add-on-groups`,
      transformResponse: (response: unknown) => addOnGroupListSchema.parse(response),
      providesTags: (result, _error, organizationId) => [
        { type: 'AddOnGroup', id: list(organizationId) },
        ...(result ?? []).map(({ id }) => ({ type: 'AddOnGroup' as const, id })),
      ],
    }),
    createAddOnGroup: build.mutation<
      AddOnGroup,
      { organizationId: string; body: AddOnGroupUpsertRequest }
    >({
      query: ({ organizationId, body }) => ({
        url: `${menuPath(organizationId)}/add-on-groups`,
        method: 'POST',
        body,
      }),
      transformResponse: parseAddOnGroup,
      invalidatesTags: (result, _error, { organizationId }) =>
        result ? [{ type: 'AddOnGroup', id: list(organizationId) }] : [],
    }),
    updateAddOnGroup: build.mutation<
      AddOnGroup,
      AddOnGroupTarget & { body: AddOnGroupUpsertRequest }
    >({
      query: ({ body, ...target }) => ({ url: addOnGroupPath(target), method: 'PUT', body }),
      transformResponse: parseAddOnGroup,
      invalidatesTags: (result, _error, { organizationId, groupId }) =>
        result
          ? [
              { type: 'AddOnGroup', id: groupId },
              { type: 'AddOnGroup', id: list(organizationId) },
              { type: 'Product', id: details(organizationId) },
            ]
          : [],
    }),
    deleteAddOnGroup: build.mutation<void, AddOnGroupTarget>({
      query: (target) => ({ url: addOnGroupPath(target), method: 'DELETE' }),
      invalidatesTags: (_result, error, { organizationId, groupId }) =>
        error
          ? []
          : [
              { type: 'AddOnGroup', id: groupId },
              { type: 'AddOnGroup', id: list(organizationId) },
              { type: 'Product', id: details(organizationId) },
            ],
    }),
  }),
});

export const {
  useListCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useReorderCategoriesMutation,
  useListProductsQuery,
  useGetProductQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  usePatchProductMutation,
  useDeleteProductMutation,
  useUploadProductImageMutation,
  useRemoveProductImageMutation,
  useListAddOnGroupsQuery,
  useCreateAddOnGroupMutation,
  useUpdateAddOnGroupMutation,
  useDeleteAddOnGroupMutation,
} = menuApi;
