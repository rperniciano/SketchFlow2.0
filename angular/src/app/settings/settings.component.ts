import { Component, inject, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserProfileService, UserProfileDto, UpdateUserProfileInput, UpdateUserProfileResultDto, ChangePasswordInput } from '../shared/services/user-profile.service';
import { AuthService } from '@abp/ng.core';

type SettingsTab = 'profile' | 'preferences' | 'security' | 'danger';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class SettingsComponent implements OnInit {
  private router = inject(Router);
  private userProfileService = inject(UserProfileService);
  private authService = inject(AuthService);

  // Tab state
  activeTab: SettingsTab = 'profile';

  // Loading state
  isLoading = true;
  isSaving = false;
  loadError: string | null = null;
  saveMessage: string | null = null;
  saveMessageType: 'success' | 'error' = 'success';

  // Password change state
  isChangingPassword = false;
  showPasswordForm = false;
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordMessage: string | null = null;
  passwordMessageType: 'success' | 'error' = 'success';

  // User profile data
  profile: UserProfileDto | null = null;

  // Form data (editable copy)
  displayName = '';
  surname = '';
  email = '';
  emailConfirmed = false;
  cursorColor = '#6366f1';
  defaultStrokeColor = '#000000';
  defaultStrokeThickness = 4;

  // Color palettes
  cursorColors = [
    '#6366f1', // Indigo (default)
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#ef4444', // Red
    '#f97316', // Orange
    '#f59e0b', // Amber
    '#eab308', // Yellow
    '#84cc16', // Lime
    '#22c55e', // Green
    '#14b8a6', // Teal
    '#06b6d4', // Cyan
    '#3b82f6'  // Blue
  ];

  strokeColors = [
    '#000000', // Black
    '#ffffff', // White
    '#6b7280', // Gray
    '#ef4444', // Red
    '#3b82f6', // Blue
    '#22c55e', // Green
    '#eab308', // Yellow
    '#a855f7'  // Purple
  ];

  strokeThicknesses = [
    { value: 2, label: 'Thin (2px)' },
    { value: 4, label: 'Medium (4px)' },
    { value: 8, label: 'Thick (8px)' }
  ];

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {
    this.isLoading = true;
    this.loadError = null;

    this.userProfileService.getCurrentUserProfile().subscribe({
      next: (profile) => {
        console.log('[Settings] Profile loaded:', profile);
        this.profile = profile;
        this.populateForm(profile);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('[Settings] Failed to load profile:', err);
        this.loadError = 'Failed to load profile. Please try again.';
        this.isLoading = false;
      }
    });
  }

  private populateForm(profile: UserProfileDto): void {
    this.displayName = profile.name || '';
    this.surname = profile.surname || '';
    this.email = profile.email || '';
    this.emailConfirmed = profile.emailConfirmed;
    this.cursorColor = profile.cursorColor || '#6366f1';
    this.defaultStrokeColor = profile.defaultStrokeColor || '#000000';
    this.defaultStrokeThickness = profile.defaultStrokeThickness || 4;
  }

  switchTab(tab: SettingsTab): void {
    this.activeTab = tab;
  }

  get fullName(): string {
    const parts = [this.displayName, this.surname].filter(p => p);
    return parts.join(' ') || 'User';
  }

  get initials(): string {
    const name = this.displayName || 'U';
    const surname = this.surname || '';
    return (name.charAt(0) + (surname.charAt(0) || '')).toUpperCase();
  }

  selectCursorColor(color: string): void {
    this.cursorColor = color;
  }

  selectStrokeColor(color: string): void {
    this.defaultStrokeColor = color;
  }

  selectStrokeThickness(thickness: number): void {
    this.defaultStrokeThickness = thickness;
  }

  resendVerificationEmail(): void {
    this.userProfileService.resendEmailVerification().subscribe({
      next: (result) => {
        if (result.success) {
          alert(result.message);
        } else {
          alert('Failed to send verification email. Please try again.');
        }
      },
      error: (err) => {
        console.error('[Settings] Failed to resend verification:', err);
        alert('Failed to send verification email. Please try again.');
      }
    });
  }

  /**
   * Saves the user profile to the backend.
   */
  saveProfile(): void {
    if (this.isSaving) {
      return;
    }

    this.isSaving = true;
    this.saveMessage = null;

    const input: UpdateUserProfileInput = {
      name: this.displayName,
      surname: this.surname,
      email: this.email,
      cursorColor: this.cursorColor,
      defaultStrokeColor: this.defaultStrokeColor,
      defaultStrokeThickness: this.defaultStrokeThickness
    };

    console.log('[Settings] Saving profile:', input);

    this.userProfileService.updateUserProfile(input).subscribe({
      next: (result) => {
        console.log('[Settings] Profile saved successfully:', result);
        this.profile = result.profile;
        this.isSaving = false;

        // Show appropriate message based on whether email was changed
        if (result.emailChanged && result.message) {
          this.saveMessage = result.message;
        } else {
          this.saveMessage = 'Profile saved successfully!';
        }
        this.saveMessageType = 'success';

        // Auto-hide success message after 5 seconds
        setTimeout(() => {
          if (this.saveMessage === 'Profile saved successfully!' || this.saveMessage === result.message) {
            this.saveMessage = null;
          }
        }, 5000);
      },
      error: (err) => {
        console.error('[Settings] Failed to save profile:', err);
        this.isSaving = false;
        this.saveMessage = 'Failed to save profile. Please try again.';
        this.saveMessageType = 'error';
      }
    });
  }

  /**
   * Checks if there are unsaved changes.
   */
  get hasChanges(): boolean {
    if (!this.profile) return false;
    return (
      this.displayName !== (this.profile.name || '') ||
      this.surname !== (this.profile.surname || '') ||
      this.email !== (this.profile.email || '') ||
      this.cursorColor !== (this.profile.cursorColor || '#6366f1') ||
      this.defaultStrokeColor !== (this.profile.defaultStrokeColor || '#000000') ||
      this.defaultStrokeThickness !== (this.profile.defaultStrokeThickness || 4)
    );
  }

  /**
   * Checks if the email has been changed from the original.
   */
  get emailChanged(): boolean {
    if (!this.profile) return false;
    return this.email !== (this.profile.email || '');
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  // Password change methods
  togglePasswordForm(): void {
    this.showPasswordForm = !this.showPasswordForm;
    if (!this.showPasswordForm) {
      this.resetPasswordForm();
    }
  }

  resetPasswordForm(): void {
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.passwordMessage = null;
    this.isChangingPassword = false;
  }

  get canSubmitPassword(): boolean {
    return (
      this.currentPassword.length > 0 &&
      this.newPassword.length >= 8 &&
      this.confirmPassword === this.newPassword &&
      !this.isChangingPassword
    );
  }

  get passwordStrength(): 'weak' | 'fair' | 'good' | 'strong' {
    const password = this.newPassword;
    if (!password) return 'weak';

    let score = 0;

    // Length checks
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;

    // Character variety
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    if (score <= 1) return 'weak';
    if (score <= 2) return 'fair';
    if (score <= 3) return 'good';
    return 'strong';
  }

  changePassword(): void {
    if (!this.canSubmitPassword) {
      return;
    }

    // Client-side validation
    if (this.newPassword.length < 8) {
      this.passwordMessage = 'Password must be at least 8 characters long.';
      this.passwordMessageType = 'error';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.passwordMessage = 'New password and confirmation do not match.';
      this.passwordMessageType = 'error';
      return;
    }

    this.isChangingPassword = true;
    this.passwordMessage = null;

    const input: ChangePasswordInput = {
      currentPassword: this.currentPassword,
      newPassword: this.newPassword,
      confirmPassword: this.confirmPassword
    };

    console.log('[Settings] Attempting to change password');

    this.userProfileService.changePassword(input).subscribe({
      next: (result) => {
        console.log('[Settings] Password change result:', result);
        this.isChangingPassword = false;

        if (result.success) {
          this.passwordMessage = result.message;
          this.passwordMessageType = 'success';
          // Clear the form after success
          this.currentPassword = '';
          this.newPassword = '';
          this.confirmPassword = '';

          // Auto-hide success message after 5 seconds
          setTimeout(() => {
            if (this.passwordMessage === result.message) {
              this.passwordMessage = null;
              this.showPasswordForm = false;
            }
          }, 5000);
        } else {
          this.passwordMessage = result.message;
          this.passwordMessageType = 'error';
        }
      },
      error: (err) => {
        console.error('[Settings] Failed to change password:', err);
        this.isChangingPassword = false;
        this.passwordMessage = err.error?.error?.message || 'Failed to change password. Please try again.';
        this.passwordMessageType = 'error';
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
