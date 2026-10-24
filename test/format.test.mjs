import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber } from '../web/src/utils/format.js';

describe('formatNumber', () => {
  it('uses Indonesian thousands separators for numeric values and numeric strings', () => {
    assert.equal(formatNumber(1234567), '1.234.567');
    assert.equal(formatNumber('1234567'), '1.234.567');
  });

  it('renders missing and invalid values as zero', () => {
    assert.equal(formatNumber(null), '0');
    assert.equal(formatNumber('not-a-number'), '0');
  });
});
