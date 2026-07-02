import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ScoringModule } from '../scoring/scoring.module';
import { ProfileController } from './profile.controller';
import { UserProfileService } from './user-profile.service';

@Module({
  imports: [AuthModule, ScoringModule],
  controllers: [ProfileController],
  providers: [UserProfileService],
  exports: [UserProfileService],
})
export class ProfileModule {}
