import React from 'react';
import { Platform } from 'react-native';
import { DamuAvatar as WebDamuAvatar, DamuAvatarProps } from './DamuAvatar.web';
import { DamuAvatar as NativeDamuAvatar } from './DamuAvatar.native';

export { DamuAvatarFallback } from './DamuAvatarFallback';
export { createDamuScene } from './damuScene';
export type { DamuSceneMode, DamuSceneController, DamuSceneOptions } from './damuScene';
export type { DamuAvatarProps };

export const DamuAvatar: React.FC<DamuAvatarProps> = (props) => {
  return React.createElement(Platform.OS === 'web' ? WebDamuAvatar : NativeDamuAvatar, props);
};
