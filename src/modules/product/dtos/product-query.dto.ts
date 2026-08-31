import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
} from 'class-validator';

export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cursor?: string;
}
