import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DateRangePickerProps {
  value?: DateRange
  onChange: (range?: DateRange) => void
  className?: string
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const label = value?.from
    ? value.to
      ? `${format(value.from, 'yyyy/MM/dd')} - ${format(value.to, 'yyyy/MM/dd')}`
      : format(value.from, 'yyyy/MM/dd')
    : '开票日期范围'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('justify-start gap-2 font-normal', !value?.from && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="text-muted-foreground" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={value}
          onSelect={onChange}
          locale={zhCN}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
