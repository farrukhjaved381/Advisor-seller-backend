# 🚀 Vercel Deployment Guide

## Quick Deploy to Vercel

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Deploy from Project Root
```bash
cd /path/to/backend
vercel --prod
```

## Environment Variables Setup

Add these environment variables in Vercel Dashboard:

### Required Variables:
```
NODE_ENV=production
# Environment Variables
NODE_ENV=production
JWT_SECRET=your-production-secret
MONGODB_URI=your-production-mongodb-uri
SMTP_HOST=your-smtp-host
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
FRONTEND_URL=https://your-frontend-domain.com
```

## Deployment Steps:

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Deploy to Vercel**:
   ```bash
   vercel --prod
   ```

3. **Set Environment Variables** in Vercel Dashboard

4. **Test the deployment**:
   - API: `https://your-app.vercel.app`
   - Docs: `https://your-app.vercel.app/docs`

## Post-Deployment:

1. Update CORS settings for production domain
2. Configure Stripe webhooks (if needed)
3. Set up monitoring and logging
4. Test all API endpoints

## Vercel Configuration:
- ✅ `vercel.json` configured for NestJS
- ✅ Serverless function export added
- ✅ Build scripts optimized
- ✅ Environment variables ready