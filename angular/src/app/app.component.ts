import { Component } from '@angular/core';
import { DynamicLayoutComponent } from '@abp/ng.core';
import { LoaderBarComponent } from '@abp/ng.theme.shared';
import { EmailVerificationBannerComponent } from './shared/components/email-verification-banner.component';

@Component({
  selector: 'app-root',
  template: `
    <abp-loader-bar />
    <app-email-verification-banner />
    <abp-dynamic-layout />
  `,
  imports: [LoaderBarComponent, DynamicLayoutComponent, EmailVerificationBannerComponent],
})
export class AppComponent {}
