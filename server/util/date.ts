import { DateTime } from "luxon";

export const toDateInstance = (date?: string | Date) => {
  let result: DateTime<true | false> = DateTime.now()
  if(date) {
    if(typeof date === 'string') {
      
      result = DateTime.fromISO(date)
      
      if(!result.isValid) {
        result = DateTime.fromFormat(date, 'yyyy-MM-dd HH:mm:ss')
      }

      if(!result.isValid) {
        result = DateTime.fromFormat(date, 'yyyy-MM-dd HH:mm')
      }

      if(!result.isValid) {
        result = DateTime.fromFormat(date, 'yyyy-MM-dd')
      }
    } else if(date instanceof Date) result = DateTime.fromJSDate(date)
  }

  if(!result.isValid) {
    throw new Error(`Invalid date: ${date}`)
  }

  return result
}

export const toDateInstanceWithTimezone = (date?: string | Date, timezone?: string | null) => {
  if(!timezone) return toDateInstance(date)

  let result: DateTime<true | false> = DateTime.now()
  if(date) {
    if(typeof date === 'string') {
      
      result = DateTime.fromISO(date)
      
      if(!result.isValid) {
        result = DateTime.fromFormat(date, 'yyyy-MM-dd HH:mm:ss', {
          zone: timezone
        })
      }

      if(!result.isValid) {
        result = DateTime.fromFormat(date, 'yyyy-MM-dd HH:mm', {
          zone: timezone
        })
      }

      if(!result.isValid) {
        result = DateTime.fromFormat(date, 'yyyy-MM-dd', {
          zone: timezone
        })
      }
    } else if(date instanceof Date) result = DateTime.fromJSDate(date, {
      zone: timezone
    })
  }

  if(!result.isValid) {
    throw new Error(`Invalid date: ${date}`)
  }

  return result
}

export const toIsoDayString = (date: DateTime) => {
  return date.toFormat('yyyy-MM-dd')
}

export const toIsoDateTimeString = (date: DateTime) => {
  return date.toFormat('yyyy-MM-dd HH:mm')
}

export const toIsoMonthString = (date: DateTime) => {
  return date.toFormat('yyyy-MM')
}

export const readableDateTimeString = (date: DateTime) => {
  return date.toFormat('MM/dd/yyyy HH:mm')
}

export const readableDateString = (date: DateTime) => {
  return date.toFormat('MM/dd/yyyy')
}

export const readableDateStringLongTruncated = (date: DateTime) => {
  return date.toFormat('MMM dd, yyyy ')
}

export const readableMonthStringTruncated = (date: DateTime) => {
  return date.toFormat('MMM')
}

export const readableMonthString = (date: DateTime) => {
  return date.toFormat('MMMM yyyy')
}

export const now = () => {
  return DateTime.now()
}

export const getStartOfWeek = (dateTime: DateTime) => {
  return dateTime.minus({ days: dateTime.weekday }).startOf('day');
}

export const getStartOfDay = () => {
  return DateTime.now().startOf('day')
}

export const getEndOfWeek = (dateTime: DateTime) => {
  return dateTime.plus({ days: 7 - dateTime.weekday }).endOf('day');
}

export const getEndOfDay = (dateTime: DateTime) => {
  return dateTime.endOf('day')
}

export const getStartOfMonth = (dateTime?: DateTime) => {
  if(dateTime) return dateTime.startOf('month')
  return DateTime.now().startOf('month')
}

export const getEndOfMonth = (dateTime?: DateTime) => {
  if(dateTime) return dateTime.endOf('month')
  return DateTime.now().endOf('month')
}