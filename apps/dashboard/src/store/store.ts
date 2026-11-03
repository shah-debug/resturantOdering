import {
  combineReducers,
  configureStore,
  createListenerMiddleware,
  isRejectedWithValue,
} from '@reduxjs/toolkit';
import { baseApi } from '@app/web/api';
import { dashboardApi } from '@/lib/api';

const rootReducer = combineReducers({
  [baseApi.reducerPath]: baseApi.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

const AUTH_ENDPOINTS = new Set([
  'me',
  'login',
  'logout',
  'logoutAll',
  'signup',
  'verifyEmail',
  'resendVerification',
  'forgotPassword',
  'resetPassword',
  'changePassword',
  'acceptInvitation',
]);

function endpointOf(action: { meta?: unknown }): string | null {
  const arg = (action.meta as { arg?: { endpointName?: unknown } } | undefined)?.arg;
  return typeof arg?.endpointName === 'string' ? arg.endpointName : null;
}

function statusOf(action: { payload?: unknown }): unknown {
  return (action.payload as { status?: unknown } | undefined)?.status;
}

function createSessionExpiryListener() {
  const listener = createListenerMiddleware();
  listener.startListening({
    predicate: (action) => {
      if (!isRejectedWithValue(action) || statusOf(action) !== 401) {
        return false;
      }
      const endpoint = endpointOf(action);
      return endpoint !== null && !AUTH_ENDPOINTS.has(endpoint);
    },
    effect: (_action, api) => {
      api.dispatch(dashboardApi.util.invalidateTags(['Me']));
    },
  });
  return listener.middleware;
}

export function makeStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware, createSessionExpiryListener()),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];
