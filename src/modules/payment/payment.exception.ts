export type PaymentErrorCode =
  | 'PAYMENT_USER_MISMATCH'
  | 'USER_NOT_FOUND'
  | 'BALANCE_LIMIT_EXCEEDED'
  | 'INSUFFICIENT_BALANCE';

export class PaymentException extends Error {
  constructor(
    readonly code: PaymentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = PaymentException.name;
  }
}
