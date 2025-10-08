import { Injectable } from '@nestjs/common';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

@Injectable()
export class SanitizationService {
  private purify: any;

  constructor() {
    const window = new JSDOM('').window;
    this.purify = DOMPurify(window as any);
  }

  sanitizeHtml(dirty: string): string {
    return this.purify.sanitize(dirty);
  }

  sanitizeObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.sanitizeHtml(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        sanitized[key] = this.sanitizeObject(obj[key]);
      }
      return sanitized;
    }

    return obj;
  }
}
