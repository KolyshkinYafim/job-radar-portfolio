import { ConfigService } from '@nestjs/config';

export function getOwnerUserId(config: ConfigService): string {
  const id = config.get<string>('OWNER_USER_ID');
  if (!id) throw new Error('OWNER_USER_ID env not configured');
  return id;
}
