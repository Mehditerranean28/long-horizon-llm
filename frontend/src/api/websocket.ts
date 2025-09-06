// websocket-client.ts

// --- Imports ---
import { API_BASE_URL } from '@/constants/api';
import { logMetric, logError } from '@/monitoring/logger';

// --- Type Definitions ---

/**
 * Defines a union of known message types for compile-time safety.
 * Extend this enum with specific message types your application uses.
 */
export enum WebSocketMessageTypes {
  // Common types
  Ping = 'ping',
  Pong = 'pong',
  // Application-specific types (add more as needed)
  TaskUpdate = 'task-update',
  Notification = 'notification',
  // Authentication-related, if you have WS auth
  AuthRequest = 'auth-request',
  AuthResponse = 'auth-response',
  // NEW: Example for Batched messages
  Batch = 'batch',
  GovernorUpdate = 'governor-update',
}

// --- Specific Payload Interfaces (for type-safe send/subscribe overloads) ---
// You would define these based on your actual message structures.
// Example:
export interface TaskUpdatePayload {
  taskId: string;
  status: string;
  progress?: number;
  message?: string;
  // ... more task-specific fields
}

export interface GovernorUpdatePayload {
  correlation_id: string;
  event: string;
  [key: string]: any;
}

export interface AuthRequestPayload {
  token: string;
}

export interface AuthResponsePayload {
  success: boolean;
  message?: string;
  error?: string;
}

// If your server sends generic notifications:
export interface GenericNotificationPayload {
  title: string;
  body: string;
  severity: 'info' | 'warn' | 'error';
}

// NEW: Example for Batched Payload
export interface BatchedMessagesPayload {
  messages: NotificationMessage<unknown>[]; // An array of generic notification messages
}


// --- Generic Notification Message Interface ---
/**
 * Represents a generic message structure for WebSocket communication.
 * The 'type' property is now strictly typed using `WebSocketMessageTypes`.
 * @template T The type of the payload carried by the message.
 */
export interface NotificationMessage<T = unknown> { // Use unknown for generic payload type
  readonly type: WebSocketMessageTypes | string; // Allow string for unknown/future types, but prefer enum
  readonly payload?: T;
}


/**
 * Configuration options for the WebSocketService.
 */
export interface WebSocketServiceOptions {
  path?: string;             // Base path for notifications (default: '/notifications')
  reconnectAttempts?: number; // Max number of reconnect tries before giving up (default: Infinity)
  reconnectDelayMs?: number;  // Initial delay before reconnect (default: 1000ms)
  maxReconnectDelayMs?: number;// Cap for exponential backoff delay (default: 30000ms)
  heartbeatIntervalMs?: number;// Ping interval to keep connection alive (default: 30000ms)
  pongTimeoutMs?: number;    // Timeout after sending ping to expect a pong (default: 5000ms)
  
  // Error Recovery Hooks
  onReconnectAttempt?: (attempt: number, delay: number) => void; // Called before each reconnect attempt
  onMaxReconnectAttemptsReached?: () => void; // Called when max reconnects are hit
  
  // Message Schema Validation Hook
  validateIncomingMessage?: (data: unknown) => NotificationMessage;

  // NEW: Circuit Breaker Options
  circuitBreakerThreshold?: number; // Max failed reconnects before cool-off (default: 2)
  circuitBreakerWindowMs?: number;  // Time window for circuit breaker (default: 60000ms / 1 minute)
  circuitBreakerCoolOffMs?: number; // Duration of cool-off period (default: 300000ms / 5 minutes)
}

/**
 * Represents different states of the WebSocket connection.
 */
export enum WebSocketConnectionStatus {
  Connecting = 'CONNECTING',
  Open = 'OPEN',
  Closing = 'CLOSING',
  Closed = 'CLOSED',
  Reconnecting = 'RECONNECTING',
  Disconnected = 'DISCONNECTED', // Explicitly disconnected after max attempts or manual disconnect
  CircuitBroken = 'CIRCUIT_BROKEN', // NEW: Added status for circuit breaker
}

// --- Custom Events for Status Changes & Metrics ---
// These allow UI components or telemetry systems to react to WS status changes.
export const WEBSOCKET_STATUS_CHANGE_EVENT = 'websocket:status-change';
export const WEBSOCKET_RECONNECT_ATTEMPT_EVENT = 'websocket:reconnect-attempt';
export const WEBSOCKET_MAX_RECONNECTS_EVENT = 'websocket:max-reconnects-reached';
export const WEBSOCKET_MESSAGE_RECEIVED_EVENT = 'websocket:message-received'; // For generic logging/telemetry
export const WEBSOCKET_MESSAGE_SENT_EVENT = 'websocket:message-sent';     // For generic logging/telemetry
export const WEBSOCKET_CIRCUIT_BREAKER_OPEN_EVENT = 'websocket:circuit-breaker-open'; // NEW


// --- WebSocket Service Class ---

/**
 * A robust WebSocket client service with auto-reconnect,
 * typed message handling, event dispatching, and heartbeat functionality.
 */
export class WebSocketService {
  // SonarQube: Mark as readonly where never reassigned
  private readonly wsUrl: string;
  private readonly messageListeners = new Map<WebSocketMessageTypes | string, Set<(msg: NotificationMessage) => void>>();
  private readonly options: Required<WebSocketServiceOptions>;
  
  // Event handlers for WebSocket
  private readonly onOpen = this.handleOpen.bind(this);
  private readonly onMessage = this.handleMessage.bind(this);
  private readonly onError = this.handleError.bind(this);
  private readonly onClose = this.handleClose.bind(this);


  private socket: WebSocket | null = null;
  private reconnectAttemptsCount = 0;
  private heartbeatTimer: number | null = null;
  private pongTimer: number | null = null;
  private currentStatus: WebSocketConnectionStatus = WebSocketConnectionStatus.Disconnected;
  private reconnectTimer: number | null = null;
  private outgoingMessageQueue: NotificationMessage[] = [];
  private outgoingRawQueue: string[] = [];

  // NEW: Circuit Breaker properties
  private failedReconnectsInWindow: { timestamp: number }[] = [];
  private circuitBreakerTimeout: number | null = null;


  /**
   * Initializes the WebSocketService.
   * @param apiBaseUrl The base URL for the API, used to construct the WebSocket URL.
   * @param options Configuration options for the service.
   */
  constructor(apiBaseUrl: string, options: WebSocketServiceOptions = {}) {
    this.options = {
      path: options.path ?? '/notifications',
      reconnectAttempts: options.reconnectAttempts ?? Infinity,
      reconnectDelayMs: options.reconnectDelayMs ?? 1000,
      maxReconnectDelayMs: options.maxReconnectDelayMs ?? 30000,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 30000,
      pongTimeoutMs: options.pongTimeoutMs ?? 5000,
      onReconnectAttempt: options.onReconnectAttempt ?? (() => {}),
      onMaxReconnectAttemptsReached: options.onMaxReconnectAttemptsReached ?? (() => {}),
      validateIncomingMessage: options.validateIncomingMessage ?? ((data: unknown) => data as NotificationMessage),
      circuitBreakerThreshold:
        options.circuitBreakerThreshold ??
        Number(process.env.NEXT_PUBLIC_WS_CIRCUIT_THRESHOLD ?? 2),
      circuitBreakerWindowMs:
        options.circuitBreakerWindowMs ??
        Number(process.env.NEXT_PUBLIC_WS_CIRCUIT_WINDOW_MS ?? 60000), // 1 minute
      circuitBreakerCoolOffMs:
        options.circuitBreakerCoolOffMs ??
        Number(process.env.NEXT_PUBLIC_WS_COOL_OFF_MS ?? 300000), // 5 minutes
    };

    this.wsUrl = this.buildWebSocketUrl(apiBaseUrl, this.options.path);
    this.setStatus(WebSocketConnectionStatus.Connecting);
    this.connect();

    // NEW: Window Lifecycle Cleanup & Visibility-Change Trigger
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  /**
   * Constructs the full WebSocket URL based on the API base URL and specified path.
   */
  private buildWebSocketUrl(apiBaseUrl: string, wsPath: string): string {
    if (/^https?:\/\//.test(apiBaseUrl)) {
      const url = new URL(apiBaseUrl);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = url.pathname.replace(/\/?$/, wsPath);
      return url.toString();
    }
    const { protocol, host } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    const basePath = apiBaseUrl.replace(/\/?$/, wsPath);
    return `${wsProtocol}//${host}${basePath}`;
  }

  /**
   * Initiates the WebSocket connection.
   * Clears any existing reconnect timers before connecting.
   */
  private connect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      logError('WebSocket is already open or connecting. Skipping new connection attempt.');
      return;
    }

    // NEW: Check circuit breaker state
    if (this.currentStatus === WebSocketConnectionStatus.CircuitBroken) {
      logError('WebSocket: Circuit breaker is open. Not attempting to connect.');
      return;
    }

    this.setStatus(WebSocketConnectionStatus.Connecting);
    this.socket = new WebSocket(this.wsUrl);

    this.socket.addEventListener('open', this.onOpen);
    this.socket.addEventListener('message', this.onMessage);
    this.socket.addEventListener('error', this.onError);
    this.socket.addEventListener('close', this.onClose);
  }

  /**
   * Handler for WebSocket 'open' event.
   */
  private handleOpen(): void {
    logMetric(`WebSocket: Connected to ${this.wsUrl}`);
    this.reconnectAttemptsCount = 0;
    this.failedReconnectsInWindow = []; // Reset circuit breaker counter on successful connect
    this.setStatus(WebSocketConnectionStatus.Open);
    this.startHeartbeat();
    this.flushOutgoingMessageQueue();
  }

  /**
   * Handler for WebSocket 'message' event.
   * Parses JSON messages, validates them, and dispatches to listeners.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      let msg: NotificationMessage;
      try {
        const parsedData: unknown = JSON.parse(event.data);
        msg = this.options.validateIncomingMessage(parsedData);
      } catch (validationError) {
        logError('WebSocket: Incoming message failed schema validation. Discarding.', { error: validationError, rawData: event.data });
        window.dispatchEvent(new CustomEvent('websocket:malformed-message', { detail: { error: validationError, rawData: event.data } }));
        return;
      }

      if (msg.type === WebSocketMessageTypes.Pong) {
        this.stopPongTimer();
        logMetric('WebSocket: Received heartbeat pong.');
        return;
      }

      const handlers = this.messageListeners.get(msg.type);
      if (handlers) {
        handlers.forEach(handler => handler(msg));
      } else {
        logMetric(`WebSocket: Received unhandled message type '${msg.type}':`, msg);
      }
      window.dispatchEvent(new CustomEvent(WEBSOCKET_MESSAGE_RECEIVED_EVENT, { detail: msg }));
    } catch (err) {
      logError('WebSocket: Failed to parse incoming message or unknown error.', { error: err, rawData: event.data });
    }
  }

  /**
   * Handler for WebSocket 'error' event.
   */
  private handleError(event: Event): void {
    logError('WebSocket: An error occurred.', event);
  }

  /**
   * Handler for WebSocket 'close' event.
   * Manages reconnect attempts with exponential backoff and jitter, and circuit breaker.
   */
  private handleClose(event: CloseEvent): void {
    this.stopHeartbeat();
    this.stopPongTimer();
    this.setStatus(WebSocketConnectionStatus.Closed);

    if (event.code === 1000) { // Normal closure
      logMetric(`WebSocket: Connection closed normally (Code: ${event.code}, Reason: '${event.reason || 'No reason provided'}').`);
      this.setStatus(WebSocketConnectionStatus.Disconnected);
      return;
    }
    
    logError(`WebSocket: Connection closed abnormally (Code: ${event.code}, Reason: '${event.reason || 'No reason provided'}').`);

    // NEW: Circuit Breaker Logic
    this.failedReconnectsInWindow.push({ timestamp: performance.now() });
    // Filter out old failures outside the window
    this.failedReconnectsInWindow = this.failedReconnectsInWindow.filter(
      (entry) => performance.now() - entry.timestamp < this.options.circuitBreakerWindowMs
    );

    if (this.failedReconnectsInWindow.length >= this.options.circuitBreakerThreshold) {
      this.setStatus(WebSocketConnectionStatus.CircuitBroken);
      logError(`WebSocket: Circuit breaker opened! ${this.failedReconnectsInWindow.length} failed reconnects in ${this.options.circuitBreakerWindowMs}ms. Pausing for ${this.options.circuitBreakerCoolOffMs}ms.`);
      window.dispatchEvent(new CustomEvent(WEBSOCKET_CIRCUIT_BREAKER_OPEN_EVENT, { detail: { failedAttempts: this.failedReconnectsInWindow.length } }));
      
      if (this.circuitBreakerTimeout) clearTimeout(this.circuitBreakerTimeout);
      this.circuitBreakerTimeout = window.setTimeout(() => {
        logMetric('WebSocket: Circuit breaker cool-off period ended. Attempting to reconnect.');
        this.failedReconnectsInWindow = []; // Reset counter
        this.connect(); // Try to connect again
      }, this.options.circuitBreakerCoolOffMs);
      return; // Do not attempt immediate reconnect if circuit is broken
    }


    if (this.reconnectAttemptsCount < this.options.reconnectAttempts) {
      const baseDelay = this.options.reconnectDelayMs * (2 ** this.reconnectAttemptsCount);
      const jitter = Math.random() * 0.5 + 0.75; // Between 0.75x and 1.25x
      const delay = Math.min(baseDelay * jitter, this.options.maxReconnectDelayMs);

      this.reconnectAttemptsCount++;
      logMetric(`WebSocket: Attempting reconnect in ${delay.toFixed(0)}ms (Attempt ${this.reconnectAttemptsCount}/${this.options.reconnectAttempts === Infinity ? '∞' : this.options.reconnectAttempts})...`);
      this.setStatus(WebSocketConnectionStatus.Reconnecting);
      
      this.options.onReconnectAttempt(this.reconnectAttemptsCount, delay);
      window.dispatchEvent(new CustomEvent(WEBSOCKET_RECONNECT_ATTEMPT_EVENT, { detail: { attempt: this.reconnectAttemptsCount, delay } }));

      this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
    } else {
      logError('WebSocket: Maximum reconnect attempts reached. Giving up on reconnection.');
      this.setStatus(WebSocketConnectionStatus.Disconnected);
      
      this.options.onMaxReconnectAttemptsReached();
      window.dispatchEvent(new CustomEvent(WEBSOCKET_MAX_RECONNECTS_EVENT));
    }
  }

  /**
   * Starts the heartbeat mechanism to keep the WebSocket connection alive.
   * Sends a 'ping' message at a configured interval and starts a pong timer.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.sendInternal({ type: WebSocketMessageTypes.Ping, payload: undefined });
        logMetric('WebSocket: Sent heartbeat ping.');
        this.startPongTimer();
      } else {
        this.stopHeartbeat();
      }
    }, this.options.heartbeatIntervalMs);
  }

  /**
   * Stops the active heartbeat timer.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logMetric('WebSocket: Heartbeat stopped.');
    }
  }

  /**
   * Starts a timer to expect a 'pong' message.
   * If the timer expires before a 'pong' is received, the connection is considered stale.
   */
  private startPongTimer(): void {
    this.stopPongTimer();
    this.pongTimer = window.setTimeout(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        logError(`WebSocket: Pong not received within ${this.options.pongTimeoutMs}ms. Proactively closing connection.`);
        this.socket.close(1001, 'No pong received'); // 1001: Going Away / Client initiated reload
      }
    }, this.options.pongTimeoutMs);
  }

  /**
   * Stops the pong timer. Called when a 'pong' message is received.
   */
  private stopPongTimer(): void {
    if (this.pongTimer !== null) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
      logMetric('WebSocket: Pong timer stopped.');
    }
  }

  /**
   * Updates the internal connection status and dispatches a global custom event.
   * @param status The new WebSocketConnectionStatus.
   */
  private setStatus(status: WebSocketConnectionStatus): void {
    if (this.currentStatus !== status) {
      logMetric(`WebSocket Status: ${this.currentStatus} -> ${status}`);
      this.currentStatus = status;
      window.dispatchEvent(new CustomEvent<WebSocketConnectionStatus>(WEBSOCKET_STATUS_CHANGE_EVENT, { detail: status }));
    }
  }

  /**
   * Adds messages to a queue if the socket is not open, or sends them immediately.
   */
  private queueOrSendMessage(msg: NotificationMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.sendInternal(msg);
    } else {
      this.outgoingMessageQueue.push(msg);
      logMetric('WebSocket: Message queued as socket is not open.', { queueSize: this.outgoingMessageQueue.length, message: msg });
    }
  }

  /**
   * Sends messages directly through the WebSocket.
   */
  private sendInternal(msg: NotificationMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(msg));
        logMetric('WebSocket: Sent message:', msg);
        window.dispatchEvent(new CustomEvent(WEBSOCKET_MESSAGE_SENT_EVENT, { detail: msg }));
      } catch (err) {
        logError('WebSocket: Failed to stringify or send message:', { error: err, message: msg });
      }
    } else {
      logError('WebSocket: Not open, cannot send message directly. Message was not queued as it came from direct sendInternal.', { currentStatus: this.currentStatus, message: msg });
    }
  }

  /**
   * Flushes the queue of outgoing messages. Called on successful connection.
   */
  private flushOutgoingMessageQueue(): void {
    if (this.outgoingMessageQueue.length > 0 && this.socket?.readyState === WebSocket.OPEN) {
      logMetric(`WebSocket: Flushing ${this.outgoingMessageQueue.length} queued messages.`);
      while (this.outgoingMessageQueue.length > 0) {
        const msg = this.outgoingMessageQueue.shift();
        if (msg) {
          this.sendInternal(msg);
        }
      }
    }
    if (this.outgoingRawQueue.length > 0 && this.socket?.readyState === WebSocket.OPEN) {
      while (this.outgoingRawQueue.length > 0) {
        const raw = this.outgoingRawQueue.shift();
        if (raw) {
          this.socket.send(raw);
        }
      }
    }
  }

  // NEW: Window Lifecycle and Visibility Handlers
  private readonly handleBeforeUnload = (): void => {
    // Attempt a normal disconnect on page unload to clean up resources
    logMetric('WebSocket: Disconnecting on page unload.');
    this.disconnect(1000, 'Page unloading');
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && this.currentStatus === WebSocketConnectionStatus.Closed) {
      // If the tab becomes visible and the socket is closed (possibly silently dropped by browser)
      logMetric('WebSocket: Tab became visible and connection was closed. Attempting reconnect.');
      this.connect(); // Force a reconnect attempt
    }
  };

  // --- Public API ---

  /**
   * Returns the current status of the WebSocket connection.
   * @returns The current WebSocketConnectionStatus.
   */
  public getStatus(): WebSocketConnectionStatus {
    return this.currentStatus;
  }

  /**
   * NEW: Overloaded `subscribe` signatures for compile-time type inference.
   * Subscribe to specific message types with automatically typed handlers.
   */
  public subscribe(type: WebSocketMessageTypes.TaskUpdate, handler: (msg: NotificationMessage<TaskUpdatePayload>) => void): () => void;
  public subscribe(type: WebSocketMessageTypes.Notification, handler: (msg: NotificationMessage<GenericNotificationPayload>) => void): () => void;
  public subscribe(type: WebSocketMessageTypes.AuthResponse, handler: (msg: NotificationMessage<AuthResponsePayload>) => void): () => void;
  public subscribe(type: WebSocketMessageTypes.Batch, handler: (msg: NotificationMessage<BatchedMessagesPayload>) => void): () => void;
  public subscribe(type: WebSocketMessageTypes.GovernorUpdate, handler: (msg: NotificationMessage<GovernorUpdatePayload>) => void): () => void;
  // Generic fallback for other types or string-based subscriptions
  public subscribe<T = unknown>(type: WebSocketMessageTypes | string, handler: (msg: NotificationMessage<T>) => void): () => void;

  /**
   * Subscribes a handler function to messages of a specific type.
   * @template T The expected payload type for this message type.
   * @param type The message type to listen for (from `WebSocketMessageTypes` enum).
   * @param handler A callback function that receives the typed NotificationMessage.
   * @returns A function to call to unsubscribe the handler.
   */
  public subscribe<T = unknown>(type: WebSocketMessageTypes | string, handler: (msg: NotificationMessage<T>) => void): () => void {
    if (!this.messageListeners.has(type)) {
      this.messageListeners.set(type, new Set());
    }
    const handlers = this.messageListeners.get(type)!;
    handlers.add(handler as (...args: any[]) => void);
    logMetric(`WebSocket: Subscribed to type '${type}'. Total handlers for type: ${handlers.size}`);

    return () => {
      handlers.delete(handler as (...args: any[]) => void);
      logMetric(`WebSocket: Unsubscribed from type '${type}'. Remaining handlers for type: ${handlers.size}`);
      if (handlers.size === 0) {
        this.messageListeners.delete(type);
      }
    };
  }

  /**
   * Overloaded `send` signatures for type-safe message dispatch.
   * This provides compile-time checks for specific message types and their payloads.
   */
  public send(msg: NotificationMessage<unknown>): void; // Generic fallback for any type
  public send(msg: { type: WebSocketMessageTypes.Ping; payload?: undefined }): void;
  public send(msg: { type: WebSocketMessageTypes.Pong; payload?: undefined }): void;
  public send(msg: { type: WebSocketMessageTypes.TaskUpdate; payload: TaskUpdatePayload }): void;
  public send(msg: { type: WebSocketMessageTypes.Notification; payload: GenericNotificationPayload }): void;
  public send(msg: { type: WebSocketMessageTypes.AuthRequest; payload: AuthRequestPayload }): void;
  public send(msg: { type: WebSocketMessageTypes.AuthResponse; payload: AuthResponsePayload }): void;
  public send(msg: { type: WebSocketMessageTypes.Batch; payload: BatchedMessagesPayload }): void;
  public send(msg: { type: WebSocketMessageTypes.GovernorUpdate; payload: GovernorUpdatePayload }): void;

  /**
   * Sends a typed message over the WebSocket connection.
   * Messages are queued if the socket is not open and sent when the connection is established.
   */
  public send(msg: NotificationMessage<unknown>): void {
    this.queueOrSendMessage(msg);
  }

  /**
   * Sends a raw text message over the WebSocket. Used for simple server commands.
   */
  public sendRaw(text: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(text);
    } else {
      this.outgoingRawQueue.push(text);
    }
  }

  /**
   * Manually closes the WebSocket connection.
   * Prevents further reconnect attempts and clears the message queue.
   * Also cleans up window event listeners to prevent memory leaks if the service is destroyed.
   * @param code A numeric status code indicating the reason for closure (default: 1000 for normal closure).
   * @param reason A human-readable string explaining the closure.
   */
  public disconnect(code: number = 1000, reason: string = 'Manual disconnect'): void {
    logMetric('WebSocket: Manually disconnecting...');
    this.reconnectAttemptsCount = this.options.reconnectAttempts; // Prevent further auto-reconnects
    this.stopHeartbeat();
    this.stopPongTimer();
    
    // Clear all pending timeouts/timers
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.circuitBreakerTimeout) clearTimeout(this.circuitBreakerTimeout);

    this.outgoingMessageQueue = []; // Clear queue on manual disconnect
    this.socket?.close(code, reason);
    this.setStatus(WebSocketConnectionStatus.Disconnected);

    // NEW: Clean up global event listeners on disconnect
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }
}

// --- Singleton Instance ---

let singletonWebSocketService: WebSocketService | null = null;

/**
 * Provides a singleton instance of the WebSocketService.
 * This function should be used to retrieve the WebSocket client for application use.
 * @param options Optional configuration to apply when the service is first initialized.
 * These options are only used for the *first* call that initializes the singleton.
 * @returns The singleton WebSocketService instance.
 */
export function getWebSocketService(options?: WebSocketServiceOptions): WebSocketService {
  if (!singletonWebSocketService) {
    singletonWebSocketService = new WebSocketService(API_BASE_URL, {
      reconnectAttempts: 3,
      ...options,
    });
  }
  return singletonWebSocketService;
}
