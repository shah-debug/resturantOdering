import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { baseApi } from '@app/web/api';
import { cartSlice } from '@/features/cart/cart-slice';

const rootReducer = combineReducers({
  [baseApi.reducerPath]: baseApi.reducer,
  [cartSlice.name]: cartSlice.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

export function makeStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];
