import { Component, inject } from '@angular/core';
import { AuthService } from '@abp/ng.core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  imports: [CommonModule],
  standalone: true
})
export class HomeComponent {
  private authService = inject(AuthService);

  get hasLoggedIn(): boolean {
    return this.authService.isAuthenticated;
  }

  getStarted(): void {
    if (this.hasLoggedIn) {
      // Navigate to dashboard when implemented
      // For now, we'll just show they're logged in
      window.location.href = '/dashboard';
    } else {
      // Navigate to registration
      this.authService.navigateToLogin();
    }
  }

  login(): void {
    this.authService.navigateToLogin();
  }
}
