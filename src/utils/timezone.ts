
import { formatInTimeZone } from 'date-fns-tz';
import { DEFAULT_TIMEZONE, TIMEZONE_CONFIG } from '@/config/timezone';

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
    let dateObj: Date;
    
    if (typeof date === 'string') {
      // Handle string dates - assume they are UTC if no timezone info
      dateObj = new Date(date);
    } else if (typeof date === 'number') {
      // Handle timestamp
      dateObj = new Date(date);
    } else {
      // Already a Date object
      dateObj = date;
    }
    
    // Ensure we have a valid date
    if (isNaN(dateObj.getTime())) {
      console.error('Invalid date provided:', date);
      return 'Invalid Date';
    }
    
    return formatInTimeZone(dateObj, timezone, formatString);
  } catch (error) {
    console.error('Error formatting date to timezone:', error, 'Date:', date);
    return 'Invalid Date';
  }
};

/**
 * Get current time in GMT
 * @param formatString - Format string
 */
export const getCurrentTimeInTimezone = (
  formatString: string = 'yyyy-MM-dd HH:mm:ss',
  timezone: string = 'GMT'
): string => {
  return formatToTimezone(new Date(), formatString, timezone);
};

/**
 * Convert timestamp to GMT time for display
 * @param timestamp - Timestamp to convert
 */
export const formatTimestampForDisplay = (
  timestamp: string | Date
): string => {
  try {
    let dateObj: Date;
    
    if (typeof timestamp === 'string') {
      // Parse the string date and treat it as UTC
      dateObj = new Date(timestamp + (timestamp.includes('Z') ? '' : 'Z'));
    } else {
      dateObj = timestamp;
    }
    
    // Ensure valid date
    if (isNaN(dateObj.getTime())) {
      console.error('Invalid timestamp:', timestamp);
      return 'Invalid Date';
    }
    
    // Format to GMT (UTC) timezone - this will show the actual GMT time
    return formatInTimeZone(dateObj, 'GMT', 'M/d/yyyy, h:mm:ss a');
  } catch (error) {
    console.error('Error converting timestamp:', error, 'Timestamp:', timestamp);
    return 'Invalid Date';
  }
};

/**
 * Convert timestamp to GMT time with explicit GMT timezone handling
 * @param timestamp - Timestamp to convert  
 */
export const toLocaleStringWithTimezone = (
  timestamp: string | Date
): string => {
  try {
    let dateObj: Date;
    
    if (typeof timestamp === 'string') {
      // Parse the string date and ensure it's treated as UTC if no timezone specified
      dateObj = new Date(timestamp + (timestamp.includes('Z') ? '' : 'Z'));
    } else {
      dateObj = timestamp;
    }
    
    // Ensure valid date
    if (isNaN(dateObj.getTime())) {
      console.error('Invalid timestamp:', timestamp);
      return 'Invalid Date';
    }
    
    // Format to actual GMT (UTC) timezone
    return formatInTimeZone(dateObj, 'GMT', 'M/d/yyyy, h:mm:ss a');
  } catch (error) {
    console.error('Error converting timestamp:', error, 'Timestamp:', timestamp);
    return 'Invalid Date';
  }
};

// Export available timezones for reference
export const AVAILABLE_TIMEZONES = TIMEZONE_CONFIG.AVAILABLE;
export { DEFAULT_TIMEZONE };
