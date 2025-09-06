'use strict';

const { API_BASE_URL } = require('./api-base.js');

const CHECKOUT_SESSION_ENDPOINT = '/create-checkout-session';
const HTTP_METHOD_POST = 'POST';
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};
const ERROR_PREFIX = 'Checkout session failed';

async function createCheckoutSession() {
  const url = `${API_BASE_URL}${CHECKOUT_SESSION_ENDPOINT}`;

  try {
    console.debug(`[Payment] POST ${url}`);
    const response = await fetch(url, {
      method: HTTP_METHOD_POST,
      headers: DEFAULT_HEADERS,
    });
    console.debug(`[Payment] Response status ${response.status}`);

    if (!response.ok) {
      let errorBody;
      try {
        errorBody = await response.json();
      } catch (jsonParseError) {
        // Explicitly log the jsonParseError to satisfy S2486 and for diagnostics.
        console.warn(`${ERROR_PREFIX}: Failed to parse error response as JSON (status: ${response.status}). Falling back to text. Parse Error:`, jsonParseError);
        errorBody = await response.text();
      }

      console.error(
        `${ERROR_PREFIX}: HTTP Status ${response.status}. Details:`,
        errorBody,
      );

      throw new Error(
        `${ERROR_PREFIX}: ${response.status}. Details: ${
          typeof errorBody === 'object' ? JSON.stringify(errorBody) : errorBody
        }`,
      );
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const unexpectedResponse = await response.text();
      console.error(`${ERROR_PREFIX}: Expected JSON response but received '${contentType}'. Raw body:`, unexpectedResponse);
      throw new Error(
        `${ERROR_PREFIX}: Unexpected content type: '${contentType}'.`,
      );
    }

    const data = await response.json();
    console.debug('[Payment] Parsed response', data);

    if (!data || (typeof data.url !== 'string' && typeof data.id !== 'string')) {
      console.error(`${ERROR_PREFIX}: Malformed response received. Expected 'url' or 'id'. Data:`, data);
      throw new Error(`${ERROR_PREFIX}: Malformed response from server.`);
    }

    return data;

  } catch (networkError) {
    console.error(
      `${ERROR_PREFIX}: Network or unhandled error during fetch.`,
      networkError,
    );
    if (
      networkError instanceof Error &&
      networkError.message.startsWith(ERROR_PREFIX)
    ) {
      throw networkError;
    }
    const errMsg = `${ERROR_PREFIX}: A network error occurred or response could not be processed. ${networkError.message}`;
    console.error(errMsg);
    throw new Error(errMsg);
  }
}

module.exports = { createCheckoutSession };