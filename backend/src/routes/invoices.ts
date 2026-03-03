import { Router, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getPool, type Invoice } from '../db.js';
import { recognizeInvoice } from '../ocr.js';
import { pdfFirstPageToImage } from '../pdfToImage.js';
import { config } from '../config.js';

const router = Router();

/** 将 2024年04月25日、2024/04/25 等格式转为 YYYY-MM-DD */
function normalizeDate(s: unknown): string | null {
  const str = String(s ?? '').trim();
  if (!str) return null;
  const m = str.match(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : str.match(/^\d{4}-\d{2}-\d{2}$/) ? str : null;
}

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
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|bmp|webp|pdf)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('仅支持图片格式（jpg、png、gif、bmp、webp）和 PDF'));
  },
});

// 上传并识别
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择图片或 PDF 文件' });
    let imagePath = req.file.path;
    const isPdf = /\.pdf$/i.test(req.file.originalname);
    if (isPdf) {
      imagePath = await pdfFirstPageToImage(req.file.path, uploadDir);
      try { fs.unlinkSync(req.file.path); } catch { /* 删除原 PDF */ }
    }
    console.log('[上传] 开始识别发票...');
    const ocrResult = await recognizeInvoice(imagePath);
    const relativePath = path.basename(imagePath);
    const pool = await getPool();
    const safeNum = (n: unknown) => {
      const v = Number(n);
      return isFinite(v) && !isNaN(v) && v >= 0 ? Math.min(v, 9999999999999.99) : 0;
    };
    const [row] = await pool.execute(
      `INSERT INTO invoices (
        invoice_code, invoice_number, invoice_date,
        seller_name, seller_tax_id, buyer_name, buyer_tax_id,
        amount, tax_amount, total_amount, goods_name, image_path, raw_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ocrResult.invoice_code ?? null,
        ocrResult.invoice_number ?? null,
        normalizeDate(ocrResult.invoice_date),
        ocrResult.seller_name ?? null,
        ocrResult.seller_tax_id ?? null,
        ocrResult.buyer_name ?? null,
        ocrResult.buyer_tax_id ?? null,
        safeNum(ocrResult.amount),
        safeNum(ocrResult.tax_amount),
        safeNum(ocrResult.total_amount),
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
      const terms = keyword.trim().split(/\s+/).filter(Boolean);
      for (const term of terms) {
        const like = `%${term}%`;
        const termNoSpace = term.replace(/\s/g, '');
        sql += ` AND (
          invoice_code LIKE ? OR invoice_number LIKE ? OR REPLACE(invoice_number,' ','') LIKE ? OR
          seller_name LIKE ? OR buyer_name LIKE ? OR goods_name LIKE ?
        )`;
        params.push(like, like, `%${termNoSpace}%`, like, like, like);
      }
    }
    sql += ' ORDER BY invoice_date DESC, id DESC';
    const [rows] = await pool.execute<Invoice[]>(sql, params);
    res.json({ data: rows });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    console.error('[list]', e);
    res.status(500).json({
      error: msg,
      hint: code === 'ECONNREFUSED'
        ? '无法连接 MySQL，请确认 MySQL 已启动且 .env 中主机/端口正确'
        : code === 'ER_ACCESS_DENIED_ERROR'
        ? '数据库用户名或密码错误'
        : code === 'ER_BAD_DB_ERROR'
        ? '数据库 invoice_db 不存在，请在 Navicat 中执行 schema.sql'
        : undefined,
    });
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
      const terms = keyword.trim().split(/\s+/).filter(Boolean);
      for (const term of terms) {
        const like = `%${term}%`;
        const termNoSpace = term.replace(/\s/g, '');
        sql += ` AND (
          invoice_code LIKE ? OR invoice_number LIKE ? OR REPLACE(invoice_number,' ','') LIKE ? OR
          seller_name LIKE ? OR buyer_name LIKE ? OR goods_name LIKE ?
        )`;
        params.push(like, like, `%${termNoSpace}%`, like, like, like);
      }
    }
    const [rows] = await pool.execute<{ count: number; total: number }[]>(sql, params);
    const row = (rows as { count: number; total: string }[])[0];
    res.json({
      count: Number(row?.count ?? 0),
      totalAmount: Number(row?.total ?? 0),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    console.error('[stats]', e);
    res.status(500).json({
      error: msg,
      hint: code === 'ECONNREFUSED'
        ? '无法连接 MySQL，请确认 MySQL 已启动且 .env 中主机/端口正确'
        : code === 'ER_ACCESS_DENIED_ERROR'
        ? '数据库用户名或密码错误'
        : code === 'ER_BAD_DB_ERROR'
        ? '数据库 invoice_db 不存在，请在 Navicat 中执行 schema.sql'
        : undefined,
    });
  }
});

// 更新发票（手动修正识别结果）
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const pool = await getPool();
    const safeNum = (n: unknown) => {
      const v = Number(n);
      return isFinite(v) && !isNaN(v) && v >= 0 ? Math.min(v, 9999999999999.99) : 0;
    };
    await pool.execute(
      `UPDATE invoices SET
        invoice_code=?, invoice_number=?, invoice_date=?,
        seller_name=?, seller_tax_id=?, buyer_name=?, buyer_tax_id=?,
        amount=?, tax_amount=?, total_amount=?, goods_name=?
      WHERE id=?`,
      [
        body.invoice_code ?? null,
        body.invoice_number ?? null,
        normalizeDate(body.invoice_date),
        body.seller_name ?? null,
        body.seller_tax_id ?? null,
        body.buyer_name ?? null,
        body.buyer_tax_id ?? null,
        safeNum(body.amount),
        safeNum(body.tax_amount),
        safeNum(body.total_amount),
        body.goods_name ?? null,
        id,
      ]
    );
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM invoices WHERE id = ?', [id]);
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// 删除发票
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const [rows] = await pool.execute<Invoice[]>('SELECT image_path FROM invoices WHERE id = ?', [id]);
    const invoice = rows[0];
    if (!invoice) return res.status(404).json({ error: '未找到发票' });
    await pool.execute('DELETE FROM invoices WHERE id = ?', [id]);
    const imgPath = path.join(uploadDir, invoice.image_path);
    try { if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath); } catch { /* 忽略图片删除失败 */ }
    res.json({ success: true });
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
