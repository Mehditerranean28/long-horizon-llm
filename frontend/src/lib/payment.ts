import { createCheckoutSession as jsCreateCheckoutSession } from './payment-common.js';
import { logVerbose } from '@/monitoring/logger';

export interface CheckoutSessionResponse {
  url: string;
}

export async function createCheckoutSession(): Promise<CheckoutSessionResponse> {
  logVerbose('UI: initiating createCheckoutSession');
  const result = (await jsCreateCheckoutSession()) as CheckoutSessionResponse;
  logVerbose('UI: createCheckoutSession result', result);
  return result;
}
