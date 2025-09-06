// fetch-mock.js

/**
 * @fileoverview
 * A robust and flexible fetch mock module for Node.js testing environments.
 * This module allows queuing multiple responses, matching requests by URL (string or regex)
 * and HTTP method, and provides detailed logging for unmatched requests.
 * It aims to provide a high-fidelity mock of the standard Fetch API Response object.
 */

let originalFetch = null; // Stores the original global.fetch implementation
let requestQueue = [];    // Stores queued mock responses with optional matchers
let recordedCalls = [];   // Stores details of all fetch calls made while mocked
let defaultResponseConfig = createMockResponseConfig(); // Default fallback response

/**
 * Creates a standard mock response configuration.
 * @param {object} [options] - Options to configure the mock response.
 * @param {boolean} [options.ok=true] - Indicates if the response was successful (status in the 2xx range).
 * @param {number} [options.status=200] - The HTTP status code of the response.
 * @param {string} [options.statusText] - The HTTP status text (e.g., "OK", "Not Found"). Defaults based on status.
 * @param {object} [options.body={ message: 'OK' }] - The JSON body of the response.
 * @param {Error|null} [options.error=null] - An error to throw instead of returning a response (simulates network error).
 * @param {object} [options.headers={ 'Content-Type': 'application/json' }] - Response headers.
 * @returns {object} A standardized response configuration object.
 */
function createMockResponseConfig({
  ok,
  status = 200,
  statusText,
  body = { message: 'OK' },
  error = null,
  headers = { 'Content-Type': 'application/json' },
} = {}) {
  // Determine `ok` based on status if not explicitly provided
  const resolvedOk = typeof ok === 'boolean' ? ok : (status >= 200 && status < 300);
  const resolvedStatusText = statusText || (resolvedOk ? 'OK' : 'Error');

  return {
    ok: resolvedOk,
    status: status,
    statusText: resolvedStatusText,
    body: body,
    error: error,
    headers: new Headers(headers),
  };
}

/**
 * Sets the default response for any unmatched fetch requests.
 * This acts as a fallback if no specific mockResponse matches.
 * @param {object} [options] - Options for the default mock response.
 */
function setDefaultResponse(options) {
  defaultResponseConfig = createMockResponseConfig(options);
  console.log('FetchMock: Default response configured.');
}

/**
 * Mocks the next fetch request(s) with a specific response.
 * If a matcher is provided, the response will only be used if the request matches.
 * If no matcher, the response is queued and consumed by the next fetch call.
 *
 * @param {string|RegExp|object} matcher - Optional. A URL string, RegExp for URL,
 * or an object { url: string|RegExp, method: string }.
 * @param {object} responseOptions - Options to configure the mock response.
 * @returns {void}
 */
function mockResponse(matcher, responseOptions) {
  let config;
  let requestMatcher;

  // Handle flexible arguments: (responseOptions) or (matcher, responseOptions)
  if (arguments.length === 1 && typeof matcher === 'object' && !(matcher instanceof RegExp) && !matcher.url && !matcher.method) {
    // Only responseOptions provided, no matcher
    config = createMockResponseConfig(matcher);
    requestMatcher = {}; // No specific matcher, applies to next call
    console.log('FetchMock: Queuing next-call response.');
  } else {
    // Matcher and responseOptions provided
    config = createMockResponseConfig(responseOptions);
    if (typeof matcher === 'string' || matcher instanceof RegExp) {
      requestMatcher = { url: matcher };
    } else if (typeof matcher === 'object' && (matcher.url || matcher.method)) {
      requestMatcher = matcher;
    } else {
      console.warn('FetchMock: Invalid matcher provided. Queuing as a general response.');
      requestMatcher = {};
    }
    console.log(`FetchMock: Queuing response for matcher: ${JSON.stringify(requestMatcher)}`);
  }

  requestQueue.push({ matcher: requestMatcher, config });
}

/**
 * Checks if a given request (url, options) matches a mock matcher.
 * @param {string} requestUrl - The URL of the fetch request.
 * @param {object} requestOptions - The options (method, headers, body) of the fetch request.
 * @param {object} matcher - The matcher object from the requestQueue.
 * @returns {boolean} True if the request matches the matcher, false otherwise.
 */
function isRequestMatch(requestUrl, requestOptions, matcher) {
  if (matcher.url) {
    if (typeof matcher.url === 'string' && requestUrl !== matcher.url) {
      return false;
    }
    if (matcher.url instanceof RegExp && !matcher.url.test(requestUrl)) {
      return false;
    }
  }
  if (matcher.method) {
    const requestMethod = (requestOptions.method || 'GET').toUpperCase();
    if (requestMethod !== matcher.method.toUpperCase()) {
      return false;
    }
  }
  // Add more sophisticated matching logic here if needed (e.g., header, body content)
  return true;
}

/**
 * Installs the mock fetch implementation globally.
 * Stores the original fetch for later restoration.
 */
function install() {
  if (originalFetch) {
    console.warn('FetchMock: Already installed. Skipping re-installation.');
    return;
  }
  originalFetch = global.fetch; // Store the original fetch
  global.fetch = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    const callDetails = { url, opts, method, timestamp: Date.now() };
    recordedCalls.push(callDetails);
    console.log(`FetchMock: Intercepted fetch call: ${method} ${url}`);

    // Try to find a matching queued response
    const queueIndex = requestQueue.findIndex(item => isRequestMatch(url, opts, item.matcher));
    let responseToUse;

    if (queueIndex !== -1) {
      const matchedItem = requestQueue[queueIndex];
      responseToUse = matchedItem.config;
      // Remove matched item if it's a one-time mock (i.e., not a persistent mock)
      requestQueue.splice(queueIndex, 1);
      console.log(`FetchMock: Matched and consumed queued response for ${method} ${url}.`);
    } else {
      responseToUse = defaultResponseConfig;
      console.warn(`FetchMock: No specific mock found for ${method} ${url}. Using default response.`);
    }

    if (responseToUse.error) {
      console.error(`FetchMock: Throwing mocked error for ${method} ${url}:`, responseToUse.error.message);
      throw responseToUse.error;
    }

    // Create a mock Response object that mimics the real Fetch API Response
    const mockResponseObject = {
      ok: responseToUse.ok,
      status: responseToUse.status,
      statusText: responseToUse.statusText,
      headers: responseToUse.headers,
      url: url, // Mimic the response URL

      // Async methods for body consumption
      json: async () => responseToUse.body,
      text: async () => JSON.stringify(responseToUse.body),
      blob: async () => new Blob([JSON.stringify(responseToUse.body)], { type: 'application/json' }),
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(responseToUse.body)).buffer,
      formData: async () => { /* basic formData mock */ return new FormData(); },
      clone: () => ({ ...mockResponseObject }), // Basic clone
    };

    return mockResponseObject;
  };
  console.log('FetchMock: Installed global fetch mock.');
}

/**
 * Restores the original global fetch implementation.
 */
function restore() {
  if (originalFetch) {
    global.fetch = originalFetch;
    originalFetch = null;
    console.log('FetchMock: Restored original global fetch.');
  } else {
    console.warn('FetchMock: Not installed or already restored. Skipping restoration.');
  }
}

/**
 * Resets the mock state: clears queued responses, recorded calls, and resets default response.
 */
function reset() {
  requestQueue = [];
  recordedCalls = [];
  setDefaultResponse(); // Reset default response to initial state
  console.log('FetchMock: Mock state reset.');
}

/**
 * Returns a copy of all fetch calls recorded since the last reset.
 * @returns {Array<object>} An array of recorded fetch call details.
 */
function getCalls() {
  return [...recordedCalls]; // Return a shallow copy to prevent external modification
}

// --- Module Exports ---
function setResponse(opts) {
  mockResponse(opts);
}

module.exports = {
  install,
  restore,
  reset,
  setResponse,
  mockResponse,
  setDefaultResponse,
  getCalls,
};

// Initialize with a default response when the module is loaded
setDefaultResponse();
