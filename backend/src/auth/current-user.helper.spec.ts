import { ConfigService } from '@nestjs/config';
import { getOwnerUserId } from './current-user.helper';

function makeConfig(value: string | undefined): ConfigService {
  return { get: jest.fn().mockReturnValue(value) } as unknown as ConfigService;
}

describe('getOwnerUserId', () => {
  it('returns the configured id when OWNER_USER_ID is set', () => {
    expect(getOwnerUserId(makeConfig('cuid_abc'))).toBe('cuid_abc');
  });

  it('throws when OWNER_USER_ID is missing', () => {
    expect(() => getOwnerUserId(makeConfig(undefined))).toThrow(
      'OWNER_USER_ID env not configured',
    );
  });

  it('throws when OWNER_USER_ID is empty', () => {
    expect(() => getOwnerUserId(makeConfig(''))).toThrow(
      'OWNER_USER_ID env not configured',
    );
  });
});
