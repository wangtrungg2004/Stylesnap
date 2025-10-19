// server/src/index.js
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

// === IMPORT CÁC ROUTE CỦA BẠN ===
import orderRoutes from "./routes/order.js";
import uploadsRouter from './routes/uploads.js';
import imgProxy from './routes/imgProxy.js';
// (Bạn có thể thêm các route khác nếu cần)

const app = express();

// === LỖI #3: BỎ KẾT NỐI SQL KHÔNG DÙNG ===
// Dòng này đang chạy và có thể làm crash server nếu thiếu ENV
// await getPool(); 
// Hãy comment (vô hiệu hóa) nó lại như trên

// Lấy CLIENT_ORIGIN từ biến môi trường Vercel
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// === SỬA LỖI CORS ===
// Phải dùng biến CLIENT_ORIGIN mà bạn đã set trên Vercel
app.use(cors({
  origin: CLIENT_ORIGIN, // <-- Sửa ở đây
  credentials: true // Có thể bạn sẽ cần cho các chức năng khác
}));

app.use(cookieParser());

// Tăng limit để nhận dataURL/ảnh
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// === ĐỊNH NGHĨA API ROUTES ===
app.use("/api/order", orderRoutes);
app.use('/api/uploads', uploadsRouter);
app.use('/api/img', imgProxy);

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, message: 'API is running' }));

// === LỖI NGHIÊM TRỌNG #2 ===
// XÓA TOÀN BỘ KHỐI LOGIC if(NODE_ENV)/else
// Vercel không cần logic đó, vercel.json đã xử lý việc này.

// === THÊM DÒNG NÀY ĐỂ VERCE HOẠT ĐỘNG ===
export default app;
