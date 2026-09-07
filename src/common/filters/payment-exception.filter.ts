import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { PaymentException } from '../../modules/payment/payment.exception';

@Catch(PaymentException)
export class PaymentExceptionFilter implements ExceptionFilter {
  catch(exception: PaymentException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = this.statusFor(exception);

    response.status(status).json({
      statusCode: status,
      message: exception.message,
      error: this.errorName(status),
    });
  }

  private statusFor(exception: PaymentException): HttpStatus {
    switch (exception.code) {
      case 'PAYMENT_USER_MISMATCH':
        return HttpStatus.FORBIDDEN;
      case 'USER_NOT_FOUND':
        return HttpStatus.NOT_FOUND;
      case 'BALANCE_LIMIT_EXCEEDED':
      case 'INSUFFICIENT_BALANCE':
        return HttpStatus.BAD_REQUEST;
    }
  }

  private errorName(status: HttpStatus): string {
    const names: Partial<Record<HttpStatus, string>> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
    };

    return names[status] ?? 'Error';
  }
}
