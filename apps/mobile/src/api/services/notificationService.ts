import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('care-reminders', {
      name: 'Care Reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0f766e',
    });
  }

  const perm = (await Notifications.getPermissionsAsync()) as any;
  const existingStatus = perm?.status;
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const req = (await Notifications.requestPermissionsAsync()) as any;
    finalStatus = req?.status;
  }

  return finalStatus === 'granted';
}

export async function scheduleTaskReminder(
  taskId: string,
  title: string,
  triggerDate: Date
): Promise<string | null> {
  try {
    const now = new Date();
    if (triggerDate <= now) return null;

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'AarogyaDamu Care Reminder',
        body: title,
        data: { taskId },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
    return identifier;
  } catch (error) {
    console.warn('Failed to schedule local notification:', error);
    return null;
  }
}

export async function cancelScheduledReminder(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.warn('Failed to cancel notification:', error);
  }
}