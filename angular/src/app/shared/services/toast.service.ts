import { Injectable, signal } from '@angular/core';

/**
 * Toast message types
 */
export type ToastType = 'success' | 'error' | 'info' | 'warning';

/**
 * Toast message interface
 */
export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // milliseconds, undefined = manual dismiss
  action?: {
    label: string;
    callback: () => void;
  };
}

/**
 * ToastService
 *
 * Simple toast notification service for displaying success/error messages.
 * Per spec (notifications):
 * - Toast: User joined board (subtle, 3s auto-dismiss)
 * - Toast: User left board (subtle, 3s auto-dismiss)
 * - Toast: Generation complete (with "View" button, 5s)
 * - Toast: Generation failed (stays until dismissed)
 * - Toast: Code copied (success, 2s)
 * - Banner: Back online (success, auto-dismiss)
 */
@Injectable({
  providedIn: 'root'
})
export class ToastService {
  // Active toasts
  private _toasts = signal<ToastMessage[]>([]);
  readonly toasts = this._toasts.asReadonly();

  // Default durations (ms)
  private readonly DEFAULT_DURATION = 3000; // 3 seconds per spec
  private readonly SUCCESS_DURATION = 2000; // 2 seconds for success
  private readonly ERROR_DURATION = 0; // 0 = manual dismiss
  private readonly BACK_ONLINE_DURATION = 3000; // 3 seconds for back online

  /**
   * Show a success toast
   */
  success(message: string, duration?: number): void {
    this.show({
      id: this.generateId(),
      type: 'success',
      message,
      duration: duration ?? this.SUCCESS_DURATION
    });
  }

  /**
   * Show an error toast (persists until dismissed)
   */
  error(message: string, duration?: number): void {
    this.show({
      id: this.generateId(),
      type: 'error',
      message,
      duration: duration ?? this.ERROR_DURATION
    });
  }

  /**
   * Show an info toast
   */
  info(message: string, duration?: number): void {
    this.show({
      id: this.generateId(),
      type: 'info',
      message,
      duration: duration ?? this.DEFAULT_DURATION
    });
  }

  /**
   * Show a warning toast
   */
  warning(message: string, duration?: number): void {
    this.show({
      id: this.generateId(),
      type: 'warning',
      message,
      duration: duration ?? this.DEFAULT_DURATION
    });
  }

  /**
   * Show a "Back online" success toast
   * Per spec: "Back online" success toast appears when connection is restored
   */
  showBackOnline(): void {
    this.show({
      id: this.generateId(),
      type: 'success',
      message: 'Back online',
      duration: this.BACK_ONLINE_DURATION
    });
  }

  /**
   * Show a toast with custom configuration
   */
  show(toast: ToastMessage): void {
    this._toasts.update(toasts => [...toasts, toast]);

    // Auto-dismiss if duration is set
    if (toast.duration && toast.duration > 0) {
      setTimeout(() => {
        this.dismiss(toast.id);
      }, toast.duration);
    }

    console.log(`[Toast] Showing: ${toast.type} - ${toast.message}`);
  }

  /**
   * Dismiss a toast by ID
   */
  dismiss(id: string): void {
    this._toasts.update(toasts => toasts.filter(t => t.id !== id));
  }

  /**
   * Dismiss all toasts
   */
  dismissAll(): void {
    this._toasts.set([]);
  }

  /**
   * Generate unique toast ID
   */
  private generateId(): string {
    return `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
