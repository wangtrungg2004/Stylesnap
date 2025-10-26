// src/hooks/usePageTracking.jsx
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4';

const usePageTracking = () => {
  const location = useLocation();

  useEffect(() => {
    // Chỉ gửi khi ở môi trường production (đã deploy)
    if (import.meta.env.MODE === 'production') {
      // Gửi sự kiện pageview với đường dẫn mới
      ReactGA.send({ hitType: "pageview", page: location.pathname + location.search });
    }
  }, [location]); // Kích hoạt mỗi khi location thay đổi
};

export default usePageTracking;