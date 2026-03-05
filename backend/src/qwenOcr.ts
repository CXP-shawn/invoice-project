import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import type { OcrResult } from './ocr.js';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_BASE = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const QWEN_MODEL = process.env.QWEN_VL_MODEL || 'qwen-vl-ocr-latest';

/** 基础发票识别 prompt，不含 OCR 参考文本 */
const INVOICE_PROMPT_BASE = `请识别这张中国增值税发票（含电子发票、专票、普票），提取所有关键信息。要求准确无误、不要遗漏、不要捏造。必须返回纯 JSON，不要有任何其他文字、说明或 markdown 标记。

【重要：发票号码和开票日期必填】
- 发票号码：在发票右上角「发票号码」或「发票号码:」后面的数字，8-20位纯数字，如 28020000000000880512。勿与税号、发票代码混淆。
- 开票日期：在「开票日期」或「开票日期:」后面的日期，格式如 2024年04月28日 或 2024-04-28，必须转为 YYYY-MM-DD 输出。通常在发票号码同一行或下一行。

【其他布局】
- 购买方/销方：左侧为购买方（名称、税号），右侧为销售方
- 价税合计(小写)：在发票最底部「价税合计(小写)」后的金额（如 ¥2680.00），不是表格中某一行商品的金额

【字段说明】
- invoice_number: 发票号码（「发票号码」后的8-20位数字，必填）
- invoice_date: 开票日期（「开票日期」后的日期，YYYY-MM-DD 格式，必填）
- seller_name: 销售方/销方名称（完整公司名）
- seller_tax_id: 销售方统一社会信用代码/纳税人识别号（15-20位）
- buyer_name: 购买方/购方名称（完整公司名）
- buyer_tax_id: 购买方统一社会信用代码/纳税人识别号
- amount: 合计金额（不含税），数字
- tax_amount: 合计税额，数字
- total_amount: 价税合计（小写），必须是底部「价税合计(小写)」后的金额数字，如 108 或 108.00，不要带¥符号
- goods_name: 货物或应税劳务、服务名称（第一行）

【输出格式】直接返回 JSON，所有字段必填，无法识别的填空字符串""，金额填数字（不要引号）：
{"invoice_number":"","invoice_date":"","seller_name":"","seller_tax_id":"","buyer_name":"","buyer_tax_id":"","amount":0,"tax_amount":0,"total_amount":0,"goods_name":""}`;

/** 带 OCR 参考文本的 prompt（OCR+LLM 混合模式） */
function buildPromptWithOcrRef(ocrText: string): string {
  return `【供参考的 OCR 识别文字，请结合图片和上下文纠正错误、补全遗漏】
---
${ocrText.slice(0, 3000)}
---
${INVOICE_PROMPT_BASE}`;
}

function safeNum(n: unknown): number {
  const v = Number(n);
  return !isNaN(v) && isFinite(v) && v >= 0 && v < 1e7 ? v : 0;
}

/**
 * 使用 Qwen-VL 视觉模型识别发票
 * 需配置 DASHSCOPE_API_KEY
 */
export async function recognizeWithQwen(imagePath: string): Promise<OcrResult | null> {
  if (!DASHSCOPE_API_KEY?.trim()) {
    console.log('[Qwen-VL] 已跳过（未配置 DASHSCOPE_API_KEY）');
    return null;
  }
  console.log('[Qwen-VL] 正在调用识别接口...');
  try {
    const buf = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
    const base64 = buf.toString('base64');
    const imageUrl = `data:${mime};base64,${base64}`;

    // 优先主模型，失败时再试备用（减少重试以提速）
    const models = [QWEN_MODEL, 'qwen-vl-ocr-latest'];
    let lastError = '';
    for (const model of models) {
      try {
        const res = await fetch(`${DASHSCOPE_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: [{ type: 'text', text: '你是专业的发票识别助手。只返回JSON，不要其他内容。' }],
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: imageUrl,
                      min_pixels: 512 * 512,
                      max_pixels: 2048 * 2048,
                    },
                  },
                  { type: 'text', text: INVOICE_PROMPT_BASE },
                ],
              },
            ],
            max_tokens: 512,
          }),
        });
        const body = await res.text();
        if (!res.ok) {
          lastError = `[${model}] ${res.status}: ${body.slice(0, 200)}`;
          continue;
        }
        const data = JSON.parse(body) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
        if (data?.error) {
          lastError = `[${model}] ${data.error.message || JSON.stringify(data.error)}`;
          continue;
        }
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (!text) continue;

        const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
        console.log('[Qwen-VL] 识别成功, model:', model);
        return {
          invoice_number: String(parsed.invoice_number || '').slice(0, 50) || undefined,
          invoice_date: String(parsed.invoice_date || '').slice(0, 20) || undefined,
          seller_name: String(parsed.seller_name || '').slice(0, 200) || undefined,
          seller_tax_id: String(parsed.seller_tax_id || '').slice(0, 50) || undefined,
          buyer_name: String(parsed.buyer_name || '').slice(0, 200) || undefined,
          buyer_tax_id: String(parsed.buyer_tax_id || '').slice(0, 50) || undefined,
          amount: safeNum(parsed.amount),
          tax_amount: safeNum(parsed.tax_amount),
          total_amount: safeNum(parsed.total_amount),
          goods_name: String(parsed.goods_name || '').slice(0, 500) || undefined,
          raw_text: `[Qwen-VL] ${text.slice(0, 500)}`,
        };
      } catch (parseErr) {
        lastError = `[${model}] ${parseErr instanceof Error ? parseErr.message : 'parse failed'}`;
      }
    }
    console.error('[Qwen-VL] All models failed:', lastError);
    return null;
  } catch (e) {
    console.error('[Qwen-VL]', e);
    return null;
  }
}

export function isQwenAvailable(): boolean {
  return !!DASHSCOPE_API_KEY?.trim();
}

/** 从 OCR 原始文本中提取发票号码、开票日期（兜底补全） */
export function extractFromRawText(rawText: string): Partial<Pick<OcrResult, 'invoice_number' | 'invoice_date'>> {
  const out: Partial<Pick<OcrResult, 'invoice_number' | 'invoice_date'>> = {};
  if (!rawText?.trim()) return out;
  // 优先在「发票号码」附近查找
  const numNearLabel = rawText.match(/发票号码[^\d]*(\d{8,20})/);
  if (numNearLabel) {
    out.invoice_number = numNearLabel[1];
  } else {
    const nums = rawText.match(/\d{8,20}/g);
    if (nums) {
      const candidates = nums.filter((n) => n.length >= 8 && n.length <= 20);
      if (candidates.length > 0) {
        out.invoice_number = candidates[0];
      }
    }
  }
  const dateMatch = rawText.match(/(\d{4})[年\-/]?(\d{1,2})[月\-/]?(\d{1,2})/);
  if (dateMatch) {
    out.invoice_date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
  }
  return out;
}

/** 用 OCR 文本补全结果中的空字段 */
export function fillFromOcrText(result: OcrResult, rawText: string): OcrResult {
  const extracted = extractFromRawText(rawText);
  return {
    ...result,
    invoice_number: result.invoice_number?.trim() || extracted.invoice_number || result.invoice_number,
    invoice_date: result.invoice_date?.trim() || extracted.invoice_date || result.invoice_date,
  };
}

/** 判断识别结果是否不完整（关键字段缺失） */
export function isOcrResultIncomplete(r: OcrResult | null): boolean {
  if (!r) return true;
  const missing =
    !r.invoice_number?.trim() ||
    !r.seller_name?.trim() ||
    !r.buyer_name?.trim() ||
    !r.total_amount ||
    r.total_amount <= 0;
  return missing;
}

/** 使用 OCR 文本 + Qwen 结构化解析（混合模式，提高准确率） */
export async function recognizeWithQwenAndOcrRef(
  imagePath: string,
  ocrText: string
): Promise<OcrResult | null> {
  if (!DASHSCOPE_API_KEY?.trim() || !ocrText?.trim()) return null;
  try {
    const buf = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
    const base64 = buf.toString('base64');
    const imageUrl = `data:${mime};base64,${base64}`;
    const prompt = buildPromptWithOcrRef(ocrText);

    const models = [QWEN_MODEL, 'qwen-vl-ocr-latest'];
    for (const model of models) {
      try {
        const res = await fetch(`${DASHSCOPE_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: [{ type: 'text', text: '你是专业的发票识别助手。结合OCR参考文本和图片，纠正错误、补全遗漏。只返回JSON。' }],
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: imageUrl,
                      min_pixels: 512 * 512,
                      max_pixels: 2048 * 2048,
                    },
                  },
                  { type: 'text', text: prompt },
                ],
              },
            ],
            max_tokens: 512,
          }),
        });
        const body = await res.text();
        if (!res.ok) continue;
        const data = JSON.parse(body) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
        if (data?.error) continue;
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (!text) continue;

        const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
        console.log('[Qwen-VL] 混合模式识别成功, model:', model);
        return {
          invoice_number: String(parsed.invoice_number || '').slice(0, 50) || undefined,
          invoice_date: String(parsed.invoice_date || '').slice(0, 20) || undefined,
          seller_name: String(parsed.seller_name || '').slice(0, 200) || undefined,
          seller_tax_id: String(parsed.seller_tax_id || '').slice(0, 50) || undefined,
          buyer_name: String(parsed.buyer_name || '').slice(0, 200) || undefined,
          buyer_tax_id: String(parsed.buyer_tax_id || '').slice(0, 50) || undefined,
          amount: safeNum(parsed.amount),
          tax_amount: safeNum(parsed.tax_amount),
          total_amount: safeNum(parsed.total_amount),
          goods_name: String(parsed.goods_name || '').slice(0, 500) || undefined,
          raw_text: `[Qwen-VL+OCR] ${text.slice(0, 500)}`,
        };
      } catch {
        continue;
      }
    }
    return null;
  } catch (e) {
    console.error('[Qwen-VL] 混合模式识别失败:', e);
    return null;
  }
}
