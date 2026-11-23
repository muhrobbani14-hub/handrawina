import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_WEBRTC_SDP_LENGTH, requireWebRtcSdp } from './webrtcSdp';

test('requireWebRtcSdp preserves SDP line endings and content', () => {
  const sdp = 'v=0\r\na=msid-semantic: WMS *\r\n';
  assert.equal(requireWebRtcSdp(sdp, 'offer'), sdp);
});

test('requireWebRtcSdp rejects empty and oversized descriptions instead of truncating', () => {
  assert.throws(() => requireWebRtcSdp('', 'offer'), /kosong atau tidak valid/);
  assert.throws(
    () => requireWebRtcSdp('x'.repeat(MAX_WEBRTC_SDP_LENGTH + 1), 'answer'),
    /melebihi batas/
  );
});
