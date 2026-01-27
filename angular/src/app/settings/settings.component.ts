import { Component, inject, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserProfileService, UserProfileDto, UpdateUserProfileInput } from '../shared/services/user-profile.service';

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

  // Tab state
  activeTab: SettingsTab = 'profile';

  // Loading state
  isLoading = true;
  isSaving = false;
  loadError: string | null = null;
  saveMessage: string | null = null;
  saveMessageType: 'success' | 'error' = 'success';

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
      cursorColor: this.cursorColor,
      defaultStrokeColor: this.defaultStrokeColor,
      defaultStrokeThickness: this.defaultStrokeThickness
    };

    console.log('[Settings] Saving profile:', input);

    this.userProfileService.updateUserProfile(input).subscribe({
      next: (updatedProfile) => {
        console.log('[Settings] Profile saved successfully:', updatedProfile);
        this.profile = updatedProfile;
        this.isSaving = false;
        this.saveMessage = 'Profile saved successfully!';
        this.saveMessageType = 'success';

        // Auto-hide success message after 5 seconds
        setTimeout(() => {
          if (this.saveMessage === 'Profile saved successfully!') {
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
      this.cursorColor !== (this.profile.cursorColor || '#6366f1') ||
      this.defaultStrokeColor !== (this.profile.defaultStrokeColor || '#000000') ||
      this.defaultStrokeThickness !== (this.profile.defaultStrokeThickness || 4)
    );
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
}
