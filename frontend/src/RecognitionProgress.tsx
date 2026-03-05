import { useEffect, useState } from 'react';
import { Modal } from 'antd';
import type { Invoice, OcrBoxes } from './api';
import './RecognitionProgress.css';

const BOX_KEYS = ['invoice_number', 'invoice_date', 'buyer_name', 'seller_name', 'goods_name', 'total_amount'] as const;
const BOX_LABELS: Record<string, string> = {
  invoice_number: '发票号码',
  invoice_date: '开票日期',
  buyer_name: '购方名称',
  seller_name: '销方名称',
  goods_name: '商品名称',
  total_amount: '价税合计',
};

/** 无真实坐标时的默认位置 (left%, top%, width%, height%) */
const DEFAULT_BOXES: OcrBoxes = {
  invoice_number: [55, 5, 42, 8],
  invoice_date: [55, 14, 42, 8],
  buyer_name: [2, 22, 48, 10],
  seller_name: [52, 22, 46, 10],
  goods_name: [5, 45, 90, 12],
  total_amount: [60, 82, 35, 10],
};

interface RecognitionProgressProps {
  open: boolean;
  imageUrl: string | null;
  result: Invoice | null;
  boxes: OcrBoxes | null;
  loading: boolean;
  onClose: () => void;
}

export function RecognitionProgress({ open, imageUrl, result, boxes, loading, onClose }: RecognitionProgressProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const displayBoxes = boxes && Object.keys(boxes).length > 0 ? boxes : DEFAULT_BOXES;

  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }
    if (loading) {
      const timers = BOX_KEYS.map((_, i) => setTimeout(() => setActiveIndex(i), i * 800));
      return () => timers.forEach(clearTimeout);
    }
    setActiveIndex(BOX_KEYS.length);
  }, [open, loading]);

  const formatValue = (key: keyof Invoice, value: unknown): string => {
    if (value == null || value === '') return '—';
    if (key === 'total_amount' || key === 'amount' || key === 'tax_amount') {
      return `¥${Number(value).toFixed(2)}`;
    }
    return String(value);
  };

  return (
    <Modal
      title={loading ? '发票识别中' : '识别结果'}
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      centered
      className="recognition-progress-modal"
      destroyOnClose
    >
      <div className="recognition-progress">
        <div className="recognition-image-wrap">
          {imageUrl ? (
            <div className="recognition-image-container">
              <img src={imageUrl} alt="发票" className="recognition-image" />
              {BOX_KEYS.map((key, i) => {
                const box = displayBoxes[key];
                if (!box) return null;
                return (
                  <div
                    key={key}
                    className={`recognition-box ${i === activeIndex ? 'active' : ''} ${!loading && result ? 'done' : ''}`}
                    style={{
                      left: `${box[0]}%`,
                      top: `${box[1]}%`,
                      width: `${box[2]}%`,
                      height: `${box[3]}%`,
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <div className="recognition-placeholder">
              {loading ? '解析图片中...' : '暂无预览'}
            </div>
          )}
        </div>

        <div className="recognition-output">
          <div className="recognition-output-title">识别结果</div>
          <div className="recognition-output-grid">
            {BOX_KEYS.map((key, i) => (
              <div key={key} className={`recognition-output-item ${i <= activeIndex ? 'visible' : ''}`}>
                <span className="recognition-output-label">{BOX_LABELS[key]}:</span>
                <span className="recognition-output-value">
                  {result ? formatValue(key, result[key]) : loading ? '识别中...' : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
