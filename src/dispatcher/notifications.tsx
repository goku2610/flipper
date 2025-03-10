/**
 * Copyright 2018-present Facebook.
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * @format
 */

import {Store} from '../reducers/index';
import {Logger} from '../fb-interfaces/Logger';
import {PluginNotification} from '../reducers/notifications';
import {FlipperPlugin, FlipperDevicePlugin} from '../plugin';
import isHeadless from '../utils/isHeadless';
import {ipcRenderer} from 'electron';
import {selectPlugin} from '../reducers/connections';
import {
  setActiveNotifications,
  updatePluginBlacklist,
  updateCategoryBlacklist,
} from '../reducers/notifications';
import {textContent} from '../utils/index';
import GK from '../fb-stubs/GK';

type NotificationEvents = 'show' | 'click' | 'close' | 'reply' | 'action';
const NOTIFICATION_THROTTLE = 5 * 1000; // in milliseconds

export default (store: Store, logger: Logger) => {
  if (GK.get('flipper_disable_notifications')) {
    return;
  }

  const knownNotifications: Set<string> = new Set();
  const knownPluginStates: Map<string, Object> = new Map();
  const lastNotificationTime: Map<string, number> = new Map();

  ipcRenderer.on(
    'notificationEvent',
    (
      _e: Error,
      eventName: NotificationEvents,
      pluginNotification: PluginNotification,
      arg: null | string | number,
    ) => {
      if (eventName === 'click' || (eventName === 'action' && arg === 0)) {
        store.dispatch(
          selectPlugin({
            selectedPlugin: 'notifications',
            selectedApp: null,
            deepLinkPayload: pluginNotification.notification.id,
          }),
        );
      } else if (eventName === 'action') {
        if (arg === 1 && pluginNotification.notification.category) {
          // Hide similar (category)
          logger.track(
            'usage',
            'notification-hide-category',
            pluginNotification,
          );

          const {category} = pluginNotification.notification;
          const {blacklistedCategories} = store.getState().notifications;
          if (category && blacklistedCategories.indexOf(category) === -1) {
            store.dispatch(
              updateCategoryBlacklist([...blacklistedCategories, category]),
            );
          }
        } else if (arg === 2) {
          // Hide plugin
          logger.track('usage', 'notification-hide-plugin', pluginNotification);

          const {blacklistedPlugins} = store.getState().notifications;
          if (blacklistedPlugins.indexOf(pluginNotification.pluginId) === -1) {
            store.dispatch(
              updatePluginBlacklist([
                ...blacklistedPlugins,
                pluginNotification.pluginId,
              ]),
            );
          }
        }
      }
    },
  );

  store.subscribe(() => {
    const {notifications, pluginStates} = store.getState();

    const clientPlugins: Map<string, typeof FlipperPlugin> = store.getState()
      .plugins.clientPlugins;

    const devicePlugins: Map<
      string,
      typeof FlipperDevicePlugin
    > = store.getState().plugins.devicePlugins;

    const pluginMap: Map<
      string,
      typeof FlipperPlugin | typeof FlipperDevicePlugin
    > = new Map<string, typeof FlipperDevicePlugin | typeof FlipperPlugin>([
      ...clientPlugins,
      ...devicePlugins,
    ]);

    Object.keys(pluginStates).forEach(key => {
      if (knownPluginStates.get(key) !== pluginStates[key]) {
        knownPluginStates.set(key, pluginStates[key]);
        const split = key.split('#');
        const pluginId = split.pop();
        const client = split.join('#');

        if (!pluginId) {
          return;
        }

        const persistingPlugin:
          | undefined
          | typeof FlipperPlugin
          | typeof FlipperDevicePlugin = pluginMap.get(pluginId);
        if (persistingPlugin && persistingPlugin.getActiveNotifications) {
          store.dispatch(
            setActiveNotifications({
              notifications: persistingPlugin.getActiveNotifications(
                pluginStates[key],
              ),
              client,
              pluginId,
            }),
          );
        }
      }
    });

    const {
      activeNotifications,
      blacklistedPlugins,
      blacklistedCategories,
    } = notifications;

    activeNotifications.forEach((n: PluginNotification) => {
      if (
        !isHeadless() &&
        store.getState().connections.selectedPlugin !== 'notifications' &&
        !knownNotifications.has(n.notification.id) &&
        blacklistedPlugins.indexOf(n.pluginId) === -1 &&
        (!n.notification.category ||
          blacklistedCategories.indexOf(n.notification.category) === -1)
      ) {
        const prevNotificationTime: number =
          lastNotificationTime.get(n.pluginId) || 0;
        lastNotificationTime.set(n.pluginId, new Date().getTime());
        knownNotifications.add(n.notification.id);

        if (
          new Date().getTime() - prevNotificationTime <
          NOTIFICATION_THROTTLE
        ) {
          // Don't send a notification if the plugin has sent a notification
          // within the NOTIFICATION_THROTTLE.
          return;
        }
        const plugin = pluginMap.get(n.pluginId);
        ipcRenderer.send('sendNotification', {
          payload: {
            title: n.notification.title,
            body: textContent(n.notification.message),
            actions: [
              {
                type: 'button',
                text: 'Show',
              },
              {
                type: 'button',
                text: 'Hide similar',
              },
              {
                type: 'button',
                text: `Hide all ${plugin != null ? plugin.title : ''}`,
              },
            ],
            closeButtonText: 'Hide',
          },
          closeAfter: 10000,
          pluginNotification: n,
        });
        logger.track('usage', 'native-notification', n.notification);
      }
    });
  });
};
