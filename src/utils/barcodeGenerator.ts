/**
 * Pure Code-128B linear barcode encoder and Handrawina join-token parser.
 * Produces standard-compliant ISO/IEC 15417 Code 128B bar patterns for SVG rendering.
 */

// Code 128 bar-width patterns (indices 0..106)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_CODE_B = 104;
const STOP_CODE = 106;

export interface BarcodeBar {
  x: number;
  width: number;
}

export interface EncodedBarcode {
  bars: BarcodeBar[];
  totalWidth: number;
  encodedText: string;
}

/**
 * Encodes printable ASCII text (codes 32..126) into Code-128B bars with quiet zones and checksum.
 */
export function encodeCode128B(rawText: string): EncodedBarcode {
  const sanitized = rawText
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, 48);
  const text = sanitized || 'HND-JOIN';

  const codes: number[] = [START_CODE_B];
  let checksum = START_CODE_B;

  for (let i = 0; i < text.length; i += 1) {
    const value = text.charCodeAt(i) - 32;
    codes.push(value);
    checksum += value * (i + 1);
  }

  const checkDigit = checksum % 103;
  codes.push(checkDigit);
  codes.push(STOP_CODE);

  const quietZone = 10;
  let cursor = quietZone;
  const bars: BarcodeBar[] = [];

  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    for (let j = 0; j < pattern.length; j += 1) {
      const moduleWidth = Number(pattern[j]);
      const isBar = j % 2 === 0;
      if (isBar) {
        bars.push({ x: cursor, width: moduleWidth });
      }
      cursor += moduleWidth;
    }
  }

  return {
    bars,
    totalWidth: cursor + quietZone,
    encodedText: text,
  };
}

export type ParsedJoinToken =
  | { kind: 'pair'; code: string }
  | { kind: 'invite'; code: string }
  | { kind: 'call'; code: string }
  | { kind: 'invalid'; raw: string };

/**
 * Parses either a raw Handrawina code (HND-PAIR-..., HND-INV-..., HND-VID-...)
 * or a scanned QR deep-link URL containing ?join= or ?call= query params.
 */
export function parseHandrawinaJoinInput(input: string): ParsedJoinToken {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'invalid', raw: input };

  let candidate = trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsedUrl = new URL(trimmed);
      candidate =
        parsedUrl.searchParams.get('join') ??
        parsedUrl.searchParams.get('call') ??
        parsedUrl.searchParams.get('pair') ??
        trimmed;
    } catch {
      candidate = trimmed;
    }
  }

  const upper = candidate.toUpperCase();
  if (/^HND-PAIR-[A-Z0-9]{4,16}$/.test(upper)) {
    return { kind: 'pair', code: upper };
  }
  if (/^HND-INV-[A-Z0-9]{4,16}$/.test(upper)) {
    return { kind: 'invite', code: upper };
  }
  if (/^HND-VID-[A-Z0-9]{4,16}$/.test(upper)) {
    return { kind: 'call', code: upper };
  }
  return { kind: 'invalid', raw: trimmed };
}
