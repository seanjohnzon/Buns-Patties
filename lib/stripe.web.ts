// Web build never loads the native Stripe SDK (web is only used for the QR landing page).
import { createElement, Fragment, type PropsWithChildren } from 'react';
export function StripeProvider({ children }: PropsWithChildren<Record<string, unknown>>) { return createElement(Fragment, null, children); }
export function useStripe(): null { return null; }
