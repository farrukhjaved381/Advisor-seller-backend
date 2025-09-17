import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadService } from './upload.service';
import { memoryStorage } from 'multer';

@ApiTags('File Upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
          return cb(new BadRequestException('Only image files allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Upload company logo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Logo uploaded successfully' })
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return await this.uploadService.saveFileUrl(file, 'logo');
  }

  @Post('testimonial')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(new BadRequestException('Only PDF files allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Upload testimonial PDF' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Testimonial uploaded successfully',
  })
  async uploadTestimonial(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return await this.uploadService.saveFileUrl(file, 'testimonial');
  }

  @Post('video')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/^video\/(mp4|quicktime|x-m4v|webm)$/)) {
          return cb(
            new BadRequestException(
              'Only MP4, MOV, M4V or WEBM videos allowed',
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 200 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Upload advisor introduction video' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Video uploaded successfully' })
  async uploadVideo(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return await this.uploadService.saveFileUrl(file, 'video');
  }
}
