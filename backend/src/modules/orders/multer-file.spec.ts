import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  type INestApplication,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MAX_FILES_PER_REQUEST } from '@mybuild/shared';

import { pdfBytes } from '../../../test/support/uploads.js';
import { UploadSizeGuard } from '../../common/guards/upload-size.guard.js';
import { TempUploadCleanupInterceptor } from '../../common/interceptors/temp-upload-cleanup.interceptor.js';
import { UPLOAD_MULTER_OPTIONS, type MulterFile } from './multer-file.js';

/**
 * Лимиты multer проверяются настоящим разбором multipart, а не чтением
 * конфига: важно, что запрос с лишними полями отбивается, а не то, что
 * в объекте стоит число. Маршрут собран той же обвязкой, что у загрузок
 * заказа, но без базы и хранилища.
 */
@Controller('upload')
class UploadProbeController {
  @Post()
  @UseGuards(UploadSizeGuard)
  @UseInterceptors(
    TempUploadCleanupInterceptor,
    FilesInterceptor('files', MAX_FILES_PER_REQUEST, UPLOAD_MULTER_OPTIONS),
  )
  @HttpCode(HttpStatus.OK)
  accept(
    @Body() body: Record<string, string>,
    @UploadedFiles() files: MulterFile[] | undefined,
  ): { fields: number; files: number } {
    return { fields: Object.keys(body).length, files: files?.length ?? 0 };
  }
}

describe('UPLOAD_MULTER_OPTIONS', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UploadProbeController],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('принимает обычную форму: поля и файл', async () => {
    const response = await request(app.getHttpServer())
      .post('/upload')
      .field('title', 'Ремонт квартиры')
      .field('description', 'а'.repeat(5000))
      .attach('files', pdfBytes('план'), 'план.pdf');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ fields: 2, files: 1 });
  });

  it('отбивает запрос с лишними текстовыми полями', async () => {
    let req = request(app.getHttpServer()).post('/upload');
    for (let index = 0; index < 50; index += 1) {
      req = req.field(`f${index}`, 'x');
    }

    const response = await req;

    expect(response.status).toBe(400);
  });

  it('отбивает слишком длинное текстовое поле', async () => {
    const response = await request(app.getHttpServer())
      .post('/upload')
      .field('description', 'x'.repeat(65 * 1024));

    expect(response.status).toBe(400);
  });

  it('отбивает chunked-запрос без Content-Length до разбора тела', async () => {
    // Через `node:http`, а не supertest: тот сам проставляет длину, и запрос
    // уходил бы с обоими заголовками — такой Node отвергает ещё парсером.
    const server = app.getHttpServer() as Server;
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;

    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          port,
          method: 'POST',
          path: '/upload',
          headers: { 'Content-Type': 'multipart/form-data; boundary=x' },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      // Два куска: так Node шлёт тело chunked, без Content-Length.
      req.write('--x\r\n');
      req.end('--x--\r\n');
    });

    expect(status).toBe(HttpStatus.LENGTH_REQUIRED);
  });
});
