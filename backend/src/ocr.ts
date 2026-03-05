import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  recognizeWithQwen,
  recognizeWithQwenAndOcrRef,
  isQwenAvailable,
  isOcrResultIncomplete,
  fillFromOcrText,
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
  boxes?: Record<string, [number, number, number, number]>;
}

export type OcrBoxes = Record<string, [number, number, number, number]>;

/** 运行 PaddleOCR 并返回结果（含 raw_text、boxes） */
async function runPaddleOcr(imagePath: string): Promise<(OcrResult & { boxes?: OcrBoxes }) | null> {
  const pythonScript = path.join(__dirname, '..', 'ocr', 'recognize.py');
  const fs = await import('fs');
  if (!fs.existsSync(pythonScript)) return null;

  return new Promise((resolve) => {
    const proc = spawn('python3', [pythonScript, imagePath], {
      cwd: path.dirname(pythonScript),
      env: {
        ...process.env,
        PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True',
        PADDLE_PDX_MODEL_SOURCE: process.env.PADDLE_PDX_MODEL_SOURCE || 'BOS',
        PADDLE_OCR_FAST: process.env.PADDLE_OCR_FAST || '0',
      },
    });
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      console.warn('[PaddleOCR] 超时(30s)，已跳过');
      resolve(null);
    }, 30000);
    let stdout = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', () => {});
    proc.on('close', (code) => {
      clearTimeout(timeout);
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

/** Paddle 结果是否已包含关键字段（可跳过 hybrid） */
function isPaddleResultComplete(r: OcrResult | null): boolean {
  if (!r) return false;
  return !!(
    r.invoice_number?.trim() &&
    r.invoice_date?.trim() &&
    r.seller_name?.trim() &&
    r.buyer_name?.trim() &&
    r.total_amount &&
    r.total_amount > 0
  );
}

/** 将识别原始内容打印到终端 */
function logOcrRaw(paddleRawText: string | undefined, finalResult: OcrResult) {
  const sep = '\n' + '='.repeat(60) + '\n';
  const out: string[] = [
    sep,
    '【识别原始内容】',
    sep,
    '--- PaddleOCR 原始文本 ---',
    paddleRawText || '(无)',
    '',
    '--- 最终结构化结果 ---',
    JSON.stringify(finalResult, null, 2),
    sep,
  ];
  process.stderr.write(out.join('\n'));
}

/**
 * 识别发票：Qwen 与 Paddle 并行，任一完整即立即返回（早退），否则合并或 hybrid
 */
export async function recognizeInvoice(imagePath: string): Promise<OcrResult> {
  let paddleRawText: string | undefined;
  let result: OcrResult;

  if (isQwenAvailable()) {
    const qwenPromise = recognizeWithQwen(imagePath);
    const paddlePromise = runPaddleOcr(imagePath);

    // 早退：任一先返回且完整，立即返回，不等待另一个
    const resolved = await new Promise<{ result: OcrResult; rawText?: string }>((resolve) => {
      let qwenDone: Awaited<typeof qwenPromise> = undefined;
      let paddleDone: Awaited<typeof paddlePromise> = undefined;

      const tryResolve = () => {
        if (qwenDone !== undefined && qwenDone && !isOcrResultIncomplete(qwenDone)) {
          resolve({ result: qwenDone });
          return true;
        }
        if (paddleDone !== undefined && paddleDone && isPaddleResultComplete(paddleDone)) {
          resolve({ result: fillFromOcrText(paddleDone, paddleDone.raw_text || ''), rawText: paddleDone.raw_text });
          return true;
        }
        if (qwenDone !== undefined && paddleDone !== undefined) {
          finishMerge();
          return true;
        }
        return false;
      };

      const finishMerge = async () => {
        const qwenResult = qwenDone;
        const paddleResult = paddleDone!;
        const ocrText = paddleResult?.raw_text?.trim();
        const ocrValid = ocrText && ocrText.length > 50 && !ocrText.includes('未安装') && !ocrText.includes('[OCR 错误]');

        if (isPaddleResultComplete(paddleResult)) {
          resolve({ result: fillFromOcrText(paddleResult, ocrText || ''), rawText: paddleResult.raw_text });
          return;
        }
        if (ocrValid) {
          const hybridResult = await recognizeWithQwenAndOcrRef(imagePath, ocrText);
          if (hybridResult && !isOcrResultIncomplete(hybridResult)) {
            resolve({ result: fillFromOcrText(hybridResult, ocrText), rawText: paddleResult.raw_text });
          } else if (hybridResult) {
            const chosen = pickBetterResult(hybridResult, paddleResult || qwenResult || getMockOcrResult(imagePath));
            resolve({ result: fillFromOcrText(chosen, ocrText), rawText: paddleResult.raw_text });
          } else {
            const raw = paddleResult.raw_text || '';
            resolve({ result: pickBetterResult(fillFromOcrText(paddleResult, raw), fillFromOcrText(qwenResult || {}, raw)), rawText: raw });
          }
        } else if (paddleResult) {
          const raw = paddleResult.raw_text || '';
          resolve({ result: pickBetterResult(fillFromOcrText(paddleResult, raw), fillFromOcrText(qwenResult || {}, raw)), rawText: raw });
        } else {
          resolve({ result: qwenResult || getMockOcrResult(imagePath) });
        }
      };

      qwenPromise.then((q) => {
        qwenDone = q;
        tryResolve();
      });
      paddlePromise.then((p) => {
        paddleDone = p;
        tryResolve();
      });
    });
    result = resolved.result;
    paddleRawText = resolved.rawText;
  } else {
    const paddleResult = await runPaddleOcr(imagePath);
    paddleRawText = paddleResult?.raw_text;
    result = paddleResult ? fillFromOcrText(paddleResult, paddleResult.raw_text || '') : getMockOcrResult(imagePath);
  }

  logOcrRaw(paddleRawText, result);
  return result;
}

/** 获取 OCR 定位框（用于前端红框展示） */
export async function getOcrBoxes(imagePath: string): Promise<OcrBoxes> {
  const r = await runPaddleOcr(imagePath);
  return r?.boxes || {};
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
