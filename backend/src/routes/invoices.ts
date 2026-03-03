import { Router, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getPool, type Invoice } from '../db.js';
import { recognizeInvoice } from '../ocr.js';
import { config } from '../config.js';

const router = Router();

const uploadDir = path.resolve(process.cwd(), config.uploadDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `invoice_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|bmp|webp)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('仅支持图片格式：jpg、jpeg、png、gif、bmp、webp'));
  },
});

// 上传并识别
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择图片文件' });
    const relativePath = path.basename(req.file.path);
    const ocrResult = await recognizeInvoice(req.file.path);
    const pool = await getPool();
    const [row] = await pool.execute(
      `INSERT INTO invoices (
        invoice_code, invoice_number, invoice_date,
        seller_name, seller_tax_id, buyer_name, buyer_tax_id,
        amount, tax_amount, total_amount, goods_name, image_path, raw_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ocrResult.invoice_code ?? null,
        ocrResult.invoice_number ?? null,
        ocrResult.invoice_date ?? null,
        ocrResult.seller_name ?? null,
        ocrResult.seller_tax_id ?? null,
        ocrResult.buyer_name ?? null,
        ocrResult.buyer_tax_id ?? null,
        ocrResult.amount ?? 0,
        ocrResult.tax_amount ?? 0,
        ocrResult.total_amount ?? 0,
        ocrResult.goods_name ?? null,
        relativePath,
        ocrResult.raw_text ?? null,
      ]
    );
    const insertId = (row as { insertId: number }).insertId;
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM invoices WHERE id = ?', [insertId]);
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// 查询（日期范围 + 模糊搜索）
router.get('/list', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, keyword } = req.query;
    const pool = await getPool();
    let sql = 'SELECT * FROM invoices WHERE 1=1';
    const params: (string | number)[] = [];
    if (startDate && typeof startDate === 'string') {
      sql += ' AND invoice_date >= ?';
      params.push(startDate);
    }
    if (endDate && typeof endDate === 'string') {
      sql += ' AND invoice_date <= ?';
      params.push(endDate);
    }
    if (keyword && typeof keyword === 'string' && keyword.trim()) {
      sql += ` AND (
        invoice_code LIKE ? OR invoice_number LIKE ? OR
        seller_name LIKE ? OR buyer_name LIKE ? OR goods_name LIKE ?
      )`;
      const like = `%${keyword.trim()}%`;
      params.push(like, like, like, like, like);
    }
    sql += ' ORDER BY invoice_date DESC, id DESC';
    const [rows] = await pool.execute<Invoice[]>(sql, params);
    res.json({ data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// 统计
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, keyword } = req.query;
    const pool = await getPool();
    let sql = 'SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE 1=1';
    const params: (string | number)[] = [];
    if (startDate && typeof startDate === 'string') {
      sql += ' AND invoice_date >= ?';
      params.push(startDate);
    }
    if (endDate && typeof endDate === 'string') {
      sql += ' AND invoice_date <= ?';
      params.push(endDate);
    }
    if (keyword && typeof keyword === 'string' && keyword.trim()) {
      sql += ` AND (
        invoice_code LIKE ? OR invoice_number LIKE ? OR
        seller_name LIKE ? OR buyer_name LIKE ? OR goods_name LIKE ?
      )`;
      const like = `%${keyword.trim()}%`;
      params.push(like, like, like, like, like);
    }
    const [rows] = await pool.execute<{ count: number; total: number }[]>(sql, params);
    const row = (rows as { count: number; total: string }[])[0];
    res.json({
      count: Number(row?.count ?? 0),
      totalAmount: Number(row?.total ?? 0),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// 获取单条详情（含图片 URL）
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const [rows] = await pool.execute<Invoice[]>('SELECT * FROM invoices WHERE id = ?', [id]);
    const invoice = rows[0];
    if (!invoice) return res.status(404).json({ error: '未找到发票' });
    res.json({ data: invoice });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

export default router;
