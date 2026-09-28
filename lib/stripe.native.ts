// Expo Go doesn't ship Stripe's native module, so only require it in a dev-client / store build.
// In Expo Go the checkout button shows the demo alert instead.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { createElement, Fragment, type PropsWithChildren } from 'react';

const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const shim = {
  StripeProvider: ({ children }: PropsWithChildren<Record<string, unknown>>) => createElement(Fragment, null, children),
  useStripe: (): null => null,
};

const mod = inExpoGo ? shim : require('@stripe/stripe-react-native');
export const StripeProvider: typeof shim.StripeProvider = mod.StripeProvider;
export const useStripe: () => (ReturnType<typeof import('@stripe/stripe-react-native').useStripe> | null) = mod.useStripe;
