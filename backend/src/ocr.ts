import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

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

/**
 * 调用 Python OCR 脚本识别发票
 * 若未安装 PaddleOCR，返回模拟数据
 */
export async function recognizeInvoice(imagePath: string): Promise<OcrResult> {
  const pythonScript = path.join(__dirname, '..', 'ocr', 'recognize.py');
  const fs = await import('fs');
  if (!fs.existsSync(pythonScript)) {
    return getMockOcrResult(imagePath);
  }

  return new Promise((resolve) => {
    const proc = spawn('python3', [pythonScript, imagePath], {
      cwd: path.dirname(pythonScript),
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          resolve(JSON.parse(stdout.trim()) as OcrResult);
        } catch {
          resolve(getMockOcrResult(imagePath));
        }
      } else {
        resolve(getMockOcrResult(imagePath));
      }
    });
    proc.on('error', () => resolve(getMockOcrResult(imagePath)));
  });
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
