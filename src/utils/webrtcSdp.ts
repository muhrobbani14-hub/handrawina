export const MAX_WEBRTC_SDP_LENGTH = 32_000;

export function requireWebRtcSdp(
  value: unknown,
  description: 'offer' | 'answer'
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`SDP ${description} WebRTC kosong atau tidak valid.`);
  }
  if (value.length > MAX_WEBRTC_SDP_LENGTH) {
    throw new Error(
      `SDP ${description} WebRTC melebihi batas ${MAX_WEBRTC_SDP_LENGTH} karakter.`
    );
  }
  return value;
}
