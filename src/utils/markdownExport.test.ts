import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFullTddMarkdown } from './markdownExport';

test('generateFullTddMarkdown includes all required TDD sections, Mermaid blocks, and DDL schemas', () => {
  const md = generateFullTddMarkdown();

  assert.ok(md.includes('# Technical Design Document (TDD): Handrawina'));
  assert.ok(md.includes('Signal Protocol'));
  assert.ok(md.includes('Double Ratchet'));
  assert.ok(md.includes('Sender Keys'));
  assert.ok(md.includes('1.500 peserta'));
  assert.ok(md.includes('Multi-Device'));
  assert.ok(md.includes('WebRTC'));
  assert.ok(md.includes('STUN/TURN'));
  assert.ok(md.includes('HSM'));
  assert.ok(md.includes('OPAQUE'));
  assert.ok(md.includes('Webhook'));
  assert.ok(md.includes('CREATE TABLE accounts'));
  assert.ok(md.includes('offline_device_inbox'));

  // Ensure all 6 Mermaid diagrams are exported in fenced blocks
  const mermaidBlockCount = (md.match(/```mermaid/g) ?? []).length;
  assert.equal(mermaidBlockCount, 6);
});
