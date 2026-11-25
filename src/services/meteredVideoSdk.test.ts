import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getNextVideoInputDevice,
  type MeteredVideoInputDevice,
} from './meteredVideoSdk.ts';

const cameras: MeteredVideoInputDevice[] = [
  { deviceId: 'front', groupId: 'mobile', label: 'Front camera' },
  { deviceId: 'back', groupId: 'mobile', label: 'Back camera' },
];

test('camera selection rotates to the next available device', () => {
  assert.equal(getNextVideoInputDevice(cameras, 'front')?.deviceId, 'back');
  assert.equal(getNextVideoInputDevice(cameras, 'back')?.deviceId, 'front');
});

test('camera rotation reports no alternative when only one device is available', () => {
  assert.equal(getNextVideoInputDevice(cameras.slice(0, 1), 'front'), null);
});
