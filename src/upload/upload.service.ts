import { Injectable } from '@nestjs/common';

@Injectable()
export class UploadService {
  saveFileUrl(file: Express.Multer.File, type: 'logo' | 'testimonial'): { url: string; filename: string; base64?: string } {
    // For serverless environments, return base64 data URL
    if (process.env.NODE_ENV === 'production') {
      const base64 = file.buffer.toString('base64');
      const dataUrl = `data:${file.mimetype};base64,${base64}`;
      
      return {
        url: dataUrl,
        filename: file.originalname,
        base64: base64
      };
    }
    
    // For local development
    return {
      url: `http://localhost:3000/uploads/${type}s/${file.originalname}`,
      filename: file.originalname
    };
  }
}