// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate, useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4'; // <-- TÍCH HỢP GA: Import
import './index.css';

import { NotifyProvider } from './store/notify';
import ToastContainer from './components/ToastContainer';

import Home from './pages/Home';
import CustomizePage from './pages/Customizer';

import Header from './components/Header';
import { AuthProvider, useAuth } from './store/auth';
import CheckoutPage from './pages/CheckoutPage';
import MyDesigns from './pages/MyDesigns'; 

// TÍCH HỢP GA: Import hook theo dõi trang
import usePageTracking from './hooks/usePageTracking'; 

// === TÍCH HỢP GA: KHỞI TẠO GOOGLE ANALYTICS ===
// Sử dụng Mã đo lường (Measurement ID) của bạn
// Chỉ khởi tạo khi ở môi trường production (deploy)
if (import.meta.env.MODE === 'production') {
  ReactGA.initialize('G-5WD8D9631M'); // <-- THAY THẾ BẰNG MÃ CỦA BẠN
  console.log('Google Analytics Initialized');
}
// ===============================================

function Protected({ children }) {
  const { user, booting } = useAuth();
  const location = useLocation();

  if (booting) {
    return (
      <div className="w-full h-screen grid place-items-center text-gray-500">
        Loading…
      </div>
    );
  }
  return children;
}

const AppLayout = ({ children }) => {
  // TÍCH HỢP GA: Gọi hook theo dõi chuyển trang
  usePageTracking();

  return (
    <div className="min-h-screen bg-white">
      <Header />
      {children}
    </div>
  );
};

const router = createBrowserRouter([
  { path: '/', element: <AppLayout><Home /></AppLayout> },
  { path: '/home', element: <AppLayout><Home /></AppLayout> },

  {
    path: '/customize',
    element: (
      <AppLayout>
        <Protected>
          <CustomizePage />
        </Protected>
      </AppLayout>
    ),
  },

  // ⬇️ trang danh sách mẫu thiết kế
  {
    path: '/designs',
    element: (
      <AppLayout>
        <Protected>
          <MyDesigns />
        </Protected>
      </AppLayout>
    ),
  },

  { path: '/checkout', element: <AppLayout><CheckoutPage /></AppLayout> },
  { path: '*', element: <Navigate to="/home" replace /> }
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NotifyProvider>
      <AuthProvider>
        <ToastContainer />
        <RouterProvider router={router} />
      </AuthProvider>
    </NotifyProvider>
  </React.StrictMode>
);