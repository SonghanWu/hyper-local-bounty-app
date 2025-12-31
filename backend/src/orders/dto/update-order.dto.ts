import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rewardAmount?: number;
}
