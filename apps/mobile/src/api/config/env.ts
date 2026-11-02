import { Platform } from 'react-native';

/**
 * Mobile Environment Configuration
 * For physical devices on Expo Go, replace localhost with your machine's LAN IP (e.g. http://192.168.1.X:3000)
 * Android Emulator uses http://10.0.2.2:3000
 */
const LOCAL_API_URL = Platform.select({
  android: 'http://10.0.2.2:3000/api', // default Android emulator loopback
  ios: 'http://localhost:3000/api',
  default: 'http://localhost:3000/api',
});

export const ENV = {
  API_URL: process.env.EXPO_PUBLIC_API_URL || LOCAL_API_URL,
  APP_ENV: process.env.NODE_ENV || 'development',
  ENABLE_ANALYTICS: false,
};

export default ENV;