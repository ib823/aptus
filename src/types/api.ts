/** API request/response types */

export interface ApiResponse<T> {
  data: T;
  error?: never;
}

export interface ApiError {
  data?: never;
  error: {
    code: string;
    message: string;
    details?: Record<string, string>;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

/** Standard error codes */
export const ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  MFA_REQUIRED: "MFA_REQUIRED",
  MFA_SETUP_REQUIRED: "MFA_SETUP_REQUIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  AREA_LOCKED: "AREA_LOCKED",
  CONFLICT: "CONFLICT",
} as const;
