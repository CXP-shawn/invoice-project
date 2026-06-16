import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import {
  ReceiptTextIcon,
  UploadCloudIcon,
  SearchIcon,
  RotateCcwIcon,
  ListIcon,
  EyeIcon,
  PencilIcon,
  Trash2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  InboxIcon,
} from 'lucide-react'
import {
  uploadInvoice,
  listInvoices,
  getStats,
  getImageUrl,
  deleteInvoice,
  updateInvoice,
  type Invoice,
  type OcrBoxes,
} from './api'
import { RecognitionProgress } from './RecognitionProgress'
import { ModeToggle } from '@/components/mode-toggle'
import { DateRangePicker } from '@/components/DateRangePicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { pdfFirstPageToDataUrl } from '@/lib/pdfPreview'

type UploadPhase = 'idle' | 'uploading' | 'recognizing' | 'saving' | 'done' | 'error'
type SortKey = 'invoice_date' | 'total_amount'

const UPLOAD_PHASE_DESC: Record<UploadPhase, string> = {
  idle: '等待上传',
  uploading: '文件上传中，请稍候',
  recognizing: '正在提取票面字段与金额',
  saving: '识别结果写入数据库',
  done: '识别与入库已完成',
  error: '处理失败，请检查文件后重试',
}

const formatMoney = (n: number) =>
  `¥${Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatDate = (v: string | null) => (v ? format(new Date(v), 'yyyy-MM-dd') : '-')

interface EditValues {
  invoice_number: string
  invoice_date: string
  seller_name: string
  seller_tax_id: string
  buyer_name: string
  buyer_tax_id: string
  total_amount: string
  goods_name: string
}

const EMPTY_EDIT: EditValues = {
  invoice_number: '',
  invoice_date: '',
  seller_name: '',
  seller_tax_id: '',
  buyer_name: '',
  buyer_tax_id: '',
  total_amount: '',
  goods_name: '',
}

export default function App() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ count: 0, totalAmount: 0 })
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [keyword, setKeyword] = useState('')
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [editValues, setEditValues] = useState<EditValues>(EMPTY_EDIT)
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [saving, setSaving] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploadFlowOpen, setUploadFlowOpen] = useState(false)
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<Invoice | null>(null)
  const [uploadBoxes, setUploadBoxes] = useState<OcrBoxes | null>(null)

  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const progressTimer = useRef<ReturnType<typeof window.setInterval> | null>(null)
  const closeTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isInitial = useRef(true)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        startDate: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
        endDate: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
        keyword: keyword || undefined,
      }
      const [list, stat] = await Promise.all([listInvoices(params), getStats(params)])
      setInvoices(list)
      setStats(stat)
      setPage(1)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; hint?: string } } }
      toast.error(err?.response?.data?.hint || err?.response?.data?.error || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [dateRange, keyword])

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false
      fetchList()
      return
    }
    const t = setTimeout(() => fetchList(), 300)
    return () => clearTimeout(t)
  }, [dateRange, keyword, fetchList])

  const clearUploadTimers = useCallback(() => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current)
      progressTimer.current = null
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  const resetUploadFlow = useCallback(() => {
    setUploadFlowOpen(false)
    setUploadPhase('idle')
    setUploadProgress(0)
    setUploadResult(null)
    setUploadBoxes(null)
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setUploadPreviewUrl(null)
  }, [])

  const startUploadAnimation = useCallback(() => {
    clearUploadTimers()
    setUploadProgress(6)
    setUploadPhase('uploading')
    progressTimer.current = window.setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 92) return prev
        if (prev < 30) {
          setUploadPhase('uploading')
          return Math.min(30, prev + 5)
        }
        if (prev < 82) {
          setUploadPhase('recognizing')
          return Math.min(82, prev + 3)
        }
        setUploadPhase('saving')
        return Math.min(92, prev + 1)
      })
    }, 280)
  }, [clearUploadTimers])

  useEffect(() => {
    return () => {
      clearUploadTimers()
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [clearUploadTimers])

  const handleFile = async (file: File) => {
    if (uploading) {
      toast.warning('当前有发票正在处理，请稍候')
      return
    }
    clearUploadTimers()
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setUploadPreviewUrl(null)
    setUploadFlowOpen(true)
    setUploadResult(null)
    setUploadBoxes(null)
    setUploading(true)
    startUploadAnimation()

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    if (isPdf) {
      pdfFirstPageToDataUrl(file)
        .then((dataUrl) => setUploadPreviewUrl(dataUrl))
        .catch(() => setUploadPreviewUrl(null))
    } else {
      const blobUrl = URL.createObjectURL(file)
      previewUrlRef.current = blobUrl
      setUploadPreviewUrl(blobUrl)
    }
    try {
      const res = await uploadInvoice(file)
      clearUploadTimers()
      setUploadProgress(96)
      setUploadPhase('saving')
      setUploadResult(res.data)
      setUploadBoxes(res.boxes ?? null)
      setUploadProgress(100)
      setUploadPhase('done')
      toast.success('上传成功，已识别并入库')
      await fetchList()
      closeTimer.current = window.setTimeout(() => resetUploadFlow(), 1600)
    } catch (e: unknown) {
      clearUploadTimers()
      setUploadPhase('error')
      setUploadProgress(100)
      const err = e as { response?: { data?: { error?: string; hint?: string } } }
      toast.error(
        err?.response?.data?.hint ||
          err?.response?.data?.error ||
          (e instanceof Error ? e.message : '上传失败')
      )
      closeTimer.current = window.setTimeout(() => resetUploadFlow(), 1800)
    } finally {
      setUploading(false)
    }
  }

  const resetFilters = () => {
    setDateRange(undefined)
    setKeyword('')
  }

  const openEdit = (record: Invoice) => {
    setEditInvoice(record)
    setEditValues({
      invoice_number: record.invoice_number ?? '',
      invoice_date: record.invoice_date ? formatDate(record.invoice_date) : '',
      seller_name: record.seller_name ?? '',
      seller_tax_id: record.seller_tax_id ?? '',
      buyer_name: record.buyer_name ?? '',
      buyer_tax_id: record.buyer_tax_id ?? '',
      total_amount: String(record.total_amount ?? ''),
      goods_name: record.goods_name ?? '',
    })
  }

  const saveEdit = async () => {
    if (!editInvoice) return
    setSaving(true)
    try {
      await updateInvoice(editInvoice.id, {
        ...editValues,
        total_amount: Number(editValues.total_amount) || 0,
      })
      toast.success('已保存')
      setEditInvoice(null)
      fetchList()
    } catch {
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteInvoice(deleteTarget.id)
      toast.success('已删除')
      setDeleteTarget(null)
      fetchList()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err?.response?.data?.error || '删除失败')
    }
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  const avgAmount = stats.count > 0 ? stats.totalAmount / stats.count : 0

  const sorted = useMemo(() => {
    if (!sortKey) return invoices
    const arr = [...invoices]
    arr.sort((a, b) => {
      let av: number
      let bv: number
      if (sortKey === 'total_amount') {
        av = Number(a.total_amount)
        bv = Number(b.total_amount)
      } else {
        av = a.invoice_date ? new Date(a.invoice_date).getTime() : 0
        bv = b.invoice_date ? new Date(b.invoice_date).getTime() : 0
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return arr
  }, [invoices, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageData = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize]
  )

  const SortIcon = ({ column }: { column: SortKey }) =>
    sortKey !== column ? (
      <ArrowUpDownIcon className="size-3.5 text-muted-foreground/70" />
    ) : sortDir === 'asc' ? (
      <ArrowUpIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
    ) : (
      <ArrowDownIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
    )

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm">
              <ReceiptTextIcon className="size-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">发票管理系统</div>
              <div className="text-xs text-muted-foreground">智能识别 · 自动入库</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground sm:inline-flex">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              服务运行中
            </span>
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-6">
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="发票总张数" value={stats.count} />
            <StatCard label="价税合计总额" value={formatMoney(stats.totalAmount)} />
            <StatCard label="平均单张金额" value={formatMoney(avgAmount)} />
          </section>

          <Card>
            <CardContent>
              <div
                role="button"
                tabIndex={0}
                onClick={() => !uploading && fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !uploading) fileInputRef.current?.click()
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!uploading) setDragActive(true)
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragActive(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFile(f)
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-lg border-2 border-dashed px-6 py-10 text-center outline-none transition-colors',
                  dragActive
                    ? 'border-emerald-500 bg-emerald-500/5'
                    : 'border-border hover:border-emerald-500/60 hover:bg-muted/40',
                  uploading && 'pointer-events-none opacity-70'
                )}
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <UploadCloudIcon className="size-6" />
                </div>
                <div className="text-sm font-medium">
                  {uploading ? '正在识别中...' : '点击选择，或将发票拖拽到此处'}
                </div>
                <div className="text-xs text-muted-foreground">
                  支持 JPG / PNG / PDF，单文件 ≤ 20MB，上传后自动 OCR 识别并入库
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                    e.target.value = ''
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListIcon className="size-4 text-muted-foreground" />
                发票列表
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <DateRangePicker
                  value={dateRange}
                  onChange={(r) => {
                    setDateRange(r)
                    setPage(1)
                  }}
                  className="w-full sm:w-auto"
                />
                <div className="relative w-full sm:w-[260px]">
                  <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜索 发票号 / 销方 / 购方 / 商品"
                    className="pl-8"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchList()}
                  />
                </div>
                <Button variant="outline" size="icon" onClick={resetFilters} aria-label="重置筛选条件">
                  <RotateCcwIcon />
                </Button>
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>发票号码</TableHead>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('invoice_date')}
                          className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                        >
                          开票日期 <SortIcon column="invoice_date" />
                        </button>
                      </TableHead>
                      <TableHead>销方名称</TableHead>
                      <TableHead>购方名称</TableHead>
                      <TableHead className="text-right">
                        <button
                          type="button"
                          onClick={() => toggleSort('total_amount')}
                          className="ml-auto inline-flex items-center gap-1 transition-colors hover:text-foreground"
                        >
                          价税合计 <SortIcon column="total_amount" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i} className="hover:bg-transparent">
                          {Array.from({ length: 6 }).map((__, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : pageData.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6}>
                          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                              <InboxIcon className="size-6" />
                            </div>
                            <div className="text-sm font-medium">暂无发票数据</div>
                            <div className="text-xs text-muted-foreground">
                              拖拽或点击上方区域上传第一张发票，系统会自动识别入库。
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      pageData.map((record) => (
                        <TableRow
                          key={record.id}
                          className="cursor-pointer"
                          onClick={() => setPreviewInvoice(record)}
                        >
                          <TableCell className="font-mono text-xs">
                            {record.invoice_number || '-'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(record.invoice_date)}
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate" title={record.seller_name ?? ''}>
                            {record.seller_name || '-'}
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate" title={record.buyer_name ?? ''}>
                            {record.buyer_name || '-'}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-foreground">
                            {formatMoney(Number(record.total_amount))}
                          </TableCell>
                          <TableCell className="text-right">
                            <div
                              className="flex items-center justify-end gap-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="查看"
                                onClick={() => setPreviewInvoice(record)}
                              >
                                <EyeIcon />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="编辑"
                                onClick={() => openEdit(record)}
                              >
                                <PencilIcon />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="删除"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(record)}
                              >
                                <Trash2Icon />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">共 {sorted.length} 条记录</span>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      setPageSize(Number(v))
                      setPage(1)
                    }}
                  >
                    <SelectTrigger size="sm" className="w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 条/页</SelectItem>
                      <SelectItem value="20">20 条/页</SelectItem>
                      <SelectItem value="50">50 条/页</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="上一页"
                  >
                    <ChevronLeftIcon />
                  </Button>
                  <span className="min-w-[64px] text-center text-sm tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="下一页"
                  >
                    <ChevronRightIcon />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <RecognitionProgress
        open={uploadFlowOpen}
        imageUrl={uploadPreviewUrl}
        result={uploadResult}
        boxes={uploadBoxes}
        loading={uploading}
        progress={uploadProgress}
        phase={UPLOAD_PHASE_DESC[uploadPhase]}
        onClose={() => {
          if (uploading) return
          clearUploadTimers()
          resetUploadFlow()
        }}
      />

      <Dialog open={!!previewInvoice} onOpenChange={(o) => !o && setPreviewInvoice(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EyeIcon className="size-4 text-muted-foreground" />
              发票图片
            </DialogTitle>
            <DialogDescription className="font-mono">
              {previewInvoice?.invoice_number || '发票预览'}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-lg bg-muted p-2">
            {previewInvoice && (
              <img
                src={getImageUrl(previewInvoice.image_path)}
                alt="发票"
                className="mx-auto max-h-[70vh] w-full object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editInvoice} onOpenChange={(o) => !o && setEditInvoice(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PencilIcon className="size-4 text-muted-foreground" />
              编辑发票
            </DialogTitle>
            <DialogDescription>修改后保存将更新台账记录。</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="发票号码">
              <Input
                value={editValues.invoice_number}
                onChange={(e) => setEditValues((s) => ({ ...s, invoice_number: e.target.value }))}
              />
            </Field>
            <Field label="开票日期">
              <Input
                type="date"
                value={editValues.invoice_date}
                onChange={(e) => setEditValues((s) => ({ ...s, invoice_date: e.target.value }))}
              />
            </Field>
            <Field label="销方名称">
              <Input
                value={editValues.seller_name}
                onChange={(e) => setEditValues((s) => ({ ...s, seller_name: e.target.value }))}
              />
            </Field>
            <Field label="销方税号">
              <Input
                value={editValues.seller_tax_id}
                onChange={(e) => setEditValues((s) => ({ ...s, seller_tax_id: e.target.value }))}
              />
            </Field>
            <Field label="购方名称">
              <Input
                value={editValues.buyer_name}
                onChange={(e) => setEditValues((s) => ({ ...s, buyer_name: e.target.value }))}
              />
            </Field>
            <Field label="购方税号">
              <Input
                value={editValues.buyer_tax_id}
                onChange={(e) => setEditValues((s) => ({ ...s, buyer_tax_id: e.target.value }))}
              />
            </Field>
            <Field label="价税合计">
              <Input
                type="number"
                step="0.01"
                value={editValues.total_amount}
                onChange={(e) => setEditValues((s) => ({ ...s, total_amount: e.target.value }))}
              />
            </Field>
            <Field label="商品 / 服务名称">
              <Input
                value={editValues.goods_name}
                onChange={(e) => setEditValues((s) => ({ ...s, goods_name: e.target.value }))}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditInvoice(null)}>
              取消
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定删除这张发票？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该发票记录及图片将无法恢复，请谨慎操作。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 truncate text-4xl font-bold tracking-tight tabular-nums text-foreground">
        {value}
      </div>
    </div>
  )
}
