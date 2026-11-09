import type { RequestOptions } from './api';
import { demoRequest as browserFetch } from './demo/transport';

export const browserApi = {
  get: <T>(path: string, options?: RequestOptions) =>
    browserFetch<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    browserFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    browserFetch<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    browserFetch<T>(path, { ...options, method: "DELETE" }),
};
