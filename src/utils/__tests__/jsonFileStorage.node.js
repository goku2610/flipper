/**
 * Copyright 2018-present Facebook.
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * @format
 */

import JsonFileStorage from '../jsonFileReduxPersistStorage.tsx';
import fs from 'fs';

const validSerializedData = fs
  .readFileSync('src/utils/__tests__/data/settings-v1-valid.json')
  .toString()
  .trim();

const validDeserializedData =
  '{"androidHome":"\\"/opt/android_sdk\\"","something":"{\\"else\\":4}","_persist":"{\\"version\\":-1,\\"rehydrated\\":true}"}';

const storage = new JsonFileStorage(
  'src/utils/__tests__/data/settings-v1-valid.json',
);

test('A valid settings file gets parsed correctly', () => {
  return storage
    .getItem('anykey')
    .then(result => expect(result).toEqual(validDeserializedData));
});

test('deserialize works as expected', () => {
  const deserialized = storage.deserializeValue(validSerializedData);
  expect(deserialized).toEqual(validDeserializedData);
});

test('serialize works as expected', () => {
  const serialized = storage.serializeValue(validDeserializedData);
  expect(serialized).toEqual(validSerializedData);
});
