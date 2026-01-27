import { Component, inject, OnInit } from '@angular/core';
import { AuthService } from '@abp/ng.core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  imports: [CommonModule],
  standalone: true
})
export class HomeComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);

  get hasLoggedIn(): boolean {
    return this.authService.isAuthenticated;
  }

  ngOnInit(): void {
    // Redirect authenticated users to dashboard
    if (this.hasLoggedIn) {
      this.router.navigate(['/dashboard']);
    }
  }

  getStarted(): void {
    if (this.hasLoggedIn) {
      // Navigate to dashboard
      this.router.navigate(['/dashboard']);
    } else {
      // Navigate to registration
      this.authService.navigateToLogin();
    }
  }

  login(): void {
    this.authService.navigateToLogin();
  }
}
