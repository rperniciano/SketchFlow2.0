import { Environment } from '@abp/ng.core';

const baseUrl = 'http://localhost:4200';

const oAuthConfig = {
  issuer: 'https://localhost:44325/',
  redirectUri: baseUrl,
  clientId: 'SketchFlow_App',
  responseType: 'code',
  scope: 'offline_access SketchFlow',
  requireHttps: false,
};

export const environment = {
  production: false,
  application: {
    baseUrl,
    name: 'SketchFlow',
  },
  oAuthConfig,
  apis: {
    default: {
      url: 'https://localhost:44325',
      rootNamespace: 'SketchFlow',
    },
    AbpAccountPublic: {
      url: oAuthConfig.issuer,
      rootNamespace: 'AbpAccountPublic',
    },
  },
} as Environment;
