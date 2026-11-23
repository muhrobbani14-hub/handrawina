export type AppWorkspaceTab =
  | 'status'
  | 'calls'
  | 'security'
  | 'chats'
  | 'settings';

export type ConversationKind = 'direct' | 'group' | 'business';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface EncryptedEnvelope {
  algorithm: 'AES-256-GCM';
  protocol: 'Signal-DoubleRatchet' | 'SenderKeys-O1';
  ivBase64: string;
  ciphertextBase64: string;
  ratchetStep: number;
  senderKeyEpoch?: number;
  aad: string;
}

export interface ProductAttachment {
  productId: string;
  sku: string;
  title: string;
  priceIdr: number;
  description: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderDeviceId: string;
  kind: 'text' | 'voice' | 'media' | 'product' | 'system';
  plaintext: string;
  voiceDurationSec?: number;
  mediaLabel?: string;
  mediaSizeKb?: number;
  product?: ProductAttachment;
  envelope?: EncryptedEnvelope;
  timestamp: string;
  status: MessageStatus;
}

export interface Conversation {
  id: string;
  name: string;
  handle: string;
  kind: ConversationKind;
  initials: string;
  unreadCount: number;
  lastActiveText: string;
  online: boolean;
  participantCount: number;
  maxParticipants?: number;
  senderKeyEpoch?: number;
  peerPublicKeyFingerprint: string;
  labels: string[];
  pinned?: boolean;
}

export interface PairedDevice {
  deviceId: string;
  deviceIndex: number;
  name: string;
  platform: 'iOS' | 'Android' | 'Web' | 'Desktop';
  isPrimary: boolean;
  online: boolean;
  lastActive: string;
  advSignatureShort: string;
}

export interface AccountProfile {
  accountId: string;
  displayName: string;
  phoneNumber: string;
  phoneHashShort: string;
  primaryIdentityPubShort: string;
  primaryPhoneOnline: boolean;
}

export interface BusinessProduct {
  id: string;
  sku: string;
  title: string;
  priceIdr: number;
  description: string;
  active: boolean;
}

export interface AutoReplyRule {
  id: string;
  triggerKeyword: string;
  responseText: string;
  enabled: boolean;
}

export interface WebhookEndpoint {
  id: string;
  targetUrl: string;
  events: string[];
  circuitState: 'CLOSED' | 'OPEN';
  lastDeliveredAt: string | null;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  event: string;
  statusCode: number;
  signatureHeader: string;
  latencyMs: number;
  timestamp: string;
}

export interface CallRecord {
  id: string;
  conversationId: string;
  peerName: string;
  mode: 'audio' | 'video';
  topology: 'P2P-DTLS-SRTP' | 'TURN-Relay-SRTP' | 'SFU-SFrame-E2EE';
  participants: string[];
  startedAt: string;
  durationSec: number;
  direction: 'outgoing' | 'incoming';
}

export type BackdropPresetId = 'obsidian-gold' | 'emerald-nocturne' | 'penthouse-dusk';
export type BackdropIntensity = 'subtle' | 'balanced' | 'cinematic';

export interface AppSettings {
  aboutText: string;
  readReceiptsEnabled: boolean;
  typingIndicatorsEnabled: boolean;
  backdropPreset: BackdropPresetId;
  backdropIntensity: BackdropIntensity;
  backdropMotion: boolean;
  navbarTheme: StatusTheme;
}

export type StatusTheme = 'navy' | 'champagne' | 'orange-light' | 'bronze';
export type StatusAudience = 'all-contacts' | 'close-circle' | 'selected-groups';

export interface StatusReaction {
  label: string;
  count: number;
  reactedByMe?: boolean;
}

export interface StatusUpdate {
  id: string;
  authorId: string;
  conversationId?: string;
  authorName: string;
  authorRole?: string;
  authorInitials: string;
  text: string;
  captionTag?: string;
  theme: StatusTheme;
  audience: StatusAudience;
  createdAt: string;
  expiresInLabel: string;
  viewedByMe: boolean;
  viewerNames: string[];
  reactions: StatusReaction[];
}

export interface CommunitySubGroup {
  id: string;
  conversationId?: string;
  name: string;
  description: string;
  participantCount: number;
  senderKeyEpoch: number;
  joined: boolean;
}

export interface CommunityAnnouncement {
  id: string;
  authorName: string;
  text: string;
  timestamp: string;
}

export interface Community {
  id: string;
  name: string;
  initials: string;
  category: string;
  description: string;
  memberCount: number;
  adminName: string;
  subGroups: CommunitySubGroup[];
  announcements: CommunityAnnouncement[];
}

