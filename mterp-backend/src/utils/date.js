/**
 * Date utility functions for MTERP backend handling WIB (Asia/Jakarta) timezone.
 */

/**
 * Safely parses a date string (YYYY-MM-DD) into a UTC Date object anchored to WIB midnight.
 * @param {string} dateStr - The date string in YYYY-MM-DD format.
 * @returns {Date|null} - The Date object or null if invalid.
 */
function parseWIBDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === '') return null;
  // If it's already an ISO string with time, return it as new Date
  if (dateStr.includes('T')) return new Date(dateStr);
  // Treats the date as WIB midnight, not UTC midnight
  const date = new Date(`${dateStr}T00:00:00+07:00`);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Returns the start and end of a given WIB day as UTC Date objects.
 * @param {string|Date} dateInput - The date string in YYYY-MM-DD format or Date object.
 * @returns {{start: Date, end: Date}|null}
 */
function wibDayRange(dateInput) {
  if (!dateInput) return null;
  
  let dateStr = '';
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return null;
    // Format to YYYY-MM-DD in WIB
    const parts = new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(dateInput);
    
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    dateStr = `${year}-${month}-${day}`;
  } else if (typeof dateInput === 'string') {
    dateStr = dateInput.split('T')[0]; // Extract YYYY-MM-DD if ISO string
  } else {
    return null;
  }

  const start = new Date(`${dateStr}T00:00:00+07:00`); // WIB midnight -> UTC 17:00 prev day
  const end   = new Date(`${dateStr}T23:59:59.999+07:00`); // WIB end -> UTC 16:59:59.999 same day

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  return { start, end };
}

/**
 * Returns the current date and time anchored to WIB timezone as a Date object.
 */
function nowWIB() {
  return new Date(); // In Node, if process.env.TZ = 'Asia/Jakarta', new Date() will reflect the server time, but internal value is still UTC.
  // Actually, new Date() is always UTC internally. 
  // We can just rely on standard new Date() since process.env.TZ mainly affects formatting, not the internal timestamp.
}

module.exports = {
  parseWIBDate,
  wibDayRange,
  nowWIB,
};
