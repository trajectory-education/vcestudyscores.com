/**
 * Input Validation and Security Utilities
 *
 * Provides validation functions for API inputs to prevent:
 * - Path traversal attacks
 * - Injection attacks
 * - Invalid data types
 * - Out-of-range values
 */

// ============================================================================
// TYPE VALIDATORS
// ============================================================================

/**
 * Validates that a value is a valid year (1998-2025)
 */
export function isValidYear(value: unknown): value is number {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  const year = typeof value === 'string' ? parseInt(value, 10) : value;
  return (
    Number.isInteger(year) &&
    year >= 1998 &&
    year <= 2026 && // Allow next year
    !isNaN(year)
  );
}

/**
 * Validates that a string is a valid search query
 * - No null bytes
 * - Reasonable length
 * - No control characters
 */
export function isValidSearchQuery(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  // Check length
  if (trimmed.length > 200) return false;
  // Check for null bytes and control characters (except common whitespace)
  if (/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/.test(trimmed)) return false;
  return trimmed.length >= 1;
}

/**
 * Validates that a string is safe for file system access
 * Prevents path traversal attacks
 */
export function isSafePathSegment(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // Prevent path traversal
  if (value.includes('..') || value.includes('/') || value.includes('\\')) {
    return false;
  }
  // Prevent null bytes
  if (value.includes('\x00')) return false;
  // Only allow alphanumeric, underscore, hyphen
  return /^[a-zA-Z0-9_.-]+$/.test(value);
}

/**
 * Validates that a value is a valid ATAR (0-99.95)
 */
export function isValidATAR(value: unknown): boolean {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  const atar = typeof value === 'string' ? parseFloat(value) : value;
  return (
    !isNaN(atar) &&
    atar >= 0 &&
    atar <= 99.95
  );
}

/**
 * Validates that a value is a valid study score (0-50)
 */
export function isValidStudyScore(value: unknown): boolean {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  const score = typeof value === 'string' ? parseFloat(value) : value;
  return (
    !isNaN(score) &&
    Number.isInteger(score) &&
    score >= 0 &&
    score <= 50
  );
}

/**
 * Sanitises a string for safe logging/output
 */
export function sanitizeString(value: unknown, maxLength = 100): string {
  if (typeof value !== 'string') return String(value);
  // Remove null bytes and control characters
  let sanitized = value.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }
  return sanitized;
}

// ============================================================================
// API VALIDATION RESPONSES
// ============================================================================

/**
 * Returns a standardised validation error response
 */
export function validationErrorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({
    error: 'Validation Error',
    message,
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * Validates the year parameter and returns a validation error if invalid
 */
export function validateYearParam(year: string | null): { valid: boolean; year?: number; error?: Response } {
  if (!year) {
    return { valid: true }; // Year is optional
  }

  const yearNum = parseInt(year, 10);
  if (!isValidYear(yearNum)) {
    return {
      valid: false,
      error: validationErrorResponse('Invalid year parameter. Must be between 1998 and 2026.'),
    };
  }

  return { valid: true, year: yearNum };
}

/**
 * Validates the query parameter for search endpoints
 */
export function validateQueryParam(query: string | null): { valid: boolean; query?: string; error?: Response } {
  if (!query) {
    return { valid: true }; // Query is optional
  }

  if (!isValidSearchQuery(query)) {
    return {
      valid: false,
      error: validationErrorResponse('Invalid query parameter. Must be 1-200 characters with no special characters.'),
    };
  }

  return { valid: true, query: query.trim() };
}

/**
 * Validates a numeric parameter within a range
 */
export function validateNumberParam(
  value: string,
  min: number,
  max: number,
  paramName = 'value'
): { valid: boolean; value?: number; error?: Response } {
  const num = parseFloat(value);
  if (isNaN(num)) {
    return {
      valid: false,
      error: validationErrorResponse(`Invalid ${paramName}. Must be a number.`),
    };
  }

  if (num < min || num > max) {
    return {
      valid: false,
      error: validationErrorResponse(`${paramName} must be between ${min} and ${max}.`),
    };
  }

  return { valid: true, value: num };
}

// ============================================================================
// SECURITY HEADERS
// ============================================================================

/**
 * Standard security headers for API responses
 */
export const SECURITY_HEADERS: HeadersInit = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/**
 * Wraps a Response with security headers
 */
export function withSecurityHeaders(response: Response): Response {
  const newResponse = new Response(response.body, response);
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    newResponse.headers.set(key, value);
  });
  return newResponse;
}
