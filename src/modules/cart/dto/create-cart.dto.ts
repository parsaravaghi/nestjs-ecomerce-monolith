import { IsUUID } from 'class-validator';

export class CreateCartDto {
  @IsUUID('4')
  userId: string;
}
