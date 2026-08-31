import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, message } = this.toHttpError(exception);

    response.status(status).json({
      statusCode: status,
      message,
      error: this.errorName(status),
    });
  }

  private toHttpError(exception: Prisma.PrismaClientKnownRequestError): {
    status: HttpStatus;
    message: string;
  } {
    if (exception.code === 'P2002') {
      const fields = this.uniqueFields(exception);

      if (fields.includes('username')) {
        return {
          status: HttpStatus.CONFLICT,
          message: 'Username already exists',
        };
      }

      if (fields.includes('email')) {
        return {
          status: HttpStatus.CONFLICT,
          message: 'Email already exists',
        };
      }

      return {
        status: HttpStatus.CONFLICT,
        message: 'A product with this title already exists',
      };
    }

    if (exception.code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'The requested record was not found',
      };
    }

    if (exception.code === 'P2003') {
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'User not found',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'A database error occurred',
    };
  }

  private uniqueFields(
    exception: Prisma.PrismaClientKnownRequestError,
  ): string[] {
    const target = exception.meta?.target;

    if (Array.isArray(target)) {
      return target.filter(
        (field): field is string => typeof field === 'string',
      );
    }

    if (typeof target === 'string') {
      return [target];
    }

    const adapterError = exception.meta?.driverAdapterError;

    if (!this.isRecord(adapterError) || !this.isRecord(adapterError.cause)) {
      return [];
    }

    const constraint = adapterError.cause.constraint;

    if (!this.isRecord(constraint) || typeof constraint.index !== 'string') {
      return [];
    }

    const constraintIndex = constraint.index;

    return ['username', 'email', 'title'].filter((field) =>
      constraintIndex.endsWith(`_${field}_key`),
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private errorName(status: HttpStatus): string {
    const names: Partial<Record<HttpStatus, string>> = {
      [HttpStatus.CONFLICT]: 'Conflict',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
    };

    return names[status] ?? 'Error';
  }
}
