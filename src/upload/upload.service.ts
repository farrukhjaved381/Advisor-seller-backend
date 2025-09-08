import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class UploadService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async saveFileUrl(file: Express.Multer.File, type: 'logo' | 'testimonial'): Promise<{ url: string; filename: string }> {
    try {
      const result = await cloudinary.uploader.upload_stream(
        {
          folder: `advisor-seller/${type}s`,
          resource_type: type === 'logo' ? 'image' : 'raw',
          public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
        },
        (error, result) => {
          if (error) throw error;
          return result;
        }
      );

      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `advisor-seller/${type}s`,
            resource_type: type === 'logo' ? 'image' : 'raw',
            public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else if (result) {
              resolve({
                url: result.secure_url,
                filename: file.originalname
              });
            } else {
              reject(new Error('Upload failed - no result'));
            }
          }
        );
        stream.end(file.buffer);
      });
    } catch (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  }
}