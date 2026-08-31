import { IsDecimal, IsNotEmpty, IsString } from 'class-validator';

export class ProductUpdateDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsDecimal()
  price: string;

  @IsString()
  @IsNotEmpty()
  description: string;
}
