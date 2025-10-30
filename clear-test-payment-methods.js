const { MongoClient } = require('mongodb');
require('dotenv').config();

async function clearTestPaymentMethods() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('Clearing all test payment data...');
    
    // Clear ALL payment-related data to force fresh start with live keys
    const result = await db.collection('users').updateMany(
      {},
      {
        $unset: {
          stripeCustomerId: "",
          stripeSubscriptionId: "",
          billing: "",
        },
        $set: {
          isPaymentVerified: false,
          subscription: { status: 'none' }
        }
      }
    );
    
    console.log(`Updated ${result.modifiedCount} users`);
    
    // Clear ALL payment history to start fresh
    const historyResult = await db.collection('paymenthistories').deleteMany({});
    console.log(`Deleted ${historyResult.deletedCount} payment history records`);
    
    console.log('All payment data cleared - ready for live payments!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

clearTestPaymentMethods();