const { buildIcs } = require('../../../src/services/reminderService');
const { buildRawMessage } = require('../../../src/services/googleService');
const { encrypt, decrypt } = require('../../../src/utils/tokenCrypto');
const { sanitizeSettings, digestText } = require('../../../src/services/automationService');

describe('buildIcs', () => {
  test('makes all-day events with one alarm per reminder day and escapes text', () => {
    const ics = buildIcs([{ key: 'grant:1:deadline', title: 'Grant due: Eccles, Inc; Youth', detail: 'line1\nline2', date: '2027-03-15T00:00:00Z' }], { reminderDays: [7, 2], now: new Date('2026-11-24T00:00:00Z') });
    expect(ics).toMatch(/DTSTART;VALUE=DATE:20270315/);
    expect(ics).toMatch(/DTEND;VALUE=DATE:20270316/);
    expect(ics).toMatch(/SUMMARY:Grant due: Eccles\\, Inc\\; Youth/);
    expect(ics).toMatch(/DESCRIPTION:line1\\nline2/);
    expect((ics.match(/BEGIN:VALARM/g) || []).length).toBe(2);
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
});

describe('buildRawMessage', () => {
  const decode = (raw) => Buffer.from(raw, 'base64url').toString('utf8');

  test('plain message encodes a non-ASCII subject', () => {
    const msg = decode(buildRawMessage({ to: 'grants@funder.org', subject: 'Proposal — youth', text: 'Hello' }));
    expect(msg).toMatch(/^To: grants@funder.org/);
    expect(msg).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(msg).toMatch(/Content-Type: text\/plain/);
  });

  test('attachments make a multipart message with the file name', () => {
    const msg = decode(buildRawMessage({ to: 'a@b.org', subject: 'x', text: 'y', attachments: [{ filename: 'Proposal.docx', mimeType: 'application/octet-stream', content: Buffer.from('abc') }] }));
    expect(msg).toMatch(/multipart\/mixed/);
    expect(msg).toMatch(/filename="Proposal.docx"/);
  });

  test('rejects header injection and bad addresses', () => {
    expect(() => buildRawMessage({ to: 'a@b.org\r\nBcc: evil@x.com', subject: 's', text: 't' })).toThrow(/Invalid email/);
    expect(() => buildRawMessage({ to: 'not-an-email', subject: 's', text: 't' })).toThrow(/Invalid email/);
    const msg = Buffer.from(buildRawMessage({ to: 'a@b.org', subject: 'one\r\nBcc: evil@x.com', text: 't' }), 'base64url').toString('utf8');
    expect(msg).not.toMatch(/^Bcc:/m);
  });
});

describe('tokenCrypto', () => {
  test('round-trips and produces different ciphertext each time', () => {
    const a = encrypt('refresh-token-123');
    const b = encrypt('refresh-token-123');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('refresh-token-123');
  });

  test('tampering is detected', () => {
    const parts = encrypt('secret').split('.');
    parts[2] = Buffer.from('tampered').toString('base64');
    expect(() => decrypt(parts.join('.'))).toThrow();
  });
});

describe('automation settings and digest', () => {
  test('sanitizeSettings keeps known keys, types and ranges', () => {
    const s = sanitizeSettings({ enabled: true, auto_start_min_score: 10, max_new_applications_per_run: 99, reminder_days: [14, '7', -1, 400], hack: 1, auto_send_email_submissions: 'yes' });
    expect(s).toEqual({ enabled: true, auto_start_min_score: 50, max_new_applications_per_run: 10, reminder_days: [14, 7] });
  });

  test('digest lists done, needs-you and problems', () => {
    const text = digestText({ name: 'Dice & Dragons' }, {
      actions: [{ step: 'discover', outcome: 'ok', detail: 'Found 5' }, { step: 'calendar', outcome: 'error', detail: 'Token expired' }],
      needs_you: [{ message: 'Submit on portal' }]
    });
    expect(text).toMatch(/DONE AUTOMATICALLY\n• Found 5/);
    expect(text).toMatch(/NEEDS YOU\n• Submit on portal/);
    expect(text).toMatch(/PROBLEMS\n• calendar: Token expired/);
  });
});
