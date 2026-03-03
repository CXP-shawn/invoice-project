#!/usr/bin/env python3
"""
发票 OCR 识别脚本
使用 PaddleOCR 提取发票关键要素，输出 JSON 到 stdout
用法: python3 recognize.py <图片路径>
"""
import sys
import json
import re
from pathlib import Path

def parse_amount(s: str) -> float:
    """从字符串解析金额"""
    if not s:
        return 0.0
    m = re.search(r'[\d,]+\.?\d*', s.replace(',', ''))
    return float(m.group()) if m else 0.0

def parse_date(s: str) -> str:
    """从字符串解析日期 YYYY-MM-DD"""
    if not s:
        return ''
    m = re.search(r'(\d{4})[年\-/]?(\d{1,2})[月\-/]?(\d{1,2})', s)
    if m:
        return f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
    return ''

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "缺少图片路径"}))
        sys.exit(1)
    img_path = sys.argv[1]
    if not Path(img_path).exists():
        print(json.dumps({"error": "图片不存在"}))
        sys.exit(1)

    result = {
        "invoice_code": "",
        "invoice_number": "",
        "invoice_date": "",
        "seller_name": "",
        "seller_tax_id": "",
        "buyer_name": "",
        "buyer_tax_id": "",
        "amount": 0.0,
        "tax_amount": 0.0,
        "total_amount": 0.0,
        "goods_name": "",
        "raw_text": ""
    }

    try:
        from paddleocr import PaddleOCR
        ocr = PaddleOCR(use_angle_cls=True, lang='ch', show_log=False)
        rec = ocr.ocr(img_path, cls=True)
        lines = []
        if rec and rec[0]:
            for line in rec[0]:
                if line and len(line) >= 2:
                    text = line[1][0] if isinstance(line[1], (list, tuple)) else str(line[1])
                    lines.append(text)
        raw = "\n".join(lines)
        result["raw_text"] = raw

        # 简单规则提取
        for t in lines:
            t = t.strip()
            if "发票代码" in t or "代码" in t:
                nums = re.findall(r'\d{10,20}', t)
                if nums:
                    result["invoice_code"] = nums[0]
            if "发票号码" in t or "号码" in t:
                nums = re.findall(r'\d{8,20}', t)
                if nums:
                    result["invoice_number"] = nums[0]
            if "开票日期" in t or "日期" in t:
                d = parse_date(t)
                if d:
                    result["invoice_date"] = d
            if "价税合计" in t or "合计" in t:
                result["total_amount"] = parse_amount(t)
            if "销方" in t or "销售方" in t:
                result["seller_name"] = re.sub(r'[：:\s]+', '', t).replace("销方", "").replace("销售方", "")[:100]
            if "购方" in t or "购买方" in t:
                result["buyer_name"] = re.sub(r'[：:\s]+', '', t).replace("购方", "").replace("购买方", "")[:100]
            if "名称" in t and "商品" not in t:
                if not result["seller_name"] and "销" in t:
                    result["seller_name"] = t.split("名称")[-1].strip()[:100]
                if not result["buyer_name"] and "购" in t:
                    result["buyer_name"] = t.split("名称")[-1].strip()[:100]
            if "税号" in t:
                nums = re.findall(r'[A-Z0-9]{15,20}', t)
                if nums:
                    if "销" in t or "卖" in t:
                        result["seller_tax_id"] = nums[0]
                    else:
                        result["buyer_tax_id"] = nums[0]
            if "货物或应税劳务" in t or "项目名称" in t or "商品" in t:
                result["goods_name"] = t.split("：")[-1].split(":")[-1].strip()[:500] or result["goods_name"]
    except ImportError:
        result["raw_text"] = "[未安装 PaddleOCR] 请运行: pip install paddleocr paddlepaddle"
    except Exception as e:
        result["raw_text"] = f"[OCR 错误] {str(e)}"

    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    main()
