import { Injectable, signal, computed } from '@angular/core';

/**
 * Connection status enum representing the state of the real-time connection
 */
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

/**
 * Service to manage real-time connection status
 * This tracks the connection state and manages reconnection attempts with exponential backoff
 * Per spec: Exponential backoff (2s, 5s, 10s, 30s)
 */
@Injectable({
  providedIn: 'root'
})
export class ConnectionService {
  // Exponential backoff delays in milliseconds (per spec: 2s, 5s, 10s, 30s)
  private readonly BACKOFF_DELAYS = [2000, 5000, 10000, 30000];

  // Connection status signals
  private _status = signal<ConnectionStatus>('connected');
  private _reconnectAttempt = signal(0);
  private _nextReconnectIn = signal(0);
  private _isReconnecting = signal(false);

  // Public readonly signals
  readonly status = this._status.asReadonly();
  readonly reconnectAttempt = this._reconnectAttempt.asReadonly();
  readonly nextReconnectIn = this._nextReconnectIn.asReadonly();
  readonly isReconnecting = this._isReconnecting.asReadonly();

  // Computed signals
  readonly isConnected = computed(() => this._status() === 'connected');
  readonly isDisconnected = computed(() => this._status() === 'disconnected');
  readonly isConnecting = computed(() => this._status() === 'connecting');

  // Internal state
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Set up online/offline event listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());

      // Check initial status
      if (!navigator.onLine) {
        this.setDisconnected();
      }
    }
  }

  /**
   * Manually set connection status to connected
   */
  setConnected(): void {
    this.clearTimers();
    this._status.set('connected');
    this._reconnectAttempt.set(0);
    this._nextReconnectIn.set(0);
    this._isReconnecting.set(false);
    console.log('[Connection] Status: Connected');
  }

  /**
   * Manually set connection status to disconnected
   * This starts the reconnection process with exponential backoff
   */
  setDisconnected(): void {
    if (this._status() === 'disconnected') {
      return; // Already disconnected
    }

    this._status.set('disconnected');
    this._isReconnecting.set(true);
    console.log('[Connection] Status: Disconnected');

    // Start reconnection attempts
    this.scheduleReconnect();
  }

  /**
   * Set connection status to connecting (during reconnection attempt)
   */
  setConnecting(): void {
    this._status.set('connecting');
    console.log('[Connection] Status: Connecting...');
  }

  /**
   * Handle browser online event
   */
  private handleOnline(): void {
    console.log('[Connection] Browser online event detected');
    this.attemptReconnect();
  }

  /**
   * Handle browser offline event
   */
  private handleOffline(): void {
    console.log('[Connection] Browser offline event detected');
    this.setDisconnected();
  }

  /**
   * Schedule the next reconnection attempt using exponential backoff
   */
  private scheduleReconnect(): void {
    this.clearTimers();

    const attempt = this._reconnectAttempt();
    const delayIndex = Math.min(attempt, this.BACKOFF_DELAYS.length - 1);
    const delay = this.BACKOFF_DELAYS[delayIndex];

    console.log(`[Connection] Scheduling reconnect attempt ${attempt + 1} in ${delay}ms`);

    // Set countdown
    this._nextReconnectIn.set(Math.ceil(delay / 1000));

    // Start countdown timer (update every second)
    this.countdownTimer = setInterval(() => {
      const current = this._nextReconnectIn();
      if (current > 0) {
        this._nextReconnectIn.set(current - 1);
      }
    }, 1000);

    // Schedule reconnection attempt
    this.reconnectTimer = setTimeout(() => {
      this.attemptReconnect();
    }, delay);
  }

  /**
   * Attempt to reconnect
   * In a real implementation, this would try to reconnect to SignalR
   */
  private attemptReconnect(): void {
    if (this._status() === 'connected') {
      return;
    }

    // In test mode with persistent disconnect, don't attempt reconnect
    if (this._testMode) {
      console.log('[Connection] Test mode active - skipping auto-reconnect');
      return;
    }

    this.clearTimers();
    this.setConnecting();
    this._reconnectAttempt.update(n => n + 1);

    console.log(`[Connection] Attempting reconnect (attempt ${this._reconnectAttempt()})`);

    // Check if browser is online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      // Simulate successful reconnection after online check
      // In real implementation, this would try to reconnect to SignalR hub
      setTimeout(() => {
        this.setConnected();
      }, 500);
    } else {
      // Browser still offline, schedule another attempt
      setTimeout(() => {
        this._status.set('disconnected');
        this.scheduleReconnect();
      }, 1000);
    }
  }

  /**
   * Manually trigger a reconnection attempt
   */
  tryReconnect(): void {
    console.log('[Connection] Manual reconnection requested');
    this._reconnectAttempt.set(0); // Reset attempts on manual reconnect
    this.attemptReconnect();
  }

  // Flag to disable auto-reconnect during testing
  private _testMode = false;

  /**
   * Simulate a disconnection (for testing purposes)
   * @param persistent If true, prevents auto-reconnect (for UI testing)
   */
  simulateDisconnect(persistent: boolean = false): void {
    console.log('[Connection] Simulating disconnection' + (persistent ? ' (persistent)' : ''));
    this._testMode = persistent;
    this.setDisconnected();
  }

  /**
   * Simulate a reconnection (for testing purposes)
   */
  simulateReconnect(): void {
    console.log('[Connection] Simulating reconnection');
    this._testMode = false; // Clear test mode on reconnect
    this.setConnected();
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  /**
   * Cleanup on destroy
   */
  ngOnDestroy(): void {
    this.clearTimers();
  }
}
