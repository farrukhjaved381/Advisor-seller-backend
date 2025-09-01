#!/bin/bash

echo "🚀 Deploying Seller-Advisor Backend to Vercel..."

# Build the project
echo "📦 Building project..."
npm run build

# Deploy to Vercel
echo "🌐 Deploying to Vercel..."
vercel --prod

echo "✅ Deployment complete!"
echo "📚 API Documentation: https://your-app.vercel.app/docs"
echo "🔗 API Base URL: https://your-app.vercel.app"

echo ""
echo "🔧 Next Steps:"
echo "1. Set environment variables in Vercel Dashboard"
echo "2. Update FRONTEND_URL in environment variables"
echo "3. Test all API endpoints"
echo "4. Configure Stripe webhooks (if needed)"