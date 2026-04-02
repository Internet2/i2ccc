export const authConfig = {
  domain: import.meta.env.VITE_COGNITO_DOMAIN as string,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
  redirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI as string,
  logoutUri: import.meta.env.VITE_COGNITO_LOGOUT_URI as string,
  scopes: 'openid email profile',
} as const;
