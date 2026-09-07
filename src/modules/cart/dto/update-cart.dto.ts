import { IsNumberString, IsOptional } from 'class-validator';

export class UpdateCartDto {
  @IsOptional()
  @IsNumberString()
  price?: string;
}
