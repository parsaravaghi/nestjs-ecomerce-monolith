import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsUUID, Max } from 'class-validator';

export class GetCartDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsUUID('4')
  cursor?: string;
}
