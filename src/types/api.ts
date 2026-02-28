export type ApiSuccess<T> = { data: T };
export type ApiError = { error: { code: string; message: string } };

export function success<T>(data: T): ApiSuccess<T> {
  return { data };
}

export function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}
