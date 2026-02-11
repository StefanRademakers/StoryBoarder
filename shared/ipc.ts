export interface PythonCommand {
  id: string;
  cmd: string;
  args?: Record<string, unknown>;
}

export interface PythonSuccessResponse {
  id: string;
  ok: true;
  data?: Record<string, unknown>;
}

export interface PythonErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface PythonErrorResponse {
  id: string;
  ok: false;
  error: PythonErrorDetail;
}

export type PythonResponse = PythonSuccessResponse | PythonErrorResponse;