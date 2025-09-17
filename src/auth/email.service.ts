import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter;

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';

    this.transporter = nodemailer.createTransport({
      host: (process.env.EMAIL_HOST || 'smtp.gmail.com').trim(),
      port: parseInt((process.env.EMAIL_PORT || '587').trim()),
      secure: (process.env.EMAIL_SECURE || 'false').trim() === 'true',
      auth: {
        user: (process.env.EMAIL_USER || '').trim(),
        pass: (process.env.EMAIL_PASS || '').trim(),
      },
      // Gmail-specific settings for production
      ...(isProduction && {
        tls: {
          rejectUnauthorized: false,
        },
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
      }),
    });
  }

  async sendEmail(options: {
    to: string;
    cc?: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      ...options,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendVerificationEmail(
    email: string,
    name: string,
    token: string,
  ): Promise<void> {
    console.log('Email config:', {
      EMAIL_USER: process.env.EMAIL_USER ? 'SET' : 'NOT SET',
      EMAIL_PASS: process.env.EMAIL_PASS ? 'SET' : 'NOT SET',
      EMAIL_HOST: process.env.EMAIL_HOST,
      EMAIL_PORT: process.env.EMAIL_PORT,
      NODE_ENV: process.env.NODE_ENV,
    });

    const frontendUrl =
      process.env.FRONTEND_URL || 'https://frontend-five-pied-17.vercel.app';
    const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verify Your Email - Advisor Chooser Platform',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Advisor Chooser Platform!</h2>
          <p>Hello ${name},</p>
          <p>Thank you for registering with us. Please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
          <p>This link will expire in 24 hours.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This is an automated email. Please do not reply to this message.
          </p>
        </div>
      `,
    };

    try {
      console.log('Attempting to send email to:', email);
      await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully to:', email);
    } catch (error) {
      console.error('Email sending failed:', error);
      throw error;
    }
  }

  async sendPasswordResetEmail(
    email: string,
    name: string,
    token: string,
  ): Promise<void> {
    const frontendUrl =
      process.env.FRONTEND_URL || 'https://frontend-five-pied-17.vercel.app';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Reset Your Password - Advisor Chooser Platform',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>Hello ${name},</p>
          <p>You requested to reset your password. Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #dc3545; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetUrl}</p>
          <p>This link will expire in 1 hour.</p>
          <p><strong>If you didn't request this, please ignore this email.</strong></p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This is an automated email. Please do not reply to this message.
          </p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Password reset email sent successfully to:', email);
    } catch (error) {
      console.error('Password reset email sending failed:', error);
      throw error;
    }
  }
}
