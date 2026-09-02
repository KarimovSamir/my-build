import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Требуем протокол явно: без этого валидатор принимает за адрес почти любую
 * строку, и опечатка в .env всплывёт только в рантайме.
 */
const URL_OPTIONS = {
  protocols: ['http', 'https'],
  require_protocol: true,
};

/**
 * Переменные окружения backend.
 *
 * Проверяются один раз при старте: приложение с неполным .env не поднимется
 * молча, а упадёт с внятным списком того, чего не хватает. Шаблон значений —
 * в `backend/env.example`.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 4000;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS: string = 'http://localhost:3000';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  DIRECT_URL!: string;

  @IsUrl(URL_OPTIONS)
  SUPABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_SECRET_KEY!: string;

  // Проверка JWT подключается в Фазе 2 — до неё поля необязательны,
  // чтобы Фаза 0 поднималась на неполном .env.
  @IsOptional()
  @IsUrl(URL_OPTIONS)
  SUPABASE_JWKS_URL?: string;

  @IsOptional()
  @IsUrl(URL_OPTIONS)
  SUPABASE_JWT_ISSUER?: string;

  @IsOptional()
  @IsString()
  SUPABASE_JWT_AUDIENCE?: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_STORAGE_BUCKET: string = 'order-files';
}

export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const config = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(config, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => {
        const constraints = Object.values(error.constraints ?? {}).join(', ');
        return `  • ${error.property}: ${constraints || 'значение не задано'}`;
      })
      .join('\n');

    throw new Error(
      'Некорректное окружение backend. Проверь backend/.env ' +
        '(шаблон — backend/env.example):\n' +
        details,
    );
  }

  return config;
}

/** Список разрешённых origin'ов для CORS. */
export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
