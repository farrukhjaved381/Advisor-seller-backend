import { Injectable } from '@nestjs/common';
import { v2 as cloudinary, UploadApiOptions } from 'cloudinary';

type UploadType = 'logo' | 'testimonial' | 'video';

@Injectable()
export class UploadService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async saveFileUrl(
    file: Express.Multer.File,
    type: UploadType,
  ): Promise<{ url: string; filename: string }> {
    const options: UploadApiOptions = {
      folder: `advisor-seller/${type}s`,
      resource_type:
        type === 'logo' ? 'image' : type === 'video' ? 'video' : 'raw',
      public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
    };

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) {
            const reason: Error =
              error instanceof Error
                ? error
                : new Error(
                    typeof error === 'string'
                      ? error
                      : (error as { message?: unknown })?.message &&
                          typeof (error as { message?: unknown }).message ===
                            'string'
                        ? String((error as { message?: unknown }).message)
                        : 'Cloudinary upload failed',
                  );
            reject(reason);
          } else if (result) {
            resolve({
              url: result.secure_url,
              filename: file.originalname,
            });
          } else {
            reject(new Error('Upload failed - no result'));
          }
        },
      );

      stream.end(file.buffer);
    });
  }
}
