import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

function makeContext(cookies: Record<string, string> | undefined): {
  ctx: ExecutionContext;
  req: { cookies: typeof cookies; user?: User };
} {
  const req = { cookies } as { cookies: typeof cookies; user?: User };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe('AuthGuard', () => {
  let guard: AuthGuard;
  const authMock = {
    getUserBySession: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new AuthGuard(authMock as unknown as AuthService);
  });

  it('throws Unauthorized when request has no cookies object', async () => {
    const { ctx } = makeContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(authMock.getUserBySession).not.toHaveBeenCalled();
  });

  it('throws Unauthorized when sid cookie is missing', async () => {
    const { ctx } = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(authMock.getUserBySession).not.toHaveBeenCalled();
  });

  it('throws Unauthorized when session is invalid/expired', async () => {
    authMock.getUserBySession.mockResolvedValue(null);
    const { ctx } = makeContext({ sid: 'bad' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('attaches user to request and returns true when session is valid', async () => {
    const user = { id: 'u1', email: 'alice@beta.io' } as User;
    authMock.getUserBySession.mockResolvedValue(user);
    const { ctx, req } = makeContext({ sid: 'tok' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authMock.getUserBySession).toHaveBeenCalledWith('tok');
    expect(req.user).toBe(user);
  });
});
