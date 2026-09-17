import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';

const jwtSecret = process.env.JWT_SECRET ?? 'dev-secret-change-me';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: (req) => {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
          return null;
        }

        const [type, token] = authHeader.split(' ');

        if (type !== 'Bearer') {
          return null;
        }

        return token;
      },

      secretOrKey: jwtSecret,
    });
  }

  validate(payload: any) {
    return {
      email: payload.email,
    };
  }
}