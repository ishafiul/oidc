import { LoginApp } from '@/login-app';
import { OidcAppRedirectBridge } from '@/oauth-app-redirect-bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Root() {
  const p = window.location.pathname.replace(/\/+$/, '') || '/';
  if (p === '/oauth-app-redirect') {
    return <OidcAppRedirectBridge />;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <LoginApp />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
