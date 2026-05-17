import Decimal from 'decimal.js'
import dayjs from 'dayjs'

export function add(a: number, b: number): number {
  return new Decimal(a).plus(b).toNumber()
}

export function sub(a: number, b: number): number {
  return new Decimal(a).minus(b).toNumber()
}

export function toFixed(num: number, precision: number = 2): number {
  return new Decimal(num).toDecimalPlaces(precision, Decimal.ROUND_HALF_UP).toNumber()
}

export function parseTimestamp(value: unknown): number {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    return dayjs(value).valueOf()
  }
  return 0
}

export function formatDate(timestamp: number, format = 'YYYY-MM-DD'): string {
  return dayjs(timestamp).format(format)
}

export function getMonthStartEnd(year: number, month: number, tzOffset = 8) {
  const offset = tzOffset * 60 * 60 * 1000
  const startDate = dayjs(`${year}-${month.toString().padStart(2, '0')}-01`).startOf('month').valueOf() - offset
  const endDate = dayjs(`${year}-${month.toString().padStart(2, '0')}-01`).endOf('month').valueOf() - offset
  return { startDate, endDate }
}

export function getYearStartEnd(year: number, tzOffset = 8) {
  const offset = tzOffset * 60 * 60 * 1000
  const startDate = dayjs(`${year}-01-01`).startOf('year').valueOf() - offset
  const endDate = dayjs(`${year}-12-31`).endOf('year').valueOf() - offset
  return { startDate, endDate }
}