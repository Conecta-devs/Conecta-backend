import { Test, TestingModule } from '@nestjs/testing';
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
});
