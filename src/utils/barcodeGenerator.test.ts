import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCode128B, parseHandrawinaJoinInput } from './barcodeGenerator';

test('encodeCode128B generates valid Code-128B bars with quiet zones and non-zero width', () => {
  const encoded = encodeCode128B('HND-INV-8492A1');
  assert.equal(encoded.encodedText, 'HND-INV-8492A1');
  assert.ok(encoded.bars.length > 30);
  assert.ok(encoded.totalWidth > 180);

  // Bars must be strictly ordered and non-overlapping
  for (let i = 1; i < encoded.bars.length; i += 1) {
    const prev = encoded.bars[i - 1];
    const curr = encoded.bars[i];
    assert.ok(curr.x > prev.x + prev.width, 'Bars should have white space gap between them');
  }
});

test('parseHandrawinaJoinInput parses raw codes and QR deep-link URLs accurately', () => {
  assert.deepEqual(parseHandrawinaJoinInput('hnd-pair-9a2f10'), {
    kind: 'pair',
    code: 'HND-PAIR-9A2F10',
  });
  assert.deepEqual(
    parseHandrawinaJoinInput('https://handrawina.app/?join=HND-INV-7741BC'),
    {
      kind: 'invite',
      code: 'HND-INV-7741BC',
    }
  );
  assert.deepEqual(
    parseHandrawinaJoinInput('https://handrawina.app/?call=HND-VID-5501XY'),
    {
      kind: 'call',
      code: 'HND-VID-5501XY',
    }
  );
  assert.equal(parseHandrawinaJoinInput('invalid-code').kind, 'invalid');
});
