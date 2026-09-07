import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class BalanceChargeDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(30_000_000)
  balance: number;
}
