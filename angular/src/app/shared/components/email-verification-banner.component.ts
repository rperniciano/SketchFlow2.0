import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ConfigStateService, AuthService } from '@abp/ng.core';

/**
 * Banner component that displays a warning when the user's email is not verified.
 * Shows a "Resend verification email" button that triggers a new verification email.
 *
 * This banner should be included in the main app layout or dashboard to remind
 * unverified users to verify their email.
 */
@Component({
  selector: 'app-email-verification-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (showBanner()) {
      <div class="email-verification-banner" role="alert" aria-live="polite">
        <div class="banner-content">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="banner-icon" viewBox="0 0 16 16">
            <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
          </svg>
          <span class="banner-text">
            Your email address is not verified. Please check your inbox for the verification link.
          </span>
          <button
            class="resend-button"
            (click)="resendVerification()"
            [disabled]="sending()"
            type="button"
          >
            @if (sending()) {
              <span class="spinner"></span>
              Sending...
            } @else {
              Resend verification email
            }
          </button>
          <button
            class="dismiss-button"
            (click)="dismiss()"
            type="button"
            aria-label="Dismiss banner"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>

        @if (message()) {
          <div class="banner-message" [class.success]="isSuccess()" [class.error]="!isSuccess()">
            {{ message() }}
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .email-verification-banner {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #fff;
      padding: 0;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .banner-content {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      flex-wrap: wrap;
    }

    .banner-icon {
      flex-shrink: 0;
    }

    .banner-text {
      flex: 1;
      min-width: 200px;
    }

    .resend-button {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.4);
      color: #fff;
      padding: 6px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
    }

    .resend-button:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.3);
      border-color: rgba(255, 255, 255, 0.6);
    }

    .resend-button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .dismiss-button {
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.8);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .dismiss-button:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
    }

    .banner-message {
      padding: 8px 16px;
      font-size: 13px;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
    }

    .banner-message.success {
      background: rgba(16, 185, 129, 0.2);
    }

    .banner-message.error {
      background: rgba(239, 68, 68, 0.2);
    }

    @media (max-width: 768px) {
      .banner-content {
        padding: 10px 12px;
      }

      .banner-text {
        font-size: 13px;
      }

      .resend-button {
        width: 100%;
        justify-content: center;
        order: 3;
      }
    }
  `]
})
export class EmailVerificationBannerComponent implements OnInit {
  private http = inject(HttpClient);
  private configState = inject(ConfigStateService);
  private authService = inject(AuthService);

  // Signals for reactive state management
  sending = signal(false);
  message = signal('');
  isSuccess = signal(false);
  dismissed = signal(false);
  isEmailVerified = signal(true); // Default to true (no banner)
  userEmail = signal('');

  // Computed signal to determine if banner should show
  showBanner = computed(() => {
    return this.authService.isAuthenticated &&
           !this.isEmailVerified() &&
           !this.dismissed();
  });

  ngOnInit(): void {
    this.checkEmailVerificationStatus();
  }

  private checkEmailVerificationStatus(): void {
    if (!this.authService.isAuthenticated) {
      return;
    }

    // Check if dismissed in session storage first
    const dismissedKey = 'email_verification_banner_dismissed';
    const dismissedValue = sessionStorage.getItem(dismissedKey);
    if (dismissedValue === 'true') {
      this.dismissed.set(true);
    }

    // Get email from ABP's config state for immediate use
    const currentUser = this.configState.getOne('currentUser');
    if (currentUser) {
      this.userEmail.set(currentUser.email || '');
    }

    // Fetch email verification status from the UserProfile API
    // This is more reliable than checking JWT claims
    const apiUrl = this.configState.getDeep('environment.apis.default.url');
    this.http.get<{ emailConfirmed: boolean; email: string }>(`${apiUrl}/api/app/user-profile/current-user-profile`)
      .subscribe({
        next: (profile) => {
          this.isEmailVerified.set(profile.emailConfirmed);
          if (profile.email) {
            this.userEmail.set(profile.email);
          }
        },
        error: () => {
          // If API call fails, fall back to checking ABP's config state
          if (currentUser) {
            const emailVerified = (currentUser as any).emailVerified ??
                                 (currentUser as any)['email_verified'] ??
                                 false;
            this.isEmailVerified.set(emailVerified === true || emailVerified === 'true');
          }
        }
      });
  }

  resendVerification(): void {
    const email = this.userEmail();

    if (!email) {
      this.message.set('Unable to determine your email address. Please try logging out and back in.');
      this.isSuccess.set(false);
      return;
    }

    this.sending.set(true);
    this.message.set('');

    const apiUrl = this.configState.getDeep('environment.apis.default.url');

    this.http.post(`${apiUrl}/api/account/resend-email-verification`, { email })
      .subscribe({
        next: (response: any) => {
          this.sending.set(false);
          this.isSuccess.set(true);
          this.message.set(response?.message || 'Verification email sent! Please check your inbox.');

          // Clear message after 5 seconds
          setTimeout(() => {
            this.message.set('');
          }, 5000);
        },
        error: (err: HttpErrorResponse) => {
          this.sending.set(false);
          this.isSuccess.set(false);

          let errorMessage = 'Failed to send verification email. Please try again.';

          if (err.error?.error?.message) {
            errorMessage = err.error.error.message;
          } else if (err.status === 429) {
            errorMessage = 'Too many requests. Please wait a moment before trying again.';
          } else if (err.status === 0) {
            errorMessage = 'Network error. Please check your connection.';
          }

          this.message.set(errorMessage);
        }
      });
  }

  dismiss(): void {
    this.dismissed.set(true);
    // Store dismissal in session storage (resets on new session)
    sessionStorage.setItem('email_verification_banner_dismissed', 'true');
  }
}
