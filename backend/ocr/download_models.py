#!/usr/bin/env python3
"""
预下载 PaddleOCR 模型，避免首次识别时卡住
运行: python3 download_models.py
或: npm run ocr:download (在 backend 目录)
"""
import os
import sys

# 跳过连接检查
os.environ['PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK'] = 'True'
# 使用百度云源（国内更快），若失败可改为 'HF' 或删掉此行
os.environ['PADDLE_PDX_MODEL_SOURCE'] = 'BOS'

def main():
    print('正在预下载 PaddleOCR 模型...')
    try:
        from paddleocr import PaddleOCR
        ocr = PaddleOCR(use_angle_cls=True, lang='ch')
        print('模型加载完成，已缓存到 ~/.paddlex/official_models/')
        return 0
    except Exception as e:
        print('下载失败:', e, file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
