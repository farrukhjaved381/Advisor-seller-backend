import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

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

  private escapeHtml(value: string | number | null | undefined): string {
    const stringValue =
      value === null || value === undefined ? '' : String(value);
    return stringValue
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeAttr(value: string | number | null | undefined): string {
    return this.escapeHtml(value);
  }

  private loadTemplate(templateName: string): string {
    const templatePath = path.join(process.cwd(), 'templates', templateName);
    try {
      return fs.readFileSync(templatePath, 'utf8');
    } catch (error) {
      throw new Error(`Email template not found: ${templateName}`);
    }
  }

  private applyTemplate(
    template: string,
    replacements: Record<string, string | number | null | undefined>,
  ): string {
    return Object.entries(replacements).reduce((html, [key, rawValue]) => {
      const value = this.escapeHtml(
        rawValue === null || rawValue === undefined ? '' : String(rawValue),
      );
      const pattern = new RegExp(`{{\s*${key}\s*}}`, 'g');
      return html.replace(pattern, value);
    }, template);
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
    role?: string,
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
    const params = new URLSearchParams({ token });
    if (role) {
      params.append('role', role);
    }
    const verificationUrl = `${frontendUrl}/verify-email?${params.toString()}`;

    const displayName = name?.trim() || 'there';
    const safeName = this.escapeHtml(displayName);
    const verificationHref = this.escapeAttr(verificationUrl);
    const verificationText = this.escapeHtml(verificationUrl);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verify Your Email - Advisor Chooser Platform',
      html: `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <title>Verify Your Email</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937;">
            <div style="padding: 32px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 640px; margin: 0 auto; border-collapse: separate; border-spacing: 0;">
                <tr>
                  <td style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 22px; overflow: hidden; box-shadow: 0 20px 54px rgba(15, 23, 42, 0.08);">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                      <tr>
                        <td style="background: linear-gradient(135deg, #eef2ff 0%, #f0fdf4 100%); padding: 30px 34px;">
                          <p style="margin: 0; color: #6366f1; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;">Account Verification</p>
                          <h1 style="margin: 12px 0 6px; font-size: 24px; line-height: 1.35; font-weight: 700; color: #111827;">Confirm your email to access Advisor Chooser</h1>
                          <p style="margin: 0; font-size: 14px; color: #4b5563; line-height: 1.6;">
                            Hi ${safeName}, thanks for joining Advisor Chooser. Verify your address to activate your account and start building your profile.
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 28px 32px 24px;">
                          <p style="margin: 0 0 18px; font-size: 15px; line-height: 1.6; color: #1f2937;">
                            Click the button below within 24 hours to complete verification. This helps keep every advisor on the platform secure.
                          </p>
                          <div style="text-align: center; margin: 26px 0;">
                            <a href="${verificationHref}" style="display: inline-block; padding: 14px 28px; border-radius: 999px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none;">Verify Email Address</a>
                          </div>
                          <p style="margin: 0 0 12px; font-size: 13px; color: #4b5563;">Or copy and paste this link into your browser:</p>
                          <p style="margin: 0 0 18px; font-size: 12px; color: #6b7280; word-break: break-all;">${verificationText}</p>
                          <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; padding: 18px; margin-bottom: 24px;">
                            <h2 style="margin: 0 0 10px; font-size: 16px; color: #111827;">What happens next</h2>
                            <ol style="margin: 0; padding-left: 18px; font-size: 13px; color: #4b5563; line-height: 1.7;">
                              <li>Complete your advisor profile.</li>
                              <li>Receive a confirmation from our team once verified.</li>
                              <li>As Company Sellers get matched to you we will send you emails and update your dashboard on Advisor Chooser.</li>
                            </ol>
                          </div>
                          <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">Need help? Email support@advisorchooser.com.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 22px auto 0; max-width: 640px; font-size: 12px; color: #9ca3af; text-align: center;">If you did not create an Advisor Chooser account, you can safely ignore this message.</p>
            </div>
          </body>
        </html>`,
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

    const displayName = name?.trim() || 'there';
    const safeName = this.escapeHtml(displayName);
    const resetHref = this.escapeAttr(resetUrl);
    const resetText = this.escapeHtml(resetUrl);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Reset Your Password - Advisor Chooser Platform',
      html: `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <title>Reset Your Password</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937;">
            <div style="padding: 32px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 640px; margin: 0 auto; border-collapse: separate; border-spacing: 0;">
                <tr>
                  <td style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 22px; overflow: hidden; box-shadow: 0 20px 54px rgba(15, 23, 42, 0.08);">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                      <tr>
                        <td style="background: linear-gradient(135deg, #eef2ff 0%, #f0fdf4 100%); padding: 30px 34px;">
                          <p style="margin: 0; color: #6366f1; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;">Account Security</p>
                          <h1 style="margin: 12px 0 6px; font-size: 24px; line-height: 1.35; font-weight: 700; color: #111827;">Reset your password</h1>
                          <p style="margin: 0; font-size: 14px; color: #4b5563; line-height: 1.6;">
                            Hi ${safeName}, use the button below to set a new password for your Advisor Chooser account.
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 28px 32px 24px;">
                          <div style="text-align: center; margin: 26px 0;">
                            <a href="${resetHref}" style="display: inline-block; padding: 14px 28px; border-radius: 999px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none;">Reset Password</a>
                          </div>
                          <p style="margin: 0 0 12px; font-size: 13px; color: #4b5563;">Or copy and paste this secure link into your browser:</p>
                          <p style="margin: 0 0 18px; font-size: 12px; color: #6b7280; word-break: break-all;">${resetText}</p>
                          <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; padding: 18px; margin-bottom: 24px;">
                            <ul style="margin: 0; padding-left: 16px; font-size: 13px; color: #4b5563; line-height: 1.7;">
                              <li>The link expires in 60 minutes.</li>
                              <li>If you didn’t request a reset, your current password stays active.</li>
                              <li>Need help? Email support@advisorchooser.com anytime.</li>
                            </ul>
                          </div>
                          <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">This is an automated message. Please do not reply.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 22px auto 0; max-width: 640px; font-size: 12px; color: #9ca3af; text-align: center;">If you didn’t request a password reset, no action is required.</p>
            </div>
          </body>
        </html>`,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Password reset email sent successfully to:', email);
    } catch (error) {
      console.error('Password reset email sending failed:', error);
      throw error;
    }
  }

  async sendSubscriptionExpiredEmail(params: {
    email: string;
    advisorName: string;
    planLabel: string;
    expiryDate: string;
    ctaUrl: string;
  }): Promise<void> {
    const { email, advisorName, planLabel, expiryDate, ctaUrl } = params;
    const template = this.loadTemplate('subscription-expired.hbs');
    const html = this.applyTemplate(template, {
      advisorName,
      planLabel,
      expiryDate,
      ctaUrl,
    });
    await this.sendEmail({
      to: email,
      subject: 'Your Advisor Chooser access has expired',
      html,
    });
  }

  async sendPaymentFailedEmail(params: {
    email: string;
    advisorName: string;
    planLabel: string;
    attemptDate: string;
    ctaUrl: string;
    failureReason?: string | null;
  }): Promise<void> {
    const {
      email,
      advisorName,
      planLabel,
      attemptDate,
      ctaUrl,
      failureReason,
    } = params;
    const template = this.loadTemplate('payment-failed.hbs');
    const html = this.applyTemplate(template, {
      advisorName,
      planLabel,
      attemptDate,
      ctaUrl,
      failureReason: failureReason || '',
    });
    await this.sendEmail({
      to: email,
      subject: 'Action required: update your Advisor Chooser billing details',
      html,
    });
  }
}
