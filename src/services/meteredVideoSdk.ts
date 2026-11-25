export interface MeteredTrackEvent {
  streamId: string;
  type: 'audio' | 'video';
  participantSessionId?: string;
  track: MediaStreamTrack;
  name?: string;
}

export interface MeteredParticipant {
  _id: string;
  name: string;
  isAdmin: boolean;
}

export interface MeteredMeetingInfo {
  participantSessionId: string;
  onlineParticipants: MeteredParticipant[];
}

export interface MeteredVideoInputDevice {
  deviceId: string;
  groupId: string;
  label: string;
}

export interface MeteredMeeting {
  join(options: {
    roomURL: string;
    name: string;
    accessToken: string;
  }): Promise<MeteredMeetingInfo>;
  startAudio(): Promise<void>;
  startVideo(): Promise<void>;
  stopVideo(): Promise<void>;
  listVideoInputDevices(): Promise<MeteredVideoInputDevice[]>;
  chooseVideoInputDevice(deviceId: string): Promise<void>;
  getLocalVideoStream(): Promise<MediaStream>;
  muteLocalAudio(): Promise<void>;
  unmuteLocalAudio(): Promise<void>;
  leaveMeeting(): Promise<void>;
  on(
    event: 'localTrackStarted' | 'localTrackUpdated' | 'localTrackStopped',
    listener: (event: MeteredTrackEvent) => void
  ): void;
  on(event: 'remoteTrackStarted' | 'remoteTrackStopped', listener: (event: MeteredTrackEvent) => void): void;
  on(event: 'participantJoined' | 'participantLeft', listener: (event: MeteredParticipant) => void): void;
  on(event: 'onlineParticipants', listener: (participants: MeteredParticipant[]) => void): void;
  on(event: 'stateChanged', listener: (state: string) => void): void;
  on(event: 'meetingEnded' | 'meetingLeft', listener: () => void): void;
}

export function getNextVideoInputDevice(
  devices: MeteredVideoInputDevice[],
  currentDeviceId: string | null
): MeteredVideoInputDevice | null {
  if (devices.length < 2) return null;
  const currentIndex = devices.findIndex((device) => device.deviceId === currentDeviceId);
  const nextIndex = currentIndex < 0 ? 1 : (currentIndex + 1) % devices.length;
  return devices[nextIndex] ?? null;
}

interface MeteredNamespace {
  Meeting: new () => MeteredMeeting;
}

declare global {
  interface Window {
    Metered?: MeteredNamespace;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

export function loadMeteredVideoSdk(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Metered Video SDK hanya tersedia di browser.'));
  }
  if (window.Metered) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.metered.ca/sdk/video/1.4.6/sdk.min.js';
    script.async = true;
    script.dataset.meteredVideoSdk = 'true';
    script.onload = () => {
      if (window.Metered) {
        resolve();
      } else {
        reject(new Error('Metered Video SDK gagal dimuat.'));
      }
    };
    script.onerror = () => {
      reject(new Error('Tidak dapat memuat Metered Video SDK.'));
    };
    document.head.append(script);
  }).catch((error: unknown) => {
    sdkLoadPromise = null;
    throw error;
  });

  return sdkLoadPromise;
}
