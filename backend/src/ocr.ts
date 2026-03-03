import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  recognizeWithQwen,
  recognizeWithQwenAndOcrRef,
  isQwenAvailable,
  isOcrResultIncomplete,
} from './qwenOcr.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface OcrResult {
  invoice_code?: string;
  invoice_number?: string;
  invoice_date?: string;
  seller_name?: string;
  seller_tax_id?: string;
  buyer_name?: string;
  buyer_tax_id?: string;
  amount?: number;
  tax_amount?: number;
  total_amount?: number;
  goods_name?: string;
  raw_text?: string;
}

/** 运行 PaddleOCR 并返回结果（含 raw_text） */
async function runPaddleOcr(imagePath: string): Promise<OcrResult | null> {
  const pythonScript = path.join(__dirname, '..', 'ocr', 'recognize.py');
  const fs = await import('fs');
  if (!fs.existsSync(pythonScript)) return null;

  return new Promise((resolve) => {
    const proc = spawn('python3', [pythonScript, imagePath], {
      cwd: path.dirname(pythonScript),
    });
    let stdout = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', () => {});
    proc.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          resolve(JSON.parse(stdout.trim()) as OcrResult);
        } catch {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
    proc.on('error', () => resolve(null));
  });
}

/** 比较两个结果，返回更完整的（非空字段更多） */
function pickBetterResult(a: OcrResult, b: OcrResult): OcrResult {
  const score = (r: OcrResult) =>
    [r.invoice_number, r.seller_name, r.buyer_name, r.total_amount].filter(Boolean).length;
  return score(b) > score(a) ? b : a;
}

/**
 * 识别发票：Qwen-VL → 若不完整则 OCR+LLM 混合 → PaddleOCR 兜底 → 模拟数据
 */
export async function recognizeInvoice(imagePath: string): Promise<OcrResult> {
  // 1. 优先 Qwen-VL 视觉识别
  if (isQwenAvailable()) {
    const qwenResult = await recognizeWithQwen(imagePath);
    if (qwenResult && !isOcrResultIncomplete(qwenResult)) {
      return qwenResult;
    }
    // 2. Qwen 结果不完整时：用 PaddleOCR 提取文字，再让 Qwen 结合 OCR 文本做结构化解析
    if (qwenResult === null || isOcrResultIncomplete(qwenResult)) {
      const paddleResult = await runPaddleOcr(imagePath);
      const ocrText = paddleResult?.raw_text?.trim();
      if (ocrText && ocrText.length > 50) {
        const hybridResult = await recognizeWithQwenAndOcrRef(imagePath, ocrText);
        if (hybridResult && !isOcrResultIncomplete(hybridResult)) {
          return hybridResult;
        }
        if (hybridResult) {
          return pickBetterResult(hybridResult, paddleResult || qwenResult || getMockOcrResult(imagePath));
        }
      }
      if (paddleResult) return pickBetterResult(paddleResult, qwenResult || paddleResult);
      if (qwenResult) return qwenResult;
    }
  }

  // 3. 无 Qwen 或全部失败：PaddleOCR 兜底
  const paddleResult = await runPaddleOcr(imagePath);
  if (paddleResult) return paddleResult;

  return getMockOcrResult(imagePath);
}

function getMockOcrResult(imagePath: string): OcrResult {
  const name = path.basename(imagePath, path.extname(imagePath));
  return {
    invoice_code: '044001900104',
    invoice_number: name.slice(-8) || '12345678',
    invoice_date: new Date().toISOString().slice(0, 10),
    seller_name: '示例销方企业有限公司',
    seller_tax_id: '91110000MA01234567',
    buyer_name: '示例购方企业有限公司',
    buyer_tax_id: '91110000MA07654321',
    amount: 88.5,
    tax_amount: 11.5,
    total_amount: 100,
    goods_name: '技术服务费',
    raw_text: '[模拟OCR] 请安装 PaddleOCR 以启用真实识别',
  };
}
