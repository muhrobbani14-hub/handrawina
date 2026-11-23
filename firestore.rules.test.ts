import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RULES_PATH = path.resolve(process.cwd(), 'firestore.rules');
const BLUEPRINT_PATH = path.resolve(process.cwd(), 'firebase-blueprint.json');

function readRules(): string {
  if (fs.existsSync(RULES_PATH)) {
    return fs.readFileSync(RULES_PATH, 'utf8');
  }
  return fs.readFileSync(path.resolve(process.cwd(), 'DRAFT_firestore.rules'), 'utf8');
}

function readBlueprint(): {
  entities: Record<string, { required?: string[]; properties: Record<string, unknown> }>;
  firestore: Record<string, { schema: { $ref: string }; description: string }>;
} {
  return JSON.parse(fs.readFileSync(BLUEPRINT_PATH, 'utf8'));
}

test('Phase 0 Dirty Dozen #1 & #2: PII isolation on /users and no blanket list on /publicProfiles', () => {
  const rules = readRules();
  assert.match(rules, /match \/users\/\{userId\}[\s\S]*?allow get: if isSignedIn\(\) && isValidId\(userId\) && request\.auth\.uid == userId;/);
  assert.match(rules, /match \/users\/\{userId\}[\s\S]*?allow list: if false;/);
  assert.match(rules, /match \/publicProfiles\/\{userId\}[\s\S]*?allow list: if false;/);
});

test('Phase 0 Dirty Dozen #3: Shadow field injection blocked via hasAll + hasOnly on all blueprints', () => {
  const rules = readRules();
  const blueprintFns = [
    'isValidUserPrivate',
    'isValidPairedDevice',
    'isValidCallLog',
    'isValidSavedContact',
    'isValidPhoneDirectoryEntry',
    'isValidPublicProfile',
    'isValidQrToken',
    'isValidConversation',
    'isValidMessage',
    'isValidCallRoom',
    'isValidCallSignalBucket',
    'isValidStatusUpdate',
  ];
  for (const fn of blueprintFns) {
    const fnIdx = rules.indexOf(`function ${fn}(data)`);
    assert.ok(fnIdx !== -1, `Missing validation blueprint ${fn}`);
    const slice = rules.slice(fnIdx, fnIdx + 2200);
    assert.ok(slice.includes('data.keys().hasAll('), `${fn} must enforce hasAll`);
    assert.ok(slice.includes('data.keys().hasOnly('), `${fn} must enforce hasOnly`);
  }
});

test('Phase 0 Dirty Dozen #4 & #5: Verified Google/Phone auth mandate, phoneKey anti-hijack, and sender integrity', () => {
  const rules = readRules();
  assert.match(rules, /function isVerifiedUser\(\)[\s\S]*?email_verified == true[\s\S]*?isPhoneAccount\(\)/);
  assert.match(rules, /match \/phoneDirectory\/\{phoneKey\}[\s\S]*?allow list: if false;/);
  assert.match(rules, /match \/phoneDirectory\/\{phoneKey\}[\s\S]*?request\.auth\.token\.email == \(phoneKey \+ '@phone\.handrawina\.app'\)/);
  assert.match(rules, /match \/messages\/\{messageId\}[\s\S]*?allow create: if isVerifiedUser\(\)[\s\S]*?incoming\(\)\.senderId == request\.auth\.uid/);
});

test('Phase 0 Dirty Dozen #6: Path Variable Hardening (ID Poisoning Guard)', () => {
  const rules = readRules();
  assert.match(rules, /function isValidId\(id\)\s*\{\s*return id is string && id\.size\(\) >= 1 && id\.size\(\) <= 128 && id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\);\s*\}/);
  assert.match(rules, /function isValidPhoneKey\(key\)\s*\{\s*return key is string && key\.size\(\) >= 8 && key\.size\(\) <= 15 && key\.matches\('\^\[0-9\]\{8,15\}\$'\);\s*\}/);
  assert.match(rules, /match \/qrTokens\/\{tokenCode\}[\s\S]*?allow create: if isVerifiedUser\(\)\s*&& isValidId\(tokenCode\)/);
});

test('Phase 0 Dirty Dozen #7 & #8: Terminal State Locking on QR tokens, callRooms, and read messages', () => {
  const rules = readRules();
  assert.match(rules, /match \/qrTokens\/\{tokenCode\}[\s\S]*?allow update:[\s\S]*?existing\(\)\.status == 'active'/);
  assert.match(rules, /match \/callRooms\/\{roomCode\}[\s\S]*?allow update:[\s\S]*?existing\(\)\.status != 'ended'/);
  assert.match(rules, /match \/messages\/\{messageId\}[\s\S]*?allow update:[\s\S]*?existing\(\)\.status != 'read'/);
});

test('Phase 0 Dirty Dozen #9: Value poisoning prevented by validation blueprint on every update block', () => {
  const rules = readRules();
  const updateBlocks = rules.match(/allow update: if [^;]+;/g) ?? [];
  assert.ok(updateBlocks.length >= 9, 'Expected at least 9 update blocks');
  for (const block of updateBlocks) {
    if (block.includes('allow update: if false;')) continue;
    assert.match(block, /isValid[A-Za-z]+\(incoming\(\)\)/, `Update block missing validation blueprint: ${block}`);
    assert.match(block, /affectedKeys\(\)\.hasOnly\(/, `Update block missing affectedKeys().hasOnly(): ${block}`);
  }
});

test('Phase 0 Dirty Dozen #10: Master Gate on subcollections and secure list queries with zero get() in allow list', () => {
  const rules = readRules();
  // Verify Master Gate on messages & contacts
  assert.match(rules, /match \/messages\/\{messageId\}[\s\S]*?get\(\/databases\/\$\(database\)\/documents\/conversations\/\$\(convId\)\)\.data\.participantIds/);
  assert.match(rules, /match \/contacts\/\{contactUid\}[\s\S]*?exists\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\)/);
  // Verify NO get() or exists() in any allow list block
  const listBlocks = rules.match(/allow list: if [^;]+;/g) ?? [];
  assert.ok(listBlocks.length >= 8);
  for (const block of listBlocks) {
    assert.ok(!block.includes('get('), `Cost violation: get() inside allow list: ${block}`);
    assert.ok(!block.includes('exists('), `Cost violation: exists() inside allow list: ${block}`);
    if (!block.includes('allow list: if false;')) {
      assert.ok(block.includes('resource.data'), `Query trust violation: allow list must inspect resource.data: ${block}`);
    }
  }
});

test('Phase 0 Dirty Dozen #11 & #12: Temporal integrity (request.time) and bounded arrays', () => {
  const rules = readRules();
  assert.match(rules, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rules, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(rules, /isBoundedStringList\(data\.participantIds, 1, 10\)/);
  assert.match(rules, /isBoundedCandidateList\(data\.candidateStrings, 40\)/);
  assert.match(rules, /isBoundedStringList\(data\.visibleToUids, 1, 50\)/);
});

test('Blueprint coverage: every collection in firebase-blueprint.json has a matching rule block', () => {
  const bp = readBlueprint();
  const rules = readRules();
  assert.ok(rules.includes('match /{document=**}'), 'Global default-deny catch-all missing');
  const expectedMatchers = [
    'match /users/{userId}',
    'match /devices/{deviceId}',
    'match /callLogs/{callId}',
    'match /contacts/{contactUid}',
    'match /phoneDirectory/{phoneKey}',
    'match /publicProfiles/{userId}',
    'match /qrTokens/{tokenCode}',
    'match /conversations/{convId}',
    'match /messages/{messageId}',
    'match /callRooms/{roomCode}',
    'match /signals/{signalRole}',
    'match /statuses/{statusId}',
  ];
  assert.equal(Object.keys(bp.firestore).length, expectedMatchers.length);
  for (const m of expectedMatchers) {
    assert.ok(rules.includes(m), `Missing rule matcher for ${m}`);
  }
});
