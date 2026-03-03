import { readFile } from 'fs/promises';
import { PDFParse } from 'pdf-parse';
import type { OcrResult } from './ocr.js';

/**
 * 从 PDF 直接提取文本并解析发票字段
 * 适用于文本型 PDF（软件生成的发票），无需 OCR
 */
export async function extractInvoiceFromPdf(pdfPath: string): Promise<OcrResult | null> {
  try {
    const buffer = await readFile(pdfPath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    const text = result?.text?.trim();
    if (!text || text.length < 20) return null;
    return parseInvoiceText(text);
  } catch {
    return null;
  }
}

/** 解析金额，仅接受像金额的数字（如 164.72），拒绝发票代码/税号等长数字 */
function parseAmount(s: string): number {
  const m = s.replace(/,/g, '').match(/(\d{1,7}\.\d{2})/);
  if (m) {
    const v = parseFloat(m[1]);
    return v > 0.01 && v < 1e7 ? v : 0;
  }
  return 0;
}

function parseDate(s: string): string {
  const m = s.match(/(\d{4})[年\-/](\d{1,2})[月\-/](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

function parseInvoiceText(text: string): OcrResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result: OcrResult = {
    invoice_code: '',
    invoice_number: '',
    invoice_date: '',
    seller_name: '',
    seller_tax_id: '',
    buyer_name: '',
    buyer_tax_id: '',
    amount: 0,
    tax_amount: 0,
    total_amount: 0,
    goods_name: '',
    raw_text: text.slice(0, 2000),
  };

  const fullText = text.replace(/\s+/g, ' ');
  let inBuyer = false;
  let inSeller = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.replace(/\s+/g, '');
    const prevLine = i > 0 ? lines[i - 1].replace(/\s+/g, '') : '';
    if (/购买方|购方/.test(t)) inBuyer = true;
    if (/销售方|销方/.test(t)) inSeller = true;

    if (/发票代码/.test(t)) {
      const m = t.match(/\d{10,12}/);
      if (m) result.invoice_code = m[0];
    }
    if (/发票号码/.test(t)) {
      const m = t.match(/\d{8,20}/);
      if (m) result.invoice_number = m[0];
    }
    if (/开票日期|日期/.test(t)) {
      const d = parseDate(line);
      if (d) result.invoice_date = d;
    }
    if (/小写/.test(t) && /[¥￥]?\s*[\d,]+\.\d{2}/.test(line)) {
      const v = parseAmountFromTotalLine(line);
      if (v > 0) result.total_amount = v;
    } else if (/价税合计.*小写|价税合计.*[¥￥元]/.test(t)) {
      const v = parseAmountFromTotalLine(line);
      if (v > 0) result.total_amount = v;
    } else if (/价税合计/.test(prevLine) && /[¥￥]?\s*[\d,]+\.\d{2}/.test(line) && !/代码|号码|税号|单号/.test(line)) {
      const v = parseAmountFromTotalLine(line);
      if (v > 0) result.total_amount = v;
    } else if (/价税合计/.test(t) && !/代码|号码|税号|单号/.test(t)) {
      const v = parseAmountFromTotalLine(line);
      if (v > 0) result.total_amount = v;
    }
    if (/名称/.test(line) && !/项目|商品|货物/.test(line)) {
      const name = line.split(/[：:]/).pop()?.trim().replace(/^[^\u4e00-\u9fa5a-zA-Z]+/, '');
      if (name && name.length > 2 && !/^\d+$/.test(name)) {
        if (inBuyer && !result.buyer_name) result.buyer_name = name.slice(0, 200);
        if (inSeller && !result.seller_name) result.seller_name = name.slice(0, 200);
      }
    }
    if (/税号|统一社会信用代码|纳税人识别号/.test(t)) {
      const m = t.match(/[A-Z0-9]{15,20}/);
      if (m) {
        if (inSeller || /销|卖/.test(t)) result.seller_tax_id = m[0];
        else result.buyer_tax_id = m[0];
      }
    }
    if (/货物|应税劳务|项目名称/.test(t)) {
      const name = line.split(/[：:]/).pop()?.trim().slice(0, 500);
      if (name) result.goods_name = name;
    }
  }
  if (!result.buyer_name && /武汉[\u4e00-\u9fa5]+/.test(fullText)) {
    const m = fullText.match(/(武汉[\u4e00-\u9fa5a-zA-Z]+(?:科技|贸易|有限|公司)[\u4e00-\u9fa5a-zA-Z]*)/);
    if (m) result.buyer_name = m[1].slice(0, 200);
  }
  if (!result.seller_name && /上海[\u4e00-\u9fa5]+/.test(fullText)) {
    const m = fullText.match(/(上海[\u4e00-\u9fa5a-zA-Z]+(?:贸易|科技|有限|公司)[\u4e00-\u9fa5a-zA-Z]*)/);
    if (m) result.seller_name = m[1].slice(0, 200);
  }
  if (!result.invoice_date) result.invoice_date = parseDate(fullText) || '';
  if (!result.total_amount) {
    const m1 = fullText.match(/小写[^¥￥\d]*[¥￥]?\s*([\d,]+\.\d{2})/);
    if (m1) {
      const v = parseFloat(m1[1].replace(/,/g, ''));
      result.total_amount = v > 0.01 && v < 1e7 ? v : 0;
    } else {
      const m2 = fullText.match(/价税合计[^¥￥\d]*[¥￥]?\s*([\d,]+\.\d{2})/);
      if (m2) {
        const v = parseFloat(m2[1].replace(/,/g, ''));
        result.total_amount = v > 0.01 && v < 1e7 ? v : 0;
      } else {
        const amounts = fullText.match(/\d{1,6}\.\d{2}/g);
        if (amounts) {
          const parsed = amounts.map((a) => parseFloat(a)).filter((n) => n > 0.01 && n < 1e7);
          if (parsed.length) result.total_amount = Math.max(...parsed);
        }
      }
    }
  }
  result.amount = clampAmount(result.amount);
  result.tax_amount = clampAmount(result.tax_amount);
  result.total_amount = clampAmount(result.total_amount);
  return result;
}

/** 从「价税合计」行解析金额，仅接受合理金额（0.01～1000万） */
function parseAmountFromTotalLine(s: string): number {
  const m = s.match(/[¥￥]?\s*([\d,]+\.\d{2})/);
  if (m) {
    const v = parseFloat(m[1].replace(/,/g, ''));
    return v > 0.01 && v < 1e7 ? v : 0;
  }
  return parseAmount(s);
}

function clampAmount(n: number): number {
  if (typeof n !== 'number' || !isFinite(n) || isNaN(n) || n < 0) return 0;
  return Math.min(n, 9999999999999.99);
}
