import { IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @IsUUID('4')
  idempotencyKey: string;
}
