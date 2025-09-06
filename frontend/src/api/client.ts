// backend-client.ts

/**
 * Represents the payload for creating a new task.
 */
export interface TaskCreatePayload {
  query: string;
  user_id?: string;
  callId?: string;
  priority?: string;
  proto_brain_name: string;
  timeout_seconds?: number;
  tokenBudget?: number;
  timeBudgetSeconds?: number;
  attachment_name?: string;
  attachment_type?: string;
  attachment_data_uri?: string;
  attachment_data_uri_chunks?: string[];
  tool?: string;
  model?: string;
  provider?: string;
}

/**
 * Represents the response received after creating a task.
 */
export interface TaskCreateResponse {
  task_id: string;
  status: string;
  queued?: boolean; // Indicates if the task was immediately queued
  correlation_id?: string;
}

/**
 * Represents the status details of a specific task.
 */
export interface TaskStatusResponse {
  task_id: string;
  status: string;
  date_submitted?: string;
  date_started?: string;
  date_finished?: string;
  result?: any; // The result can be any type depending on the task
  error?: string | null;
  error_details?: string | null;
}

export interface GovernorUpdate {
  correlation_id: string;
  event: string;
  [key: string]: any;
}

/**
 * Represents the payload for ingesting a document.
 */
export interface IngestPayload {
  attachment_name: string;
  attachment_type: string;
  attachment_data_uri?: string;
  attachment_data_uri_chunks?: string[];
  user_id?: string;
}

/**
 * Represents the response received after ingesting a document.
 */
export interface IngestResponse {
  status: string;
  output_dir?: string;
}

/**
 * Represents the authentication payload for user login/registration.
 */
export interface AuthPayload {
  username: string;
  password: string;
  email?: string;
}

/**
 * Represents the response received after successful user login.
 */
export interface LoginResponse {
  success: boolean;
  subscriptionStatus: "free" | "premium";
}

/**
 * Represents the response received after successful user registration.
 */
export interface RegisterResponse {
  success: boolean;
  userId: string;
  message?: string;
}

/**
 * Metadata captured during an HTTP fetch operation.
 */
interface FetchResponseMeta {
  status: number;
  headers: Headers;
  durationMs: number;
}

/**
 * Represents a successful API call result.
 */
interface ApiResultSuccess<T> {
  ok: true; // Explicitly true for type discrimination
  value: T;
  meta: FetchResponseMeta;
}

/**
 * Represents a failed API call result.
 */
interface ApiResultFailure {
  ok: false; // Explicitly false for type discrimination
  error: ApiError; // The custom error type for API failures
  meta?: FetchResponseMeta; // Optional meta, as network errors might not have a full response
}

/**
 * A discriminated union type for API operation results, ensuring type safety
 * when handling success or failure.
 */
export type ApiResult<T> = ApiResultSuccess<T> | ApiResultFailure;

// ---
// Imports (now omitting '.js' extensions, assuming compatible TS config/bundler)
// ---
import {
  API_BASE_URL,
  DEFAULT_API_TIMEOUT_MS,
  MAX_NETWORK_RETRIES,
  RETRY_DELAY_MS,
} from '@/constants/api';
import { getWebSocketService, WebSocketMessageTypes } from './websocket';
import {
  registerUser as jsRegisterUser,
  loginUser as jsLoginUser,
} from '@/lib/auth-common';
import { logMetric, logError, logVerbose } from '@/monitoring/logger';
import { v4 as uuidv4 } from 'uuid';

// ---
// Custom Error Class for Granular API Error Handling
// ---
class ApiError extends Error {
  public readonly status?: number;
  public readonly body?: any;
  public readonly isTimeout: boolean;
  public readonly isNetworkError: boolean;
  public readonly isAuthError: boolean;
  public readonly isSerializationError: boolean;
  public readonly originalError?: Error;

  constructor(
    message: string,
    options?: {
      status?: number;
      body?: any;
      isTimeout?: boolean;
      isNetworkError?: boolean;
      isAuthError?: boolean;
      isSerializationError?: boolean;
      originalError?: Error;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options?.status;
    this.body = options?.body;
    this.isTimeout = options?.isTimeout ?? false;
    this.isNetworkError = options?.isNetworkError ?? false;
    this.isAuthError = options?.isAuthError ?? false;
    this.isSerializationError = options?.isSerializationError ?? false;
    this.originalError = options?.originalError;
    // Restore prototype chain for `instanceof` checks (important after transpilation)
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// ---
// Immutable Result Type Implementation (for functional error handling)
// ---
/**
 * A robust Result type for encapsulating success (value) or failure (error) outcomes.
 * Ensures immutability and provides functional methods for transformation.
 */
class Result<T> {
  private constructor(
    public readonly ok: boolean,
    public readonly value: T | null,
    public readonly error: ApiError | null,
    public readonly meta: FetchResponseMeta | undefined, // `undefined` is correct for optional
  ) {
    Object.freeze(this); // Ensure immutability of the Result instance
  }

  /**
   * Creates a successful Result instance.
   * @param value The successful data.
   * @param meta Metadata about the successful HTTP response.
   * @returns A Result representing success.
   */
  public static success<U>(
    value: U,
    meta: FetchResponseMeta,
  ): ApiResultSuccess<U> {
    // Explicitly cast to ApiResultSuccess<U> to satisfy the discriminated union
    return new Result<U>(true, value, null, meta) as ApiResultSuccess<U>;
  }

  /**
   * Creates a failed Result instance.
   * @param error The ApiError object.
   * @param meta Optional metadata about the HTTP response (might be absent for network errors).
   * @returns A Result representing failure.
   */
  public static failure(
    error: ApiError,
    meta?: FetchResponseMeta,
  ): ApiResultFailure {
    // Explicitly cast to ApiResultFailure to satisfy the discriminated union
    return new Result<any>(false, null, error, meta) as ApiResultFailure;
  }

  /**
   * Applies a transformation function to the value if the Result is a success.
   * @param fn The function to apply.
   * @returns A new Result with the transformed value, or the original failure.
   */
  public map<U>(fn: (value: T) => U): ApiResult<U> {
    return this.ok
      ? Result.success(fn(this.value as T), this.meta as FetchResponseMeta)
      : (this as unknown as ApiResult<U>);
  }

  /**
   * Applies a transformation function to the error if the Result is a failure.
   * @param fn The function to apply.
   * @returns A new Result with the transformed error, or the original success.
   */
  public mapErr(fn: (error: ApiError) => ApiError): ApiResult<T> {
    return this.ok
      ? this
      : Result.failure(fn(this.error as ApiError), this.meta);
  }

  /**
   * Chains another operation that returns a Result if the current Result is a success.
   * @param fn The function returning another Result.
   * @returns The Result from the chained operation, or the original failure.
   */
  public andThen<U>(fn: (value: T) => ApiResult<U>): ApiResult<U> {
    return this.ok ? fn(this.value as T) : (this as unknown as ApiResult<U>);
  }

  /**
   * Extracts the value from a successful Result or throws the error from a failed Result.
   * Use with caution in application code, as it reintroduces exceptions.
   * @returns The successful value.
   * @throws {ApiError} If the result is a failure.
   */
  public unwrap(): T {
    if (this.ok) return this.value as T;
    throw this.error;
  }

  /**
   * Extracts the value or returns a default value if the Result is a failure.
   * @param defaultValue The value to return if the Result is a failure.
   * @returns The successful value or the default value.
   */
  public unwrapOr(defaultValue: T): T {
    return this.ok ? (this.value as T) : defaultValue;
  }
}

// ---
// Token Management (external dependency, pure function)
// ---
function getAuthToken(): string | null {
  return localStorage.getItem("sovereign_auth_token");
}

// ---
// Central HTTP Client Class for API Interactions
// ---
/**
 * `ApiClient` encapsulates all HTTP request logic, including header injection,
 * timeout handling, retry logic, global error handling (401/403), and metrics.
 */
class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  /**
   * Dynamically constructs request headers, including authorization token.
   * @returns HeadersInit object.
   */
  private _getDynamicHeaders(): HeadersInit {
    const headers: HeadersInit = { Accept: "application/json" };
    const token = getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Core request method: handles fetch, timeout, and basic metrics logging.
   * It returns the raw `Response` or throws an `ApiError` for network/timeout issues.
   * @param path The API endpoint path.
   * @param options Standard `fetch` options.
   * @param timeoutMs Timeout for the request in milliseconds.
   * @returns An object containing the Promise for the `Response` and an `abort` function.
   */
  private _request(
    path: string,
    options: RequestInit = {},
    timeoutMs: number = DEFAULT_API_TIMEOUT_MS,
  ): { promise: Promise<Response>; abort: () => void } {
    const url = `${this.baseURL}${path}`;
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    const startTime = performance.now(); // High-resolution timer for metrics

    logVerbose(
      `Request start: ${options.method || 'GET'} ${path}${options.body ? ' with body' : ''}`,
      options.body ?? ''
    );

    const promise = fetch(url, {
      ...options,
      headers: { ...this._getDynamicHeaders(), ...(options.headers || {}) },
      credentials: "include",
      signal: controller.signal,
    })
      .then((response) => {
        clearTimeout(timerId); // Clear timeout as request completed
        const durationMs = performance.now() - startTime;
        logMetric(
          `${options.method || 'GET'} ${path} - ${response.status} in ${durationMs.toFixed(2)}ms`,
        );
        logVerbose(
          `Response received: ${options.method || 'GET'} ${path} - ${response.status}`,
        );
        return response;
      })
      .catch((error) => {
        clearTimeout(timerId); // Clear timeout even on fetch error
        const durationMs = performance.now() - startTime;
        logError(
          `${options.method || 'GET'} ${path} - Network Error in ${durationMs.toFixed(2)}ms:`,
          error,
        );
        logVerbose(
          `Response error: ${options.method || 'GET'} ${path} - ${error}`,
        );
        if (error instanceof Error && error.name === "AbortError") {
          throw new ApiError(
            `Request to ${url} timed out after ${timeoutMs}ms.`,
            { isTimeout: true, isNetworkError: true },
          );
        }
        // Wrap any other network-related fetch errors into an ApiError
        throw new ApiError(
          `Network error for ${url}: ${error instanceof Error ? error.message : String(error)}`,
          {
            isNetworkError: true,
            originalError:
              error instanceof Error ? error : new Error(String(error)),
          },
        );
      });

    return { promise, abort: () => controller.abort() };
  }

  /**
   * Handles raw `Response` objects, parses JSON, checks status codes, and
   * dispatches global authentication events for 401/403.
   * Returns an `ApiResult` for precise error handling.
   * @param response The raw Fetch API Response object.
   * @param errorPrefix A string prefix for error messages.
   * @returns A Promise resolving to an `ApiResult` (either success or failure).
   */
  private async _handleApiResponse<T>(
    response: Response,
    errorPrefix: string,
  ): Promise<ApiResult<T>> {
    const responseMeta: FetchResponseMeta = {
      status: response.status,
      headers: response.headers,
      durationMs: 0, // Placeholder. Ideally, duration should come from _request.
    };

    if (!response.ok) {
      if (response.status === 401) {
        logError(
          'API Client: Unauthorized (401). Dispatching global auth:unauthorized event.',
        );
        window.dispatchEvent(
          new CustomEvent("auth:unauthorized", {
            detail: { path: response.url },
          }),
        );
        return Result.failure(
          new ApiError(`${errorPrefix}: Unauthorized.`, {
            status: 401,
            isAuthError: true,
          }),
          responseMeta,
        );
      }
      if (response.status === 403) {
        logError(
          'API Client: Forbidden (403). Dispatching global auth:forbidden event.',
        );
        window.dispatchEvent(
          new CustomEvent("auth:forbidden", { detail: { path: response.url } }),
        );
        return Result.failure(
          new ApiError(`${errorPrefix}: Forbidden.`, {
            status: 403,
            isAuthError: true,
          }),
          responseMeta,
        );
      }

      let errorBody: any;
      let rawText: string | null = null;
      try {
        rawText = await response.text(); // Read once
        errorBody = JSON.parse(rawText);
      } catch (jsonParseError) {
        if (!rawText) {
          try {
            rawText = await response.text();
          } catch {}
        }
        logError(
          `${errorPrefix}: Failed to parse error response as JSON (status: ${response.status}). Falling back to text. Parse Error:`,
          jsonParseError,
        );
        errorBody = rawText;
      }

      const errMsg =
        errorBody && typeof errorBody === "object" && "message" in errorBody
          ? String(errorBody.message)
          : `${errorPrefix}: Server responded with status ${response.status}`;

      return Result.failure(
        new ApiError(errMsg, { status: response.status, body: errorBody }),
        responseMeta,
      );
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const unexpectedResponse = await response.text();
      return Result.failure(
        new ApiError(
          `${errorPrefix}: Expected JSON response but received '${contentType}'. Raw: ${unexpectedResponse}`,
          {
            status: response.status,
            isSerializationError: true,
            body: unexpectedResponse,
          },
        ),
        responseMeta,
      );
    }

    try {
      const data: T = await response.json();
      // ### Runtime Schema Validation (Highly Recommended for Robustness) ###
      // If you're using a library like Zod, io-ts, or Yup:
      // try {
      //   const validatedData = YourSchema.parse(data);
      //   return Result.success(validatedData as T, responseMeta);
      // } catch (validationError) {
      //   throw new ApiError(`Response schema validation failed for ${errorPrefix}: ${validationError.message}`, { isSerializationError: true, originalError: validationError as Error });
      // }
      // For now, we trust the backend's type (or perform minimal checks).
      return Result.success(data, responseMeta);
    } catch (parseError) {
      return Result.failure(
        new ApiError(
          `${errorPrefix}: Failed to parse valid JSON response. ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          {
            status: response.status,
            isSerializationError: true,
            originalError:
              parseError instanceof Error
                ? parseError
                : new Error(String(parseError)),
          },
        ),
        responseMeta,
      );
    }
  }

  /**
   * Performs a GET request with automatic retry logic for transient network errors.
   * @param path The API endpoint path.
   * @param options Standard `fetch` options.
   * @returns An object containing a Promise for `ApiResult` and an `abort` function.
   */
  public get<T>(
    path: string,
    options?: RequestInit,
  ): { promise: Promise<ApiResult<T>>; abort: () => void } {
    let abortControllerForRetries: AbortController | undefined;

    const retryableGetPromise = (async (): Promise<ApiResult<T>> => {
      let currentRetries = 0;
      while (currentRetries < MAX_NETWORK_RETRIES) {
        try {
          // A new AbortController is created for each retry attempt
          abortControllerForRetries = new AbortController();
          const { promise: newRequestPromise } = this._request(path, {
            method: "GET",
            cache: "no-store",
            keepalive: true,
            signal: abortControllerForRetries.signal, // Link to the new controller
            ...options,
          });
          const response = await newRequestPromise;
          return await this._handleApiResponse<T>(response, `GET ${path}`);
        } catch (err) {
          // Retry only if the error is a transient network error or timeout
          if (
            err instanceof ApiError &&
            (err.isNetworkError || err.isTimeout)
          ) {
            currentRetries++;
            logError(
              `Transient network error on GET ${path} (Attempt ${currentRetries}/${MAX_NETWORK_RETRIES}):`,
              err.message,
            );
            if (currentRetries < MAX_NETWORK_RETRIES) {
              await new Promise((resolve) =>
                setTimeout(resolve, RETRY_DELAY_MS),
              );
            }
          } else {
            // Re-throw non-transient (e.g., HTTP 4xx/5xx) errors immediately
            return Result.failure(err as ApiError);
          }
        }
      }
      // If all retries fail, return a final failure result
      return Result.failure(
        new ApiError(
          `Failed to GET ${path} after ${MAX_NETWORK_RETRIES} network retries.`,
          { isNetworkError: true },
        ),
      );
    })();

    // The abort function must refer to the controller used in the *last* or *current* attempt
    // This is a subtle point. For retries, calling `abort` should ideally cancel the *currently active* fetch.
    // The `abortControllerForRetries` reference will update for each new attempt.
    return {
      promise: retryableGetPromise,
      abort: () => abortControllerForRetries?.abort(),
    };
  }

  /**
   * Performs a POST request (no automatic retries for POSTs by default,
   * as they might not be idempotent).
   * @param path The API endpoint path.
   * @param body The request body (will be stringified to JSON).
   * @param options Standard `fetch` options.
   * @returns An object containing a Promise for `ApiResult` and an `abort` function.
   */
  public post<T>(
    path: string,
    body: Object,
    options?: RequestInit,
  ): { promise: Promise<ApiResult<T>>; abort: () => void } {
    const { promise: rawPromise, abort } = this._request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store", // Avoid caching for POSTs
      keepalive: true, // Allow browser to send request even if page closes
      ...options,
    });

    const handledPromise = (async (): Promise<ApiResult<T>> => {
      try {
        const response = await rawPromise;
        return await this._handleApiResponse<T>(response, `POST ${path}`);
      } catch (err) {
        // Any error thrown by _request (network/timeout) is caught here
        return Result.failure(err as ApiError);
      }
    })();

    return { promise: handledPromise, abort };
  }

  public delete<T>(
    path: string,
    options?: RequestInit,
  ): { promise: Promise<ApiResult<T>>; abort: () => void } {
    const { promise: rawPromise, abort } = this._request(path, {
      method: "DELETE",
      cache: "no-store",
      keepalive: true,
      ...options,
    });

    const handledPromise = (async (): Promise<ApiResult<T>> => {
      try {
        const response = await rawPromise;
        return await this._handleApiResponse<T>(response, `DELETE ${path}`);
      } catch (err) {
        return Result.failure(err as ApiError);
      }
    })();

    return { promise: handledPromise, abort };
  }
}

// ---
// Global API Client Instance
// ---
export const api = new ApiClient(API_BASE_URL);

// ---
// Task Management Functions (now consuming the `ApiClient` with Result Type)
// ---
/**
 * Creates a new task on the backend.
 * @param payload The task creation payload.
 * @returns A Promise that resolves with the TaskCreateResponse, or rejects with an ApiError.
 */
export async function createTask(
  payload: TaskCreatePayload,
  correlationId?: string,
): Promise<TaskCreateResponse> {
  logMetric('API createTask', { callId: payload.callId });
  // 1️⃣ Generate a correlation ID so we can tie together WebSocket updates later.
  const cid = correlationId ?? uuidv4();

  // 2️⃣ Send the request body to /tasks on the Express server.
  const { promise } = api.post<TaskCreateResponse>("/tasks", payload, {
    headers: { "X-Correlation-ID": cid },
  });

  // 3️⃣ Await the Result object and unwrap on success (throws on failure).
  const result = await promise;
  const value = result.unwrap();
  logMetric('API createTask success', { taskId: value.task_id, correlationId: value.correlation_id });

  // 4️⃣ Some backends may not echo the correlation ID, so fill it in.
  if (!value.correlation_id) {
    value.correlation_id = cid;
  }
  return value;
}

/**
 * Ingests a document on the backend.
 * @param payload The ingest payload.
 * @returns A Promise that resolves with the IngestResponse, or rejects with an ApiError.
 */
export async function ingestDocument(
  payload: IngestPayload,
  correlationId?: string,
): Promise<IngestResponse> {
  logMetric('API ingestDocument');
  // POST the document payload to the Express server which forwards to the Python backend.
  const options = correlationId ? { headers: { 'X-Correlation-ID': correlationId } } : undefined;
  const { promise } = api.post<IngestResponse>("/ingest", payload, options);
  const result = await promise;
  const value = result.unwrap();
  logMetric('API ingestDocument success', { status: value.status });
  return value;
}

export interface IngestAudioPayload extends IngestPayload {
  source: "capture" | "upload";
}

export interface IngestAudioResponse {
  status: string;
  path?: string;
  source: string;
  correlation_id?: string;
}

export async function ingestAudio(
  payload: IngestAudioPayload,
  correlationId?: string,
): Promise<IngestAudioResponse> {
  logMetric('API ingestAudio');
  // Similar to ingestDocument but targets the /ingest/audio endpoint.
  const options = correlationId ? { headers: { 'X-Correlation-ID': correlationId } } : undefined;
  const { promise } = api.post<IngestAudioResponse>("/ingest/audio", payload, options);
  const result = await promise;
  const value = result.unwrap();
  logMetric('API ingestAudio success', { status: value.status, source: value.source });
  return value;
}

/**
 * Retrieves the status of a specific task.
 * @param taskId The ID of the task to retrieve.
 * @returns A Promise that resolves with the TaskStatusResponse, or rejects with an ApiError.
 */
export async function getTaskStatus(
  taskId: string,
): Promise<TaskStatusResponse> {
  logVerbose('API getTaskStatus', { taskId });
  // GET the latest state of a task from the server.
  const { promise } = api.get<TaskStatusResponse>(`/tasks/${taskId}`);
  const result = await promise;
  const value = result.unwrap();
  logVerbose('API getTaskStatus success', { status: value.status });
  return value;
}

export interface RunStatusResponse {
  correlation_id: string;
  status: string;
  resource_usage: { tokens: number; time_seconds: number; depth: number; breadth: number };
}

export async function getRunStatus(correlationId: string): Promise<RunStatusResponse> {
  logVerbose('API getRunStatus', { correlationId });
  // Query aggregated run metrics for a given correlation id.
  const { promise } = api.get<RunStatusResponse>(`/status/${correlationId}`);
  const result = await promise;
  const value = result.unwrap();
  logVerbose('API getRunStatus success', { status: value.status });
  return value;
}

export interface RunPipelineResponse {
  request_id: string;
  duration_ms: number;
  meta: Record<string, any>;
  plan: any;
  artifacts: string[];
  selected: string[];
  final: string;
}

export interface PipelineEvent {
  type: string;
  [key: string]: any;
}

export async function runPipeline(
  query: string,
  correlationId?: string,
): Promise<RunPipelineResponse> {
  if (!query || !query.trim()) {
    throw new ApiError('Query must be a non-empty string.', { status: 400 });
  }
  logMetric('API runPipeline');
  const options = correlationId
    ? { headers: { 'x-request-id': correlationId } }
    : undefined;
  const { promise } = api.post<RunPipelineResponse>(
    '/v1/run',
    { query },
    options,
  );
  const result = await promise;
  const value = result.unwrap();
  logMetric('API runPipeline success', {
    requestId: value.request_id,
    durationMs: value.duration_ms,
  });
  return value;
}

export async function runPipelineStream(
  query: string,
  onEvent: (ev: PipelineEvent) => void,
  correlationId?: string,
): Promise<void> {
  if (!query || !query.trim()) {
    throw new ApiError('Query must be a non-empty string.', { status: 400 });
  }
  logMetric('API runPipelineStream');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (correlationId) headers['x-request-id'] = correlationId;
  const res = await fetch(`${API_BASE_URL}/v1/run/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  if (!res.body) {
    throw new ApiError('Empty stream from backend', { status: res.status });
  }
  if (!res.ok) {
    throw new ApiError('Backend error', { status: res.status });
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      if (!part.trim()) continue;
      try {
        onEvent(JSON.parse(part));
      } catch (err) {
        logError('Failed to parse pipeline event', err as Error);
      }
    }
  }
  if (buf.trim()) {
    try {
      onEvent(JSON.parse(buf));
    } catch (err) {
      logError('Failed to parse trailing pipeline event', err as Error);
    }
  }
}

/**
 * Polls for task completion, with exponential backoff for polling interval.
 * @param taskId The ID of the task to wait for.
 * @param pollIntervalMs Initial polling interval in milliseconds.
 * @param timeoutMs Overall timeout for polling in milliseconds.
 * @returns A Promise that resolves with the final TaskStatusResponse once complete, or rejects if polling times out or encounters an unrecoverable error.
 */
export async function waitForTaskCompletion(
  taskId: string,
  pollIntervalMs: number = 1000,
  timeoutMs: number = 300000,
): Promise<TaskStatusResponse> {
  logMetric('API waitForTaskCompletion', { taskId });
  const start = performance.now();
  let interval = pollIntervalMs;
  const MAX_POLL_INTERVAL = 10000; // Cap the polling interval
  // Continuously poll the task status until it finishes or times out.

  while (performance.now() - start < timeoutMs) {
    try {
      const status = await getTaskStatus(taskId); // This uses `api.get` internally
      if (status.status === "finished" || status.status === "failed") {
        logMetric('API waitForTaskCompletion finished', { taskId, status: status.status });
        return status;
      }
    } catch (err) {
      // `getTaskStatus` unwraps the Result and throws an `ApiError` for API-level failures (e.g., 404, 500).
      // Network retries are handled internally by `api.get` before `getTaskStatus` even sees a response.
      logError(
        `Polling: Non-fatal error getting status for task ${taskId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
    // Exponential backoff with a cap
    interval = Math.min(interval * 1.5, MAX_POLL_INTERVAL);
  }
  throw new ApiError(
    `Task polling timed out after ${timeoutMs / 1000} seconds for task ${taskId}`,
    { isTimeout: true },
  );
}

// ---
// Authentication Functions
// ---
/**
 * Registers a new user via the Express backend.
 * @param payload The registration payload.
 */
export async function registerUser(
  payload: AuthPayload,
): Promise<RegisterResponse> {
  logMetric('API registerUser');
  // Delegates to the simpler JS helper which calls the Express /register route.
  const res = await jsRegisterUser(payload) as Promise<RegisterResponse>;
  logMetric('API registerUser success', { success: res.success });
  return res;
}

/**
 * Logs in a user via the Express backend.
 * @param payload The login payload.
 * @returns The backend response containing a success flag.
 */
export async function loginUser(payload: AuthPayload): Promise<LoginResponse> {
  logMetric('API loginUser');
  // Perform the login request and return the parsed response.
  const res = await jsLoginUser(payload) as Promise<LoginResponse>;
  logMetric('API loginUser success', { success: res.success });
  return res;
}

export async function clearHistory(): Promise<void> {
  logMetric('API clearHistory');
  // Issue a DELETE to remove all saved history for the current user.
  const { promise } = api.delete<{ success: boolean }>("/history");
  const result = await promise;
  result.unwrap();
  logMetric('API clearHistory success');
}

// ---
// WebSocket Task Updates (separate concern from HTTP client)
// ---
/**
 * Subscribes to real-time updates for a specific task via WebSocket.
 * @param taskId The ID of the task to subscribe to.
 * @param onUpdate Callback function for each update, receiving the latest TaskStatusResponse.
 * @returns A function to call to unsubscribe from updates and close the WebSocket connection.
 */
export function subscribeTaskUpdates(
  taskId: string,
  onUpdate: (status: TaskStatusResponse) => void,
): () => void {
  const ws = getWebSocketService();
  logMetric('API subscribeTaskUpdates', { taskId });
  // Listen for task-update messages and filter by task ID.
  const unsubscribe = ws.subscribe(WebSocketMessageTypes.TaskUpdate, (msg) => {
    const data = msg.payload as unknown as TaskStatusResponse;
    if (data && data.task_id === taskId) {
      onUpdate(data);
    }
  });
  return unsubscribe;
}

export function subscribeRunUpdates(
  correlationId: string,
  onUpdate: (update: GovernorUpdate) => void,
): () => void {
  const ws = getWebSocketService();
  logMetric('API subscribeRunUpdates', { correlationId });
  const unsubscribe = ws.subscribe(
    WebSocketMessageTypes.GovernorUpdate,
    (msg) => {
      const data = msg.payload as unknown as GovernorUpdate;
      if (data && data.correlation_id === correlationId) {
        onUpdate(data);
      }
    },
  );
  // Request that the backend start sending updates for this correlation ID.
  ws.sendRaw(`subscribe:${correlationId}`);
  return unsubscribe;
}
