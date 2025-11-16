const OneSignal = require('onesignal-node');

let oneSignalClient = null;

const initializeOneSignal = () => {
  if (!process.env.ONESIGNAL_APP_ID || !process.env.ONESIGNAL_REST_API_KEY) {
    console.warn('⚠️  OneSignal credentials not found. Notifications will be disabled.');
    return null;
  }

  try {
    oneSignalClient = new OneSignal.Client({
      userAuthKey: process.env.ONESIGNAL_USER_AUTH_KEY || '', // Optional: for user-specific operations
      app: {
        appAuthKey: process.env.ONESIGNAL_REST_API_KEY,
        appId: process.env.ONESIGNAL_APP_ID
      }
    });

    // OneSignal initialized successfully
    return oneSignalClient;
  } catch (error) {
    console.error('❌ Error initializing OneSignal:', error);
    return null;
  }
};

const getOneSignalClient = () => {
  if (!oneSignalClient) {
    oneSignalClient = initializeOneSignal();
  }
  return oneSignalClient;
};

module.exports = {
  initializeOneSignal,
  getOneSignalClient
};

