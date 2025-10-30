const { MongoClient } = require('mongodb');
require('dotenv').config();

async function clearTestData() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('Clearing test payment data...');
    
    // Clear test payment methods and subscription data
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
    
    // Clear payment history with test data
    const historyResult = await db.collection('paymenthistories').deleteMany({
      $or: [
        { paymentId: { $regex: /^pm_1/ } }, // Test payment methods start with pm_1
        { paymentId: { $regex: /^pi_1/ } }, // Test payment intents start with pi_1
        { paymentId: { $regex: /^sub_1/ } } // Test subscriptions start with sub_1
      ]
    });
    
    console.log(`Deleted ${historyResult.deletedCount} test payment history records`);
    
    console.log('Test data cleared successfully!');
    
  } catch (error) {
    console.error('Error clearing test data:', error);
  } finally {
    await client.close();
  }
}

clearTestData();