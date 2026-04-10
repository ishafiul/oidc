import { CallbackPage } from '@/pages/CallbackPage';
import { HomePage } from '@/pages/HomePage';
import { PermissionsPage } from '@/pages/PermissionsPage';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/callback" element={<CallbackPage />} />
        <Route path="/permissions" element={<PermissionsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
