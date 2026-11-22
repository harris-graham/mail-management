import { formatBytes, formatDate, humanizeAction } from './utils/format';

describe('formatting helpers', () => {
  test('formats ISO dates without crashing', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('2026-01-15')).not.toBe('—');
  });

  test('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  test('humanizes audit actions', () => {
    expect(humanizeAction('mail.attachment.add')).toBe('Mail Attachment Add');
  });
});
