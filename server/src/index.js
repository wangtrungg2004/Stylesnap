// server/src/index.js
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { getPool } from './db.js';

import orderRoutes from "./routes/order.js";
import uploadsRouter from './routes/uploads.js';
import imgProxy from './routes/imgProxy.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// mở kết nối DB sớm
await getPool();

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: 'https://stylesnap.vercel.app' // <-- THAY BẰNG DOMAIN WEBSITE CỦA BẠN
}));

// tăng limit để nhận dataURL preview
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
// API routes

app.use("/api/order", orderRoutes);
app.use('/api/uploads', uploadsRouter);
app.use('/api/img', imgProxy);

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------- SPA fallback ----------
if (process.env.NODE_ENV !== 'production') {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  app.use(vite.middlewares);

  app.get(/^(?!\/api\/).*/, async (req, res, next) => {
    try {
      const url = req.originalUrl;
      const html = await fs.readFile(path.resolve(process.cwd(), 'index.html'), 'utf8');
      const transformed = await vite.transformIndexHtml(url, html);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
    } catch (e) { vite.ssrFixStacktrace?.(e); next(e); }
  });
} else {
  const distDir = path.resolve(__dirname, '../../dist');
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(process.env.PORT || 3001, () => {
  console.log('Server is running');
});
