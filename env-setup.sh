#!/bin/bash

echo "🔧 Adding environment variables to Vercel..."

# Add all environment variables
vercel env add NODE_ENV production production
vercel env add MONGODB_URI "mongodb+srv://admin_db_user:admin123456789@advisor-seller-project.gljhl4t.mongodb.net/" production
vercel env add JWT_SECRET "your-super-secret-jwt-key-change-in-production" production
vercel env add EMAIL_USER "farrukhwebpenter@gmail.com" production
vercel env add EMAIL_PASS "xvutyuqxpmvxpdwy" production
vercel env add EMAIL_HOST "smtp.gmail.com" production
vercel env add EMAIL_PORT "587" production
vercel env add EMAIL_SECURE "false" production
vercel env add FRONTEND_URL "https://your-frontend-domain.vercel.app" production
vercel env add STRIPE_SECRET_KEY "sk_test_your_stripe_secret_key_here" production
vercel env add STRIPE_PUBLISHABLE_KEY "pk_test_your_stripe_publishable_key_here" production

echo "✅ Environment variables added successfully!"
echo "🚀 Redeploying with new environment variables..."

# Redeploy to apply environment variables
vercel --prod

echo "✅ Deployment complete with environment variables!"