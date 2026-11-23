import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AKU_AI_QUICK_PROMPTS,
  buildAkuAiSystemInstruction,
  sanitizeAkuAiHistory,
  validateAkuAiRequest,
} from './akuAiHelpers.ts';

test('validateAkuAiRequest validates messages and sanitizes chat history turns', () => {
  const empty = validateAkuAiRequest({ message: '   ' });
  assert.equal(empty.valid, false);
  assert.ok(empty.error);

  const valid = validateAkuAiRequest({
    message: 'Bantu buat balasan singkat',
    activeConversationName: 'Raka Pratama',
    history: [
      { role: 'user', text: 'Halo Aku AI' },
      { role: 'assistant', text: 'Halo! Ada yang bisa dibantu?' },
      { role: 'system', text: 'should be ignored' },
      { role: 'user', text: '   ' },
    ],
  });

  assert.equal(valid.valid, true);
  assert.equal(valid.message, 'Bantu buat balasan singkat');
  assert.equal(valid.activeConversationName, 'Raka Pratama');
  assert.equal(valid.history.length, 2);
  assert.equal(valid.history[0].role, 'user');
  assert.equal(valid.history[1].role, 'model');
});

test('sanitizeAkuAiHistory caps turns and buildAkuAiSystemInstruction includes persona context', () => {
  const many = Array.from({ length: 24 }, (_, idx) => ({
    role: idx % 2 === 0 ? 'user' : 'assistant',
    text: `Pesan ke-${idx + 1}`,
  }));
  const sanitized = sanitizeAkuAiHistory(many);
  assert.equal(sanitized.length, 16);
  assert.equal(sanitized[0].parts[0].text, 'Pesan ke-9');

  const instruction = buildAkuAiSystemInstruction({
    userName: 'Bima Santoso',
    activeConversationName: 'Lingkar Desain & Produk',
  });
  assert.ok(instruction.includes('Aku AI'));
  assert.ok(instruction.includes('Bima Santoso'));
  assert.ok(instruction.includes('Lingkar Desain & Produk'));
  assert.ok(AKU_AI_QUICK_PROMPTS.length >= 4);
});
