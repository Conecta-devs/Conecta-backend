import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';

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

      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  validate(payload: any) {
    return {
      email: payload.email,
    };
  }
}