import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Role, type UserProfile } from '@mybuild/shared';

import type { User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

/** Профиль пользователя: чтение и изменение (ТЗ §5). */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<UserProfile> {
    return toProfile(await this.findOrFail(userId));
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    const current = await this.findOrFail(userId);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        phone: dto.phone,
        lastName: emptyToNull(dto.lastName),
        city: emptyToNull(dto.city),
        country: emptyToNull(dto.country),
        companyName: this.resolveCompanyName(current.role, dto.companyName),
      },
    });

    return toProfile(updated);
  }

  /**
   * Название компании обязательно для COMPANY и не существует у CLIENT (ТЗ §3).
   * То же самое стоит ограничением в базе — здесь оно повторено ради внятной
   * ошибки: иначе клиент получил бы 500 от нарушения CHECK.
   */
  private resolveCompanyName(role: Role, value: string | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (role !== Role.COMPANY) {
      throw new BadRequestException('Название компании есть только у роли «Компания»');
    }

    if (value === '') {
      throw new BadRequestException('Название компании обязательно и не может быть пустым');
    }

    return value;
  }

  private async findOrFail(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      // Профиль создаётся триггером вместе с учётной записью, поэтому сюда
      // можно попасть только если строку удалили руками.
      throw new NotFoundException('Профиль не найден');
    }

    return user;
  }
}

/** Пустая строка означает «очистить поле». */
function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === '' ? null : value;
}

/** Prisma-модель → контракт API: даты уходят строками ISO-8601. */
function toProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    companyName: user.companyName,
    city: user.city,
    country: user.country,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
