import { authGuard, permissionGuard } from '@abp/ng.core';
import { Routes } from '@angular/router';

export const APP_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./home/home.component').then(c => c.HomeComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(c => c.DashboardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'canvas/:id',
    loadComponent: () => import('./canvas/canvas.component').then(c => c.CanvasComponent),
    // No authGuard - allows both authenticated users and guests with valid session
  },
  {
    path: 'join/:shareToken',
    loadComponent: () => import('./join/join-preview.component').then(c => c.JoinPreviewComponent),
    // No authGuard - must be accessible to guests
  },
  {
    path: 'account/confirm-email',
    loadComponent: () => import('./account/confirm-email.component').then(c => c.ConfirmEmailComponent),
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.component').then(c => c.SettingsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'account',
    loadChildren: () => import('@abp/ng.account').then(c => c.createRoutes()),
  },
  {
    path: 'identity',
    loadChildren: () => import('@abp/ng.identity').then(c => c.createRoutes()),
  },
  {
    path: 'setting-management',
    loadChildren: () => import('@abp/ng.setting-management').then(c => c.createRoutes()),
  },
];
