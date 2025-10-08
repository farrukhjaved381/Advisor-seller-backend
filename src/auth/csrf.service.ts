import { Injectable } from '@nestjs/common';
import Tokens from 'csrf';

@Injectable()
export class CsrfService {
  private tokens = new Tokens();

  generateSecret(): string {
    return this.tokens.secretSync();
  }

  generateToken(secret: string): string {
    return this.tokens.create(secret);
  }

  verifyToken(secret: string, token: string): boolean {
    return this.tokens.verify(secret, token);
  }
}
