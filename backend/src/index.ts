import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config.js';
import invoiceRoutes from './routes/invoices.js';

const app = express();
app.use(cors());
app.use(express.json());

// 静态文件：发票图片
app.use('/uploads', express.static(config.uploadDir));

app.use('/api/invoices', invoiceRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(config.port, () => {
  console.log(`发票管理系统后端运行在 http://localhost:${config.port}`);
});
