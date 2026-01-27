import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from '@abp/ng.core';

export interface UserProfileDto {
  id: string;
  userName: string;
  email: string;
  emailConfirmed: boolean;
  name: string;
  surname: string;
  phoneNumber: string;
  cursorColor: string;
  defaultStrokeColor: string;
  defaultStrokeThickness: number;
}

export interface UpdateUserProfileInput {
  name: string;
  surname: string;
  cursorColor: string;
  defaultStrokeColor: string;
  defaultStrokeThickness: number;
}

@Injectable({
  providedIn: 'root'
})
export class UserProfileService {
  private http = inject(HttpClient);
  private environment = inject(EnvironmentService);

  private get apiUrl(): string {
    return this.environment.getEnvironment()?.apis?.default?.url || '';
  }

  /**
   * Get the current user's profile information
   */
  getCurrentUserProfile(): Observable<UserProfileDto> {
    return this.http.get<UserProfileDto>(`${this.apiUrl}/api/app/user-profile/current-user-profile`);
  }

  /**
   * Update the current user's profile information
   */
  updateUserProfile(input: UpdateUserProfileInput): Observable<UserProfileDto> {
    return this.http.put<UserProfileDto>(
      `${this.apiUrl}/api/app/user-profile`,
      input
    );
  }

  /**
   * Resend email verification link
   */
  resendEmailVerification(): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.apiUrl}/api/app/user-profile/resend-email-verification`,
      {}
    );
  }
}
