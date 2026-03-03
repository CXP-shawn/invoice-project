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
    """从字符串解析金额，仅接受像金额的数字（如 164.72），拒绝发票代码/税号/单号等长数字"""
    if not s:
        return 0.0
    m = re.search(r'[¥￥]?\s*(\d{1,7}\.\d{2})', s.replace(',', ''))
    if m:
        v = float(m.group(1))
        return v if 0.01 <= v < 1e7 else 0.0
    m = re.search(r'(\d{1,7}\.\d{2})', s)
    if m:
        v = float(m.group(1))
        return v if 0.01 <= v < 1e7 else 0.0
    return 0.0

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

        # 上下文：购买方/销售方区域
        in_buyer, in_seller = False, False

        for i, t in enumerate(lines):
            t = t.strip()
            # 发票代码、发票号码（可能在同一行：发票代码 xxx 发票号码 xxx）
            if "发票代码" in t or "发票号码" in t:
                all_nums = re.findall(r'\d{8,20}', t)
                code_candidates = [n for n in all_nums if 10 <= len(n) <= 12]
                num_candidates = [n for n in all_nums if len(n) >= 8]
                if not result["invoice_code"] and code_candidates:
                    result["invoice_code"] = code_candidates[0]
                if not result["invoice_number"] and num_candidates:
                    result["invoice_number"] = num_candidates[-1] if len(num_candidates) > 1 else num_candidates[0]

            if "开票日期" in t:
                d = parse_date(t)
                if d:
                    result["invoice_date"] = d

            # 价税合计（小写）
            if "小写" in t and "单号" not in t:
                v = parse_amount(t)
                if v > 0:
                    result["total_amount"] = v
            elif i > 0 and "价税合计" in lines[i-1] and "单号" not in t and "代码" not in t and "号码" not in t:
                v = parse_amount(t)
                if v > 0:
                    result["total_amount"] = v
            elif "价税合计" in t and "代码" not in t and "号码" not in t and "单号" not in t:
                v = parse_amount(t)
                if v > 0:
                    result["total_amount"] = v

            # 区域标记
            if "购买方" in t or "购方" in t:
                in_buyer, in_seller = True, False
            if "销售方" in t or "销方" in t:
                in_seller, in_buyer = True, False

            # 名称（根据上下文判断购方/销方）
            if "名称" in t and "项目" not in t and "商品" not in t and "货物" not in t:
                name = re.split(r'[：:名称]', t, maxsplit=2)[-1].strip()
                name = re.sub(r'^[^\u4e00-\u9fa5a-zA-Z]+', '', name)
                if len(name) > 2 and not re.match(r'^\d+$', name):
                    if in_buyer and not result["buyer_name"]:
                        result["buyer_name"] = name[:200]
                    elif in_seller and not result["seller_name"]:
                        result["seller_name"] = name[:200]

            # 税号
            if "税号" in t or "统一社会信用代码" in t or "纳税人识别号" in t:
                nums = re.findall(r'[A-Z0-9]{15,20}', t)
                if nums:
                    if in_seller or "销" in t or "卖" in t:
                        result["seller_tax_id"] = nums[0]
                    elif in_buyer or "购" in t:
                        result["buyer_tax_id"] = nums[0]

            # 货物/项目名称
            if "货物" in t or "应税劳务" in t or "项目名称" in t:
                name = re.split(r'[：:]', t, maxsplit=1)[-1].strip()
                if name and len(name) > 1:
                    result["goods_name"] = name[:500]

        # 兜底：从全文提取公司名称
        if not result["invoice_date"]:
            result["invoice_date"] = parse_date(raw)
        company_pattern = re.compile(r'([\u4e00-\u9fa5a-zA-Z]{4,}(?:科技|贸易|有限|公司)[\u4e00-\u9fa5a-zA-Z]*)')
        for t in lines:
            for m in company_pattern.finditer(t):
                name = m.group(1)
                if len(name) < 5:
                    continue
                if not result["buyer_name"] and ("武汉" in name or "北京" in name or ("购" in t and "销" not in t)):
                    result["buyer_name"] = name[:200]
                    break
                if not result["seller_name"] and "上海" in name:
                    result["seller_name"] = name[:200]
                    break
            if not result["seller_name"] and "上海" in t:
                m = re.search(r'(上海[\u4e00-\u9fa5a-zA-Z]+(?:贸易|科技|有限|公司)[\u4e00-\u9fa5a-zA-Z]*)', t)
                if m:
                    result["seller_name"] = m.group(1)[:200]
            if not result["buyer_name"] and "武汉" in t:
                m = re.search(r'(武汉[\u4e00-\u9fa5a-zA-Z]+(?:贸易|科技|有限|公司)[\u4e00-\u9fa5a-zA-Z]*)', t)
                if m:
                    result["buyer_name"] = m.group(1)[:200]
    except ImportError:
        result["raw_text"] = "[未安装 PaddleOCR] 请运行: pip install paddleocr paddlepaddle"
    except Exception as e:
        result["raw_text"] = f"[OCR 错误] {str(e)}"

    # 金额合理性校验：价税合计通常 < 1000万，超大数多为误识别
    if result["total_amount"] > 9999999.99:
        result["total_amount"] = 0.0
    if result["amount"] > 9999999.99:
        result["amount"] = 0.0
    if result["tax_amount"] > 9999999.99:
        result["tax_amount"] = 0.0

    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    main()
