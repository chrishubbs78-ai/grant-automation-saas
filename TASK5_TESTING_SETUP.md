# Task 5: Comprehensive Testing - Setup and Implementation

**Status**: 🚀 IN PROGRESS  
**Start Date**: May 22, 2026  
**Estimated Duration**: 11-16 days

---

## Testing Infrastructure Established

### Backend (Jest + Supertest)

#### Configuration Files Created

1. **`jest.config.js`**
   - Test environment: Node.js
   - Coverage threshold: 60% (branches, functions, lines, statements)
   - Excluded from coverage: `app.js`, scheduler directory
   - Test timeout: 10 seconds
   - Setup file: `__tests__/jest.setup.js`

2. **`__tests__/jest.setup.js`**
   - Environment variables initialized for tests
   - Database URL set to test instance
   - Console logging suppressed (except errors)
   - Process environment: NODE_ENV = 'test'

3. **`package.json` Updated**
   - Test scripts added:
     - `npm test` - Run all tests
     - `npm run test:watch` - Watch mode for development
     - `npm run test:coverage` - Generate coverage report
   - Dependencies added:
     - jest 29.7.0
     - supertest 6.3.4
     - jest-mock-extended 3.0.5

#### Test Directory Structure

```
backend/__tests__/
├── jest.setup.js (shared setup)
├── unit/
│   ├── middleware/
│   │   └── auth.test.js (5 test cases)
│   ├── services/
│   │   └── claudeService.test.js (PLANNED)
│   └── utils/
│       └── validation.test.js (PLANNED)
└── integration/
    ├── routes/
    │   ├── grants.integration.test.js (7 test cases)
    │   ├── templates.integration.test.js (PLANNED)
    │   ├── bulk.integration.test.js (PLANNED)
    │   ├── rfp.integration.test.js (PLANNED)
    │   └── drafts.integration.test.js (PLANNED)
    └── e2e/
        └── grantWorkflow.e2e.test.js (PLANNED)
```

---

## Tests Implemented (Backend)

### Unit Tests

#### 1. `auth.test.js` - Auth Middleware (5 cases)
- ✅ Valid JWT token extracts userId and calls next()
- ✅ Missing Authorization header returns 401
- ✅ Malformed Authorization header returns 401
- ✅ Expired JWT token returns 401
- ✅ Token with wrong secret returns 401

**Coverage**: Complete auth flow validation

### Integration Tests

#### 2. `grants.integration.test.js` - Grants API (7 cases)

**GET /api/grants**:
- ✅ Returns empty list for user with no grants
- ✅ Returns paginated list of grants
- ✅ Filters grants by status
- ✅ Requires valid token

**POST /api/grants**:
- ✅ Creates a new grant
- ✅ Requires authentication

**PUT /api/grants/:id**:
- ✅ Updates a grant
- ✅ Prevents updating other org's grants
- ✅ Whitelists updatable fields (org_id not exposed)

**DELETE /api/grants/:id**:
- ✅ Deletes a grant
- ✅ Prevents deleting other org's grants

**Coverage**: CRUD operations, permissions, field validation

---

## Tests Planned (Next Phases)

### Critical Path (Implement Next)

#### `templates.integration.test.js` (Estimated 8-10 cases)
- Create template
- Read template
- Update template
- Delete template
- Duplicate template
- List templates with filtering
- Ownership verification
- Invalid type validation

#### `bulk.integration.test.js` (Estimated 6-8 cases)
- POST /api/bulk/update-status
- POST /api/bulk/export-csv
- POST /api/bulk/import-rfps
- GET /api/bulk/:jobId (polling)
- Job status transitions
- Error handling

#### `rfp.integration.test.js` (Estimated 6-8 cases)
- Upload RFP
- Parse RFP with Claude
- Research funder with Gemini
- Poll job status
- Error on missing API key (graceful degradation)
- Mock mode fallback

#### `drafts.integration.test.js` (Estimated 6-8 cases)
- Queue draft generation
- Poll draft status
- Generate draft sections with Claude
- Include org profile in context
- Error handling

### Unit Tests (Services)

#### `claudeService.test.js` (Estimated 6-8 cases)
- Mock Claude API calls
- Test RFP parsing
- Test draft generation
- Error handling
- Token counting

#### `validation.test.js` (Estimated 4-6 cases)
- Validate search parameters
- Validate grant fields
- Validate template type enum
- Validate status enum

### Frontend Tests (React Testing Library + Vitest)

#### `Dashboard.test.jsx` (Estimated 10-12 cases)
- Render grant list
- Search filter integration
- Bulk selection
- Status update
- Pagination
- Error states

#### `BulkActionsToolbar.test.jsx` (Estimated 6-8 cases)
- Toolbar visibility (only show when selections > 0)
- Status dropdown interaction
- Export CSV trigger
- Clear selection

#### `BulkJobMonitor.test.jsx` (Estimated 6-8 cases)
- Progress bar updates
- Completion detection
- Error display
- Download button appearance

### E2E Tests

#### `grantWorkflow.e2e.test.js` (Estimated 8-10 cases)
- Complete grant creation flow
- RFP upload → analysis → draft
- Grant status update
- Outcome recording
- Analytics update

---

## Test Infrastructure Summary

### Backend Test Coverage Target
- Unit tests: 20-30 test cases
- Integration tests: 25-35 test cases
- E2E tests: 8-10 test cases
- **Total: 55+ test cases**
- **Target coverage**: 60% code coverage

### Frontend Test Coverage Target
- Component unit tests: 30-40 test cases
- Integration tests: 10-15 test cases
- **Total: 40-55 test cases**
- **Target coverage**: 50% code coverage

---

## Key Testing Patterns Established

### 1. Auth Token Generation Helper
```javascript
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
};
```

### 2. Database Setup/Teardown
```javascript
beforeAll(async () => {
  app = require('../../../src/app');
  await sequelize.sync({ force: true });
});

beforeEach(async () => {
  await Grant.truncate({ cascade: true });
  // Create test data
});
```

### 3. API Request Testing Pattern
```javascript
const response = await request(app)
  .get('/api/grants')
  .set('Authorization', `Bearer ${token}`);

expect(response.status).toBe(200);
expect(response.body).toEqual(expect.objectContaining({...}));
```

### 4. Ownership Verification Testing
```javascript
const response = await request(app)
  .put(`/api/grants/${otherGrant.id}`)
  .set('Authorization', `Bearer ${token}`)
  .send({ status: 'submitted' });

expect(response.status).toBe(403);
```

---

## Running Tests

### Command Reference
```bash
# Install dependencies first
npm install

# Run all tests once
npm test

# Watch mode (rerun on file changes)
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test file
npm test -- __tests__/unit/middleware/auth.test.js

# Run tests matching pattern
npm test -- --testNamePattern="grants"
```

### CI/CD Pipeline (Planned)
- GitHub Actions workflow to run tests on every push
- Fail build if coverage drops below threshold
- Generate coverage report
- Post results to pull requests

---

## Test Data Strategy

### Fixtures
- Standard test userId: `550e8400-e29b-41d4-a716-446655440000`
- Standard test orgId: `650e8400-e29b-41d4-a716-446655440001`
- Test database: PostgreSQL test instance (separate from dev)

### Factories (Planned)
- Grant factory: Create grants with default/custom values
- Organization factory: Create orgs with standard test data
- User factory: Create users with JWT tokens

---

## Known Limitations

1. **Database Tests**: Currently uses same instance as backend
   - TODO: Set up dedicated test database container
   - Use docker-compose for test environment

2. **API Mocking**: Tests use real database
   - TODO: Add unit tests with mocked database
   - Keep integration tests with real DB for accuracy

3. **External Services**: Claude and Gemini API calls
   - TODO: Mock external API responses
   - Use nock or jest-mock for HTTP mocks

4. **WebSocket Tests**: Not implemented yet
   - TODO: Add Socket.IO test utils
   - Test real-time updates (draft ready, notification, etc.)

---

## Next Steps (Immediate)

1. Implement remaining critical-path integration tests (templates, bulk, rfp, drafts)
2. Add unit tests for services (claudeService, validation)
3. Set up frontend test infrastructure (Vitest + RTL)
4. Implement frontend component tests
5. Add E2E workflow tests
6. Set up CI/CD pipeline
7. Achieve 60% backend + 50% frontend coverage

---

## Test Timeline

| Phase | Tests | Duration | Target |
|-------|-------|----------|--------|
| Phase 1 (Current) | Auth, Grants CRUD | 1-2 days | Foundation |
| Phase 2 | Templates, Bulk, RFP, Drafts | 3-4 days | Critical paths |
| Phase 3 | Services, Utils, Validation | 2-3 days | Unit coverage |
| Phase 4 | Frontend components | 3-4 days | UI coverage |
| Phase 5 | E2E workflows | 2-3 days | Full flows |
| Phase 6 | CI/CD + Coverage | 1-2 days | Automation |
| **Total** | 55+ tests | **11-16 days** | **60%+ coverage** |

---

## Success Criteria

- ✅ All critical path tests pass
- ✅ 60% backend code coverage
- ✅ 50% frontend code coverage
- ✅ CI/CD pipeline validates tests on commit
- ✅ >95% test pass rate in main branch
- ✅ Test execution <2 minutes for full suite
- ✅ No flaky tests (deterministic results)

---

**Last Updated**: May 22, 2026  
**Next Checkpoint**: Complete critical-path integration tests (templates, bulk, rfp, drafts)
