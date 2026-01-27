import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ConfigStateService } from '@abp/ng.core';

@Component({
  selector: 'app-confirm-email',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="confirm-email-container">
      <div class="card">
        <div class="card-body text-center">
          @if (loading) {
            <div class="spinner-border text-primary mb-3" role="status">
              <span class="visually-hidden">Verifying...</span>
            </div>
            <h4>Verifying your email...</h4>
            <p class="text-muted">Please wait while we confirm your email address.</p>
          }

          @if (success) {
            <div class="success-icon mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor" class="text-success" viewBox="0 0 16 16">
                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
              </svg>
            </div>
            <h4 class="text-success">Email Verified!</h4>
            <p class="text-muted mb-4">Your email address has been successfully verified.</p>
            <a routerLink="/account/login" class="btn btn-primary">
              Continue to Login
            </a>
          }

          @if (error) {
            <div class="error-icon mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor" class="text-danger" viewBox="0 0 16 16">
                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z"/>
              </svg>
            </div>
            <h4 class="text-danger">Verification Failed</h4>
            <p class="text-muted mb-4">{{ errorMessage }}</p>
            <div class="d-flex gap-2 justify-content-center flex-wrap">
              <a routerLink="/account/login" class="btn btn-primary">
                Go to Login
              </a>
              <a routerLink="/account/register" class="btn btn-outline-secondary">
                Register Again
              </a>
            </div>
            <p class="text-muted small mt-3">
              You can request a new verification email after logging in.
            </p>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .confirm-email-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 1rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    .card {
      max-width: 450px;
      width: 100%;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      border-radius: 12px;
      border: none;
    }

    .card-body {
      padding: 3rem 2rem;
    }

    .success-icon, .error-icon {
      display: inline-block;
    }

    .spinner-border {
      width: 3rem;
      height: 3rem;
    }
  `]
})
export class ConfirmEmailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private configState = inject(ConfigStateService);

  loading = true;
  success = false;
  error = false;
  errorMessage = 'Unable to verify your email address.';

  ngOnInit(): void {
    const userId = this.route.snapshot.queryParamMap.get('userId');
    const token = this.route.snapshot.queryParamMap.get('token') ||
                  this.route.snapshot.queryParamMap.get('confirmationToken');

    if (!userId || !token) {
      this.showError('Invalid verification link. Missing required parameters.');
      return;
    }

    this.verifyEmail(userId, token);
  }

  private verifyEmail(userId: string, token: string): void {
    const apiUrl = this.configState.getDeep('environment.apis.default.url');

    // ABP Account module uses this endpoint for email verification
    this.http.post(`${apiUrl}/api/account/verify-email-confirmation-token`, {
      userId,
      token
    }).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
      },
      error: (err: HttpErrorResponse) => {
        console.error('Email verification failed:', err);
        let message = 'Unable to verify your email address.';

        if (err.error?.error?.message) {
          message = err.error.error.message;
        } else if (err.status === 400) {
          message = 'The verification link is invalid or has expired.';
        } else if (err.status === 404) {
          message = 'User not found. Please register again.';
        }

        this.showError(message);
      }
    });
  }

  private showError(message: string): void {
    this.loading = false;
    this.error = true;
    this.errorMessage = message;
  }
}
