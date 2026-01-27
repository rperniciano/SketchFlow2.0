import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConnectionService, ConnectionStatus } from '../services/connection.service';

/**
 * Connection Lost Banner Component
 *
 * Displays a persistent banner at the top of the canvas when the real-time
 * connection is lost. Shows reconnection attempt information including:
 * - Current status (Disconnected/Reconnecting)
 * - Reconnection attempt count
 * - Time until next reconnection attempt
 *
 * Per spec:
 * - "Connection lost" banner with reconnection attempts
 * - Banner appears when real-time connection is lost
 * - Banner shows reconnection attempt info
 */
@Component({
  selector: 'app-connection-lost-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (showBanner()) {
      <div class="connection-lost-banner" role="alert" aria-live="assertive">
        <div class="banner-content">
          <!-- Status Icon -->
          <div class="status-icon" [class.connecting]="isConnecting()">
            @if (isConnecting()) {
              <!-- Spinning icon when reconnecting -->
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16" class="spinner">
                <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
                <path fill-rule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
              </svg>
            } @else {
              <!-- Warning icon when disconnected -->
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
              </svg>
            }
          </div>

          <!-- Status Text -->
          <div class="status-text">
            <span class="status-title">Connection lost</span>
            <span class="status-detail">
              @if (isConnecting()) {
                Attempting to reconnect...
              } @else if (nextReconnectIn() > 0) {
                Reconnecting in {{ nextReconnectIn() }}s (attempt {{ reconnectAttempt() }})
              } @else {
                Waiting to reconnect...
              }
            </span>
          </div>

          <!-- Retry Button -->
          <button
            class="retry-button"
            (click)="retryNow()"
            [disabled]="isConnecting()"
            type="button"
          >
            @if (isConnecting()) {
              <span class="button-spinner"></span>
              Reconnecting...
            } @else {
              Retry Now
            }
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    .connection-lost-banner {
      position: absolute;
      top: 0;
      left: 60px; /* Account for toolbar width */
      right: 0;
      z-index: 1000;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: #ffffff;
      padding: 0;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
      animation: slideDown 0.3s ease-out;
    }

    @keyframes slideDown {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .banner-content {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
    }

    .status-icon {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .status-icon.connecting svg {
      animation: spin 1s linear infinite;
    }

    .spinner {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .status-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .status-title {
      font-weight: 600;
      font-size: 14px;
    }

    .status-detail {
      font-size: 12px;
      opacity: 0.9;
    }

    .retry-button {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.4);
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
    }

    .retry-button:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.3);
      border-color: rgba(255, 255, 255, 0.6);
      transform: translateY(-1px);
    }

    .retry-button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .retry-button:focus {
      outline: none;
    }

    .retry-button:focus-visible {
      outline: 2px solid rgba(255, 255, 255, 0.8);
      outline-offset: 2px;
    }

    .button-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    /* Responsive adjustments */
    @media (max-width: 640px) {
      .connection-lost-banner {
        left: 0;
      }

      .banner-content {
        flex-wrap: wrap;
        padding: 10px 12px;
      }

      .status-text {
        flex: 1 1 100%;
        order: 2;
        margin-top: 8px;
      }

      .retry-button {
        margin-left: auto;
      }
    }
  `]
})
export class ConnectionLostBannerComponent {
  private connectionService = inject(ConnectionService);

  // Expose connection service signals
  readonly isConnecting = this.connectionService.isConnecting;
  readonly isDisconnected = this.connectionService.isDisconnected;
  readonly reconnectAttempt = this.connectionService.reconnectAttempt;
  readonly nextReconnectIn = this.connectionService.nextReconnectIn;

  // Computed: show banner when disconnected or connecting (but not when connected)
  readonly showBanner = computed(() => {
    return this.connectionService.isDisconnected() || this.connectionService.isConnecting();
  });

  /**
   * Trigger immediate reconnection attempt
   */
  retryNow(): void {
    this.connectionService.tryReconnect();
  }
}
