
import { format, formatInTimeZone } from 'date-fns-tz';

// Default timezone - can be changed as per requirement
export const DEFAULT_TIMEZONE = 'Europe/London';

// Alternative timezones you might want to use
export const TIMEZONES = {
  LONDON: 'Europe/London',
  UTC: 'UTC',
  NEW_YORK: 'America/New_York',
  TOKYO: 'Asia/Tokyo',
  SYDNEY: 'Australia/Sydney',
} as const;

/**
 * Format a date to the specified timezone
 * @param date - Date to format
 * @param formatString - Format string (e.g., 'yyyy-MM-dd HH:mm:ss')
 * @param timezone - Timezone to use (defaults to DEFAULT_TIMEZONE)
 */
export const formatToTimezone = (
  date: Date | string | number,
  formatString: string = 'yyyy-MM-dd HH:mm:ss',
  timezone: string = DEFAULT_TIMEZONE
): string => {
  try {
    const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    return formatInTimeZone(dateObj, timezone, formatString);
  } catch (error) {
    console.error('Error formatting date to timezone:', error);
    return 'Invalid Date';
  }
};

/**
 * Get current time in the specified timezone
 * @param formatString - Format string
 * @param timezone - Timezone to use
 */
export const getCurrentTimeInTimezone = (
  formatString: string = 'yyyy-MM-dd HH:mm:ss',
  timezone: string = DEFAULT_TIMEZONE
): string => {
  return formatToTimezone(new Date(), formatString, timezone);
};

/**
 * Convert timestamp to localized string for display
 * @param timestamp - Timestamp to convert
 * @param timezone - Timezone to use
 */
export const formatTimestampForDisplay = (
  timestamp: string | Date,
  timezone: string = DEFAULT_TIMEZONE
): string => {
  return formatToTimezone(timestamp, 'M/d/yyyy, h:mm:ss a', timezone);
};

/**
 * Convert timestamp to locale string (same as toLocaleString but with timezone)
 * @param timestamp - Timestamp to convert
 * @param timezone - Timezone to use
 */
export const toLocaleStringWithTimezone = (
  timestamp: string | Date,
  timezone: string = DEFAULT_TIMEZONE
): string => {
  return formatToTimezone(timestamp, 'M/d/yyyy, h:mm:ss a', timezone);
};
