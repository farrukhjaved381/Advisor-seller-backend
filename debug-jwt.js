const jwt = require('jsonwebtoken');
require('dotenv').config();

const secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
console.log('JWT_SECRET from env:', process.env.JWT_SECRET);
console.log('Using secret:', secret);

// Test token generation and verification
const testPayload = {
  sub: '123456789',
  email: 'test@example.com',
  role: 'seller'
};

const token = jwt.sign(testPayload, secret, { expiresIn: '24h' });
console.log('Generated token:', token);

try {
  const decoded = jwt.verify(token, secret);
  console.log('Token verified successfully:', decoded);
} catch (error) {
  console.log('Token verification failed:', error.message);
}