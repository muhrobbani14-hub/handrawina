# Handrawina Multi-User Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **PII Isolation**: User email and phone number reside solely in `/users/{userId}` and are strictly readable/writable by `request.auth.uid == userId`. `/publicProfiles/{userId}` contains zero PII and forbids `list` queries.
2. **Master Gate Membership**: Messages in `/conversations/{convId}/messages/{messageId}` require parent conversation membership (`request.auth.uid in get(.../conversations/$(convId)).data.participantIds`) for single-doc reads/writes, and `request.auth.uid in resource.data.participantIds` for `list` queries (zero `get()` inside `allow list`).
3. **Verified Identity & Immutability**: All write operations mandate `request.auth.token.email_verified == true`. Creator/owner UIDs (`uid`, `ownerUid`, `creatorUid`, `senderId`, `hostUid`, `authorId`) and `createdAt` are immutable after creation.
4. **Temporal Integrity**: `createdAt == request.time` on creation; `updatedAt == request.time` on creation and update.
5. **Terminal State Locking**: Once a `qrTokens/{tokenCode}` reaches `'redeemed'` or `'expired'`, or a `callRooms/{roomCode}` reaches `'ended'`, or a `message` reaches `'read'`, no further updates are permitted.
6. **Atomicity on QR Invite Redemption**: Redeeming an `'invite'` QR token with a non-empty `conversationId` requires `existsAfter(/databases/$(database)/documents/conversations/$(incoming().conversationId))` in the same atomic batch.
7. **Strict Schema & Volumetric Guards**: Every collection validates exact required/allowed keys (`hasAll` + `hasOnly`), `isValidId()` regex on path variables, strict string `.size()` ceilings, and bounded arrays (`<= 10` participants, `<= 40` ICE candidates, `<= 50` status viewers).

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **PII Cross-User Read**: User B attempts `get /users/userA`.
2. **Public Profile Scraping**: User B attempts `list /publicProfiles`.
3. **Shadow Field Injection on Profile**: User A creates `/users/userA` with extra ghost field `isAdmin: true`.
4. **Identity Spoofing on Message**: User B creates a message inside a shared conversation with `senderId: "userA"`.
5. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts to create a conversation or message.
6. **ID Poisoning Attack**: Attacker attempts to create `/qrTokens/../../../evil$$$token` or a 200-char document ID.
7. **Terminal State Violation (QR Token Replay)**: Attacker attempts to update an already `'redeemed'` QR token back to `'active'`.
8. **Terminal State Violation (Ended Call Tampering)**: Attacker attempts to update `answerSdp` on a `callRooms/{roomCode}` whose status is `'ended'`.
9. **Value Poisoning on Whitelisted Update Field**: Recipient attempts to update a message's `status` to `"hacked"` or a 100KB string.
10. **Orphaned Message Write (Master Gate Bypass)**: User C (not in `participantIds`) attempts to create a message in `/conversations/dm_A_B/messages/msg1`.
11. **Timestamp Forgery**: User A attempts to create a status update with a client-forged past `createdAt` timestamp instead of `request.time`.
12. **Array Overflow (Denial of Wallet)**: User A attempts to create a conversation with 15 entries in `participantIds` (exceeding max bound of 10).
