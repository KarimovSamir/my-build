import { HttpStatus, PayloadTooLargeException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { MAX_UPLOAD_REQUEST_BYTES } from '@mybuild/shared';

import { UploadSizeGuard } from './upload-size.guard.js';

/**
 * Отсекает запрос по объявленному размеру до разбора тела. Проверяется
 * unit-тестом, а не e2e: запрос на 200 МБ гонять в тестах незачем.
 */
function contextWith(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('UploadSizeGuard', () => {
  const guard = new UploadSizeGuard();

  it('пропускает запрос в пределах потолка', () => {
    expect(guard.canActivate(contextWith({ 'content-length': '1048576' }))).toBe(true);
    expect(
      guard.canActivate(contextWith({ 'content-length': String(MAX_UPLOAD_REQUEST_BYTES) })),
    ).toBe(true);
  });

  it('отклоняет запрос больше потолка', () => {
    expect(() =>
      guard.canActivate(
        contextWith({ 'content-length': String(MAX_UPLOAD_REQUEST_BYTES + 1) }),
      ),
    ).toThrow(PayloadTooLargeException);
  });

  it.each([
    ['без заголовка', {}],
    ['с мусором вместо числа', { 'content-length': 'не число' }],
    ['с пустым значением', { 'content-length': '' }],
    ['с отрицательным числом', { 'content-length': '-1' }],
    ['с экспонентой', { 'content-length': '1e3' }],
  ])('отклоняет запрос %s: потолок держится только на объявленной длине', (_, headers) => {
    expect(() => guard.canActivate(contextWith(headers))).toThrow(
      expect.objectContaining({ status: HttpStatus.LENGTH_REQUIRED }),
    );
  });
});
