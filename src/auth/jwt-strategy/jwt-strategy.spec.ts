import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt-strategy.js';

describe('JwtStrategy', () => {
  let provider: JwtStrategy;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret';

    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtStrategy],
    }).compile();

    provider = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('returns the stable subject and existing profile claims', () => {
    expect(
      provider.validate({
        sub: '65f1234567890abcdef12345',
        email: 'user@example.com',
        name: 'Test User',
      }),
    ).toEqual({
      sub: '65f1234567890abcdef12345',
      email: 'user@example.com',
      name: 'Test User',
    });
  });

  it('rejects legacy tokens without a subject and malformed claims', () => {
    expect(() =>
      provider.validate({ email: 'user@example.com', name: 'Test User' }),
    ).toThrow(UnauthorizedException);
    expect(() =>
      provider.validate({
        sub: '',
        email: 'user@example.com',
        name: 'Test User',
      }),
    ).toThrow(UnauthorizedException);
    expect(() => provider.validate(null)).toThrow(UnauthorizedException);
  });
});
