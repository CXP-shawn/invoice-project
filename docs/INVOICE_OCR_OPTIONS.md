# 发票识别方案说明

## 当前识别链路

1. **Qwen-VL 视觉模型**（优先）：阿里云百炼 `qwen-vl-ocr` 系列，结合图片直接输出结构化 JSON
2. **OCR+LLM 混合**（自动触发）：当 Qwen 结果不完整时，先用 PaddleOCR 提取文字，再让 Qwen 结合 OCR 文本做二次结构化解析，减少遗漏和幻觉
3. **PaddleOCR**（兜底）：纯规则解析，免费本地运行

## 提升准确率的技术手段

### 已实现

- **提示词优化**：发票布局说明（代码/号码在右上角、价税合计在底部）、字段格式约束、强调「不要遗漏、不要捏造」
- **模型优先顺序**：`qwen-vl-ocr-2025-11-20`（Qwen3-VL 架构，文档解析更强）→ `qwen-vl-ocr-latest` → `qwen-vl-max` → `qwen-vl-plus`
- **图像参数**：`min_pixels` / `max_pixels` 提高输入质量
- **OCR+LLM 混合**：PaddleOCR 文本 + Qwen 结构化，业界推荐的 RAG 式方案

### 可选：专业发票 API（准确率 99%+）

若对准确率要求极高，可接入**百度**或**腾讯**的增值税发票专用 OCR API，针对中国发票场景训练，关键字段准确率通常 99% 以上。

| 服务商 | 产品 | 准确率 | 文档 |
|--------|------|--------|------|
| 百度 | 增值税发票识别 | 五要素/四要素 99%+ | [百度 AI](https://ai.baidu.com/tech/ocr_receipts/vat_invoice) |
| 腾讯 | 票据单据识别 Invoice OCR | 各字段 99%+ | [腾讯云](https://cloud.tencent.com/document/product/866/36210) |

接入方式：在 `backend/src/` 下新增 `baiduInvoiceOcr.ts` 或 `tencentInvoiceOcr.ts`，按官方 SDK 调用，并在 `ocr.ts` 中作为最高优先级识别源（需配置对应 API Key）。

## 环境变量

| 变量 | 说明 |
|------|------|
| `DASHSCOPE_API_KEY` | 阿里云百炼 API Key，启用 Qwen-VL |
| `QWEN_VL_MODEL` | 可选，默认 `qwen-vl-ocr-latest` |
| `DASHSCOPE_BASE_URL` | 可选，兼容 OpenAI 的 base URL |

## 故障排查

- **Qwen 返回空**：检查 `DASHSCOPE_API_KEY` 是否有效、是否有视觉模型权限
- **价税合计取错**：多为表格行金额，已通过 prompt 强调「底部价税合计(小写)」
- **发票代码/号码为空**：触发 OCR+LLM 混合后通常可补全，确保 PaddleOCR 已安装
