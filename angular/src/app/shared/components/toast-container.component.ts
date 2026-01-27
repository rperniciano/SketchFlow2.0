import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, ToastMessage } from '../services/toast.service';

/**
 * ToastContainerComponent
 *
 * Displays toast notifications in a fixed position container.
 * Per spec (notifications):
 * - Toasts appear at bottom-left of screen
 * - Auto-dismiss after specified duration
 * - Can be manually dismissed
 */
@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container" role="region" aria-label="Notifications">
      @for (toast of toasts(); track toast.id) {
        <div
          class="toast"
          [class.toast-success]="toast.type === 'success'"
          [class.toast-error]="toast.type === 'error'"
          [class.toast-info]="toast.type === 'info'"
          [class.toast-warning]="toast.type === 'warning'"
          role="alert"
        >
          <div class="toast-icon">
            @if (toast.type === 'success') {
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
              </svg>
            } @else if (toast.type === 'error') {
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
              </svg>
            } @else if (toast.type === 'warning') {
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
              </svg>
            } @else {
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
              </svg>
            }
          </div>
          <div class="toast-content">
            <span class="toast-message">{{ toast.message }}</span>
            @if (toast.action) {
              <button
                class="toast-action"
                (click)="toast.action.callback(); dismiss(toast.id)"
              >
                {{ toast.action.label }}
              </button>
            }
          </div>
          <button
            class="toast-dismiss"
            (click)="dismiss(toast.id)"
            aria-label="Dismiss notification"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: 20px;
      left: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 400px;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 10px;
      background: #1a1a25;
      color: #ffffff;
      box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(12px);
      animation: slideIn 0.3s ease-out;
      font-size: 14px;
    }

    @keyframes slideIn {
      from {
        transform: translateX(-100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    .toast-success {
      border-left: 4px solid #10b981;
    }

    .toast-success .toast-icon {
      color: #10b981;
    }

    .toast-error {
      border-left: 4px solid #ef4444;
    }

    .toast-error .toast-icon {
      color: #ef4444;
    }

    .toast-warning {
      border-left: 4px solid #f59e0b;
    }

    .toast-warning .toast-icon {
      color: #f59e0b;
    }

    .toast-info {
      border-left: 4px solid #6366f1;
    }

    .toast-info .toast-icon {
      color: #6366f1;
    }

    .toast-icon {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .toast-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .toast-message {
      font-weight: 500;
    }

    .toast-action {
      background: transparent;
      border: none;
      color: #6366f1;
      padding: 0;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      text-align: left;
      transition: color 0.2s ease;
    }

    .toast-action:hover {
      color: #8b5cf6;
    }

    .toast-dismiss {
      flex-shrink: 0;
      background: transparent;
      border: none;
      color: #71717a;
      padding: 4px;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .toast-dismiss:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.1);
    }

    /* Responsive */
    @media (max-width: 480px) {
      .toast-container {
        left: 12px;
        right: 12px;
        bottom: 12px;
        max-width: none;
      }
    }
  `]
})
export class ToastContainerComponent {
  private toastService = inject(ToastService);

  readonly toasts = this.toastService.toasts;

  dismiss(id: string): void {
    this.toastService.dismiss(id);
  }
}
