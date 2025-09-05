import { Injectable } from '@nestjs/common';

@Injectable()
export class UploadService {
  saveFileUrl(file: Express.Multer.File, type: 'logo' | 'testimonial'): { url: string; filename: string } {
    // Generate a simple file reference URL to prevent timeouts
    const timestamp = Date.now();
    const filename = `${timestamp}-${file.originalname}`;
    
    return {
      url: `https://advisor-seller-backend.vercel.app/uploads/${type}s/${filename}`,
      filename: file.originalname
    };
  }
}