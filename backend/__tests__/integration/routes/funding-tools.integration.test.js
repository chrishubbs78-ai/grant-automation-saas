const request = require('supertest');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const {
  Organization, Grant, RFPAnalysis, Draft, LoanApplication, AutomationRun, GoogleConnection, ApplicationDocument
} = require('../../../src/models');
const { setupTestDatabase } = require('../setup');

const JWT_SECRET = process.env.JWT_SECRET;
const userId = uuidv4();
const orgId = uuidv4();
const token = () => jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
const auth = (r) => r.set('Authorization', `Bearer ${token()}`);
const inDays = (n) => new Date(Date.now() + n * 86400000);

describe('Funding tools: structure, loans, business plan, calendar, automation, Google', () => {
  let app;

  beforeAll(async () => {
    await setupTestDatabase();
    app = require('../../../src/app');
  });

  beforeEach(async () => {
    await Organization.truncate({ cascade: true });
    await Organization.create({
      id: orgId,
      userId,
      name: 'Dice & Dragons',
      mission: 'A board game store with a youth after-school program',
      entityType: 'hybrid',
      fiscalSponsor: { name: 'Utah Youth Fund', program_name: 'Guided Gaming Club' },
      address: { city: 'Ogden', state: 'UT' }
    });
  });

  describe('org structure', () => {
    test('accepts a known entity type and strips unknown sponsor fields', async () => {
      const res = await auth(request(app).put('/api/org')).send({
        entityType: 'for_profit_small_business',
        fiscalSponsor: { name: 'Sponsor', ein: '12-3456789', evil: 'x' }
      });
      expect(res.status).toBe(200);
      const org = await Organization.findByPk(orgId);
      expect(org.entityType).toBe('for_profit_small_business');
      expect(org.fiscalSponsor).toEqual({ name: 'Sponsor', ein: '12-3456789' });
    });

    test('rejects an unknown entity type', async () => {
      const res = await auth(request(app).put('/api/org')).send({ entityType: 'corporation' });
      expect(res.status).toBe(400);
    });
  });

  describe('loans', () => {
    test('overview ranks programs and saving the profile changes readiness', async () => {
      const before = await auth(request(app).get('/api/loans/overview'));
      expect(before.status).toBe(200);
      expect(before.body.data.readiness.score).toBe(0);
      expect(before.body.data.programs.length).toBeGreaterThan(3);

      const res = await auth(request(app).put('/api/loans/profile')).send({
        amount_needed: 60000, owner_equity: 8000, owner_credit_score: 690,
        use_of_funds: [{ item: 'Opening inventory', amount: 25000 }, 'Tables and chairs'], has_tax_returns: true
      });
      expect(res.status).toBe(200);
      expect(res.body.data.readiness.score).toBeGreaterThan(0);
      expect(res.body.data.profile.use_of_funds[1]).toEqual({ item: 'Tables and chairs', amount: null });
    });

    test('rejects a negative amount', async () => {
      const res = await auth(request(app).put('/api/loans/profile')).send({ amount_needed: -5 });
      expect(res.status).toBe(400);
    });

    test('tracks an application, writes a packet and updates status', async () => {
      const created = await auth(request(app).post('/api/loans/applications')).send({ program_key: 'sba_microloan', amount_requested: 45000 });
      expect(created.status).toBe(201);
      expect(created.body.data.lender_name).toBe('SBA Microloan');

      const pkg = await auth(request(app).post(`/api/loans/applications/${created.body.data.id}/package`)).send({});
      expect(pkg.status).toBe(200);
      expect(pkg.body.data.loan.loan_package.cover_letter).toBeTruthy();
      expect(pkg.body.data.loan.status).toBe('preparing');

      const bad = await auth(request(app).patch(`/api/loans/applications/${created.body.data.id}`)).send({ status: 'maybe' });
      expect(bad.status).toBe(400);
      const ok = await auth(request(app).patch(`/api/loans/applications/${created.body.data.id}`)).send({ status: 'submitted' });
      expect(ok.body.data.submitted_at).toBeTruthy();
    });

    test('rejects an unknown program and hides other orgs\' loans', async () => {
      const res = await auth(request(app).post('/api/loans/applications')).send({ program_key: 'payday' });
      expect(res.status).toBe(400);

      const otherOrg = await Organization.create({ userId: uuidv4(), name: 'Other' });
      const theirs = await LoanApplication.create({ org_id: otherOrg.id, lender_name: 'Bank' });
      const peek = await auth(request(app).patch(`/api/loans/applications/${theirs.id}`)).send({ status: 'funded' });
      expect(peek.status).toBe(404);
    });
  });

  describe('business plan builder', () => {
    test('saves answers, reviews, researches and writes a section', async () => {
      const start = await auth(request(app).get('/api/business-plan'));
      expect(start.status).toBe(200);
      expect(start.body.data.progress.percent).toBe(0);
      expect(start.body.data.sections.find(s => s.key === 'youth_program')).toBeTruthy();

      const saved = await auth(request(app).put('/api/business-plan/answers')).send({
        answers: { yp_who: 'Kids 10-15 near Ogden', yp_activities: 'Guided strategy games', unknown_q: 'dropped' }
      });
      expect(saved.status).toBe(200);
      expect(saved.body.data.answers).toEqual({ yp_who: 'Kids 10-15 near Ogden', yp_activities: 'Guided strategy games' });
      expect(saved.body.data.progress.percent).toBeGreaterThan(0);

      const review = await auth(request(app).post('/api/business-plan/review'));
      expect(review.status).toBe(200);
      expect(review.body.data.last_review.readiness_score).toBeDefined();

      const research = await auth(request(app).post('/api/business-plan/sections/market_analysis/research'));
      expect(research.status).toBe(200);
      expect(research.body.data.research.market_analysis.findings.length).toBeGreaterThan(0);

      const written = await auth(request(app).post('/api/business-plan/sections/youth_program/write'));
      expect(written.status).toBe(200);
      expect(written.body.data.written.youth_program).toMatch(/Kids 10-15 near Ogden/);
      expect(written.body.data.writing_notes.youth_program.still_needed.length).toBeGreaterThan(0);

      const edited = await auth(request(app).put('/api/business-plan/sections/youth_program')).send({ text: 'My own words' });
      expect(edited.body.data.written.youth_program).toBe('My own words');

      const docx = await auth(request(app).get('/api/business-plan/export.docx'));
      expect(docx.status).toBe(200);
      expect(docx.headers['content-type']).toMatch(/wordprocessingml/);
    });

    test('unknown section is a 400 and clearing an answer removes it', async () => {
      const res = await auth(request(app).post('/api/business-plan/sections/nope/write'));
      expect(res.status).toBe(400);
      await auth(request(app).put('/api/business-plan/answers')).send({ answers: { yp_who: 'x' } });
      const cleared = await auth(request(app).put('/api/business-plan/answers')).send({ answers: { yp_who: '' } });
      expect(cleared.body.data.answers.yp_who).toBeUndefined();
    });
  });

  describe('calendar', () => {
    beforeEach(async () => {
      await Grant.create({ org_id: orgId, funder_name: 'Eccles Foundation', deadline: inDays(20), status: 'draft', applicant_lane: 'sponsored_program' });
      await Grant.create({ org_id: orgId, funder_name: 'Old Fund', deadline: inDays(-5), status: 'draft' });
      await LoanApplication.create({ org_id: orgId, lender_name: 'Microlender', next_step: 'Meet loan advisor', next_step_date: inDays(5), status: 'preparing' });
    });

    test('upcoming lists future dates soonest first and skips past ones', async () => {
      const res = await auth(request(app).get('/api/calendar/upcoming'));
      expect(res.status).toBe(200);
      expect(res.body.data.map(i => i.kind)).toEqual(['loan_step', 'grant_deadline']);
      expect(res.body.data[1].detail).toMatch(/fiscal sponsor/);
    });

    test('ics export and private feed both return a calendar', async () => {
      const ics = await auth(request(app).get('/api/calendar/export.ics'));
      expect(ics.status).toBe(200);
      expect(ics.text).toMatch(/SUMMARY:Grant due: Eccles Foundation/);

      const feed = await auth(request(app).get('/api/calendar/feed-url'));
      const path = new URL(feed.body.data.url).pathname;
      const pub = await request(app).get(path);
      expect(pub.status).toBe(200);
      expect(pub.text).toMatch(/BEGIN:VCALENDAR/);

      const forged = await request(app).get(`/api/calendar/feed/${jwt.sign({ orgId, purpose: 'other' }, JWT_SECRET)}.ics`);
      expect(forged.status).toBe(401);
    });
  });

  describe('automation', () => {
    test('settings are sanitized and a manual run records actions and owner to-dos', async () => {
      const put = await auth(request(app).put('/api/automation/settings')).send({ enabled: true, auto_discover: false, auto_start_min_score: 5, bogus: true });
      expect(put.status).toBe(200);
      expect(put.body.data.auto_start_min_score).toBe(50);
      expect(put.body.data.bogus).toBeUndefined();

      const grant = await Grant.create({ org_id: orgId, funder_name: 'Larry H. Miller Charities', deadline: inDays(30), status: 'draft', applicant_lane: 'sponsored_program', submission_method: 'portal' });
      await RFPAnalysis.create({ grant_id: grant.id, org_id: orgId, raw_text: 'Youth programs', funder_name: 'Larry H. Miller Charities', requirements: [], evaluation_criteria: {} });

      const run = await auth(request(app).post('/api/automation/run'));
      expect(run.status).toBe(200);
      expect(['completed', 'partial']).toContain(run.body.data.status);
      expect(run.body.data.actions.some(a => a.step === 'write_drafts' && a.outcome === 'ok')).toBe(true);
      expect(await Draft.count({ where: { grant_id: grant.id } })).toBe(1);

      const kinds = run.body.data.needs_you.map(n => n.kind);
      expect(kinds).toEqual(expect.arrayContaining(['sponsor_signoff', 'portal', 'connect_google']));

      const overview = await auth(request(app).get('/api/automation'));
      expect(overview.body.data.runs.length).toBe(1);
      expect(await AutomationRun.count({ where: { org_id: orgId } })).toBe(1);
    });
  });

  describe('Google routes without server setup', () => {
    test('status reports not configured, auth-url is 503, send is 409', async () => {
      const status = await auth(request(app).get('/api/google/status'));
      expect(status.body.data).toMatchObject({ server_configured: false, connected: false });
      expect((await auth(request(app).get('/api/google/auth-url'))).status).toBe(503);

      const grant = await Grant.create({ org_id: orgId, funder_name: 'F', status: 'draft' });
      expect((await auth(request(app).post(`/api/google/grants/${grant.id}/send`))).status).toBe(409);
    });

    test('submission settings validate and readiness lists blockers', async () => {
      const grant = await Grant.create({ org_id: orgId, funder_name: 'F', status: 'draft', deadline: inDays(10) });
      const bad = await auth(request(app).put(`/api/google/grants/${grant.id}/submission`)).send({ submission_email: 'nope' });
      expect(bad.status).toBe(400);
      const res = await auth(request(app).put(`/api/google/grants/${grant.id}/submission`)).send({ submission_method: 'email', submission_email: 'grants@funder.org' });
      expect(res.status).toBe(200);
      expect(res.body.data.blockers).toEqual(['No proposal draft yet']);

      await ApplicationDocument.create({ grant_id: grant.id, org_id: orgId, label: 'IRS letter', required: true, status: 'needed' });
      const ready = await auth(request(app).get(`/api/google/grants/${grant.id}/readiness`));
      expect(ready.body.data.ready).toBe(false);
      expect(ready.body.data.blockers.join(' ')).toMatch(/required document/);
    });
  });
});

describe('googleSync with a connected (mocked) Google account', () => {
  let googleSync;
  let google;

  beforeAll(async () => {
    await setupTestDatabase();
    jest.resetModules();
    jest.doMock('../../../src/services/googleService', () => ({
      createDraft: jest.fn(async () => ({ id: 'draft-1', message_id: 'm-1' })),
      sendDraft: jest.fn(async () => ({ message_id: 'sent-1', thread_id: 't-1' })),
      saveDocToDrive: jest.fn(async () => ({ id: 'file-1', link: 'https://docs.google.com/document/d/file-1' })),
      upsertDeadlineEvent: jest.fn(async ({ key }) => ({ id: `evt-${key}`, created: true })),
      isConfigured: () => true,
      getConnection: async () => ({ google_email: 'owner@example.com' })
    }));
    googleSync = require('../../../src/services/googleSync');
    google = require('../../../src/services/googleService');
  });

  afterAll(() => {
    jest.dontMock('../../../src/services/googleService');
  });

  test('sends an email submission with the proposal attached and marks it submitted', async () => {
    const models = require('../../../src/models');
    await models.Organization.truncate({ cascade: true });
    const org = await models.Organization.create({ userId: uuidv4(), name: 'Dice & Dragons', entityType: 'hybrid', fiscalSponsor: { name: 'Utah Youth Fund' } });
    const grant = await models.Grant.create({
      org_id: org.id, funder_name: 'Ogden Community Fund', status: 'draft', deadline: inDays(14),
      submission_method: 'email', submission_email: 'grants@ogdenfund.org', applicant_lane: 'sponsored_program', amount: 10000
    });
    await models.Draft.create({ grant_id: grant.id, org_id: org.id, version: 1, executive_summary: 'We teach teamwork through games.' });

    const sent = await googleSync.sendEmailSubmission({}, org, grant);
    expect(sent.message_id).toBe('sent-1');

    const msg = google.createDraft.mock.calls[0][1];
    expect(msg.to).toBe('grants@ogdenfund.org');
    expect(msg.attachments[0].filename).toMatch(/\.docx$/);
    expect(msg.text).toMatch(/fiscally sponsored project of Utah Youth Fund/);
    expect(msg.text).toMatch(/We teach teamwork through games/);

    await grant.reload();
    expect(grant.status).toBe('submitted');
    expect(grant.google.gmail_message_id).toBe('sent-1');

    await expect(googleSync.sendEmailSubmission({}, org, grant)).rejects.toThrow(/Already submitted/);
  });

  test('saves the proposal to Drive and remembers the file', async () => {
    const models = require('../../../src/models');
    const org = await models.Organization.create({ userId: uuidv4(), name: 'Store' });
    const grant = await models.Grant.create({ org_id: org.id, funder_name: 'F', status: 'draft' });
    expect(await googleSync.saveGrantToDrive({}, org, grant)).toBeNull();
    await models.Draft.create({ grant_id: grant.id, org_id: org.id, version: 1, executive_summary: 'x' });
    const file = await googleSync.saveGrantToDrive({}, org, grant);
    expect(file.id).toBe('file-1');
    await grant.reload();
    expect(grant.google.drive_link).toMatch(/docs.google.com/);
  });
});
