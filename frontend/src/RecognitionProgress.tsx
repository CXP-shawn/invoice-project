import { useEffect, useState } from 'react'
import { FileTextIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { getImageUrl, type Invoice, type OcrBoxes } from './api'
import './RecognitionProgress.css'

const BOX_KEYS = ['invoice_number', 'invoice_date', 'buyer_name', 'seller_name', 'goods_name', 'total_amount'] as const
const BOX_LABELS: Record<string, string> = {
  invoice_number: '发票号码',
  invoice_date: '开票日期',
  buyer_name: '购方名称',
  seller_name: '销方名称',
  goods_name: '商品名称',
  total_amount: '价税合计',
}

/** 无真实坐标时的默认位置 (left%, top%, width%, height%) */
const DEFAULT_BOXES: OcrBoxes = {
  invoice_number: [55, 5, 42, 8],
  invoice_date: [55, 14, 42, 8],
  buyer_name: [2, 22, 48, 10],
  seller_name: [52, 22, 46, 10],
  goods_name: [5, 45, 90, 12],
  total_amount: [60, 82, 35, 10],
}

interface RecognitionProgressProps {
  open: boolean
  imageUrl: string | null
  result: Invoice | null
  boxes: OcrBoxes | null
  loading: boolean
  progress: number
  phase: string
  onClose: () => void
}

export function RecognitionProgress({
  open,
  imageUrl,
  result,
  boxes,
  loading,
  progress,
  phase,
  onClose,
}: RecognitionProgressProps) {
  const [activeIndex, setActiveIndex] = useState(-1)
  const [imgError, setImgError] = useState(false)
  const displayBoxes = boxes && Object.keys(boxes).length > 0 ? boxes : DEFAULT_BOXES
  const effectiveUrl = result?.image_path ? getImageUrl(result.image_path) : imageUrl

  useEffect(() => {
    setImgError(false)
  }, [effectiveUrl, open])

  useEffect(() => {
    if (!open) {
      setActiveIndex(-1)
      return
    }
    if (loading) {
      const timers = BOX_KEYS.map((_, i) => setTimeout(() => setActiveIndex(i), i * 700))
      return () => timers.forEach(clearTimeout)
    }
    setActiveIndex(BOX_KEYS.length)
  }, [open, loading])

  const formatValue = (key: keyof Invoice, value: unknown): string => {
    if (value == null || value === '') return '-'
    if (key === 'total_amount' || key === 'amount' || key === 'tax_amount') {
      return `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return String(value)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !loading) onClose()
      }}
    >
      <DialogContent
        showCloseButton={!loading}
        onInteractOutside={(e) => loading && e.preventDefault()}
        onEscapeKeyDown={(e) => loading && e.preventDefault()}
        className="sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className={`size-2 rounded-full ${loading ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500'}`}
            />
            {loading ? '发票识别中' : '识别完成'}
          </DialogTitle>
          <DialogDescription>
            {loading ? phase || '正在扫描票面并提取关键字段' : '识别结果已写入台账，可在列表中继续编辑。'}
          </DialogDescription>
        </DialogHeader>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300 ease-out"
            style={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
          <div className="overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10">
            {effectiveUrl && !imgError ? (
              <div className="relative isolate leading-[0]">
                <img
                  src={effectiveUrl}
                  alt="发票预览"
                  onError={() => setImgError(true)}
                  className="block max-h-[420px] w-full object-contain"
                />
                {loading && (
                  <>
                    <div className="rp-grid-mask" />
                    <div className="rp-scan-line" />
                  </>
                )}
                {BOX_KEYS.map((key, i) => {
                  const box = displayBoxes[key]
                  if (!box) return null
                  return (
                    <div
                      key={key}
                      className={`rp-box ${i === activeIndex ? 'active' : ''} ${!loading && result ? 'done' : ''}`}
                      style={{
                        left: `${box[0]}%`,
                        top: `${box[1]}%`,
                        width: `${box[2]}%`,
                        height: `${box[3]}%`,
                      }}
                    />
                  )
                })}
              </div>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <FileTextIcon className="size-8 opacity-60" />
                {loading ? '正在解析文档...' : 'PDF 文档，识别完成后生成预览'}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 border-b border-border pb-2 text-sm font-medium">提取字段</div>
            <div className="grid gap-2.5">
              {BOX_KEYS.map((key, i) => (
                <div
                  key={key}
                  className={`flex items-baseline justify-between gap-3 text-sm transition-opacity duration-300 ${
                    i <= activeIndex ? 'opacity-100' : 'opacity-35'
                  }`}
                >
                  <span className="shrink-0 text-muted-foreground">{BOX_LABELS[key]}</span>
                  <span
                    className={`truncate text-right font-medium ${
                      key === 'total_amount' ? 'font-semibold tabular-nums' : ''
                    }`}
                  >
                    {result ? formatValue(key, result[key]) : loading ? '识别中...' : '-'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
