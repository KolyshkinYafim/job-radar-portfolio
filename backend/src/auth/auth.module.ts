import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { OwnerGuard } from './owner.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, OwnerGuard],
  exports: [AuthService, AuthGuard, OwnerGuard],
})
export class AuthModule {}
