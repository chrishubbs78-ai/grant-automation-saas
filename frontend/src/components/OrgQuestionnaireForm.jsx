import { useState } from 'react';
import '../styles/questionnaire.css';

const BLANK = {
  // Section 1: Identity
  name: '', ein: '', website: '', phone: '',
  address: { street: '', city: '', state: '', zip: '' },
  taxExemptStatus: '501c3', nteeCode: '', yearsInOperation: '',
  // Section 2: Mission & Theory
  mission: '', vision: '', theoryOfChange: '',
  // Section 3: Problem & Population
  problemStatement: '', targetPopulation: '',
  geographicScope: 'local', geographicServiceArea: '', annualClientsServed: '',
  // Section 4: Programs & Evidence
  programsAndServices: [{ name: '', description: '', annual_participants: '', outcomes: '' }],
  evidenceBase: '',
  // Section 5: Track Record & Outcomes
  trackRecord: '',
  outcomesData: { metrics: '', recent_results: '', data_systems: '' },
  pastGrantsCount: '',
  // Section 6: Team & Governance
  keyStaff: [{ name: '', title: '', years_experience: '', bio: '' }],
  boardComposition: { size: '', expertise_areas: '', community_representation: '' },
  teamSummary: {},
  // Section 7: Financials
  annualBudget: '', financialStatus: 'stable',
  revenueBreakdown: { government_pct: '', foundation_pct: '', corporate_pct: '', individual_pct: '', earned_pct: '' },
  reservesMonths: '', auditCompleted: false,
  // Section 8: Sustainability & DEI
  sustainabilityPlan: '', diversityEquityInclusion: '',
  // Section 9: Previous Funders
  previousGrantors: [{ funder_name: '', amount: '', year: '', purpose: '' }],
  partnerships: [],
  constraints: {},
  questionnaire: {}
};

export default function OrgQuestionnaireForm({ onSubmit, initialData }) {
  const merged = { ...BLANK, ...initialData };
  const [formData, setFormData] = useState(merged);
  const [activeSection, setActiveSection] = useState(0);
  const [saving, setSaving] = useState(false);

  const SECTIONS = [
    'Organization Identity',
    'Mission & Theory of Change',
    'Problem & Population',
    'Programs & Evidence',
    'Track Record & Outcomes',
    'Team & Governance',
    'Financials',
    'Sustainability & DEI',
    'Previous Funders & Partnerships'
  ];

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));
  const setNested = (field, key, value) => setFormData(prev => ({ ...prev, [field]: { ...prev[field], [key]: value } }));

  // Array helpers (programs, staff, grantors)
  const addItem = (field, template) => setFormData(prev => ({ ...prev, [field]: [...(prev[field] || []), { ...template }] }));
  const removeItem = (field, idx) => setFormData(prev => ({ ...prev, [field]: prev[field].filter((_, i) => i !== idx) }));
  const setItem = (field, idx, key, value) => setFormData(prev => {
    const arr = [...(prev[field] || [])];
    arr[idx] = { ...arr[idx], [key]: value };
    return { ...prev, [field]: arr };
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSubmit(formData);
    setSaving(false);
  };

  const completionPct = Math.round(
    (SECTIONS.length - SECTIONS.filter((_, i) => !sectionHasData(i)).length) / SECTIONS.length * 100
  );

  function sectionHasData(idx) {
    const checks = [
      () => formData.name && formData.mission,
      () => formData.theoryOfChange,
      () => formData.problemStatement && formData.targetPopulation,
      () => (formData.programsAndServices || []).some(p => p.name),
      () => formData.trackRecord,
      () => (formData.keyStaff || []).some(s => s.name),
      () => formData.annualBudget,
      () => formData.sustainabilityPlan,
      () => (formData.previousGrantors || []).some(g => g.funder_name)
    ];
    return checks[idx] && checks[idx]();
  }

  return (
    <div className="questionnaire-container">
      <div className="questionnaire-wrapper">
        <div className="questionnaire-header">
          <h1>Organization Profile</h1>
          <p className="subtitle">Complete your profile to unlock expert-quality grant proposals. The more detail you provide, the stronger your drafts.</p>
          <div className="completion-bar">
            <div className="completion-fill" style={{ width: `${completionPct}%` }} />
            <span className="completion-label">{completionPct}% complete</span>
          </div>
        </div>

        {/* Section Nav */}
        <nav className="section-nav">
          {SECTIONS.map((s, i) => (
            <button
              key={i}
              type="button"
              className={`section-tab ${activeSection === i ? 'active' : ''} ${sectionHasData(i) ? 'done' : ''}`}
              onClick={() => setActiveSection(i)}
            >
              <span className="tab-num">{sectionHasData(i) ? '✓' : i + 1}</span>
              <span className="tab-label">{s}</span>
            </button>
          ))}
        </nav>

        <form onSubmit={handleSubmit} className="questionnaire-form">

          {/* ── SECTION 0: Identity ── */}
          {activeSection === 0 && (
            <section className="form-section">
              <h2>1. Organization Identity</h2>
              <p className="section-tip">This is your legal and contact information — funders verify this.</p>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Organization Name *</label>
                  <input type="text" value={formData.name} onChange={e => set('name', e.target.value)} placeholder="Legal name as it appears on your 990" required />
                </div>
                <div className="form-group">
                  <label>EIN / Tax ID</label>
                  <input type="text" value={formData.ein} onChange={e => set('ein', e.target.value)} placeholder="XX-XXXXXXX" />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Tax-Exempt Status</label>
                  <select value={formData.taxExemptStatus} onChange={e => set('taxExemptStatus', e.target.value)}>
                    <option value="501c3">501(c)(3) Public Charity</option>
                    <option value="501c4">501(c)(4) Social Welfare</option>
                    <option value="fiscally_sponsored">Fiscally Sponsored</option>
                    <option value="government">Government / Quasi-Government</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>NTEE Code <span className="hint">(e.g. B21 = Charter Schools)</span></label>
                  <input type="text" value={formData.nteeCode} onChange={e => set('nteeCode', e.target.value)} placeholder="e.g. B21" />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Years in Operation *</label>
                  <input type="number" value={formData.yearsInOperation} onChange={e => set('yearsInOperation', e.target.value)} placeholder="e.g. 8" min="0" required />
                </div>
                <div className="form-group">
                  <label>Website</label>
                  <input type="url" value={formData.website} onChange={e => set('website', e.target.value)} placeholder="https://yourorg.org" />
                </div>
              </div>

              <div className="form-group">
                <label>Phone</label>
                <input type="tel" value={formData.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 000-0000" />
              </div>

              <fieldset className="address-group">
                <legend>Mailing Address</legend>
                <input type="text" placeholder="Street Address" value={formData.address?.street || ''} onChange={e => setNested('address', 'street', e.target.value)} />
                <div className="form-row-3">
                  <input type="text" placeholder="City" value={formData.address?.city || ''} onChange={e => setNested('address', 'city', e.target.value)} />
                  <input type="text" placeholder="State" value={formData.address?.state || ''} onChange={e => setNested('address', 'state', e.target.value)} maxLength={2} />
                  <input type="text" placeholder="ZIP" value={formData.address?.zip || ''} onChange={e => setNested('address', 'zip', e.target.value)} />
                </div>
              </fieldset>
            </section>
          )}

          {/* ── SECTION 1: Mission & Theory ── */}
          {activeSection === 1 && (
            <section className="form-section">
              <h2>2. Mission, Vision & Theory of Change</h2>
              <p className="section-tip">These 3 elements are the backbone of every grant narrative. Be specific and compelling.</p>

              <div className="form-group">
                <label>Mission Statement *</label>
                <textarea value={formData.mission} onChange={e => set('mission', e.target.value)} placeholder="One to two sentences: what you do, for whom, and to what end." rows={3} required />
                <span className="char-hint">{formData.mission?.length || 0} chars (aim for 50–200)</span>
              </div>

              <div className="form-group">
                <label>Vision Statement</label>
                <textarea value={formData.vision} onChange={e => set('vision', e.target.value)} placeholder="What does success look like in 10 years? What world are you working toward?" rows={3} />
              </div>

              <div className="form-group">
                <label>Theory of Change <span className="required-star">*</span></label>
                <textarea value={formData.theoryOfChange} onChange={e => set('theoryOfChange', e.target.value)}
                  placeholder="Describe your logic model: Inputs → Activities → Outputs → Short-term outcomes → Long-term impact. E.g., 'When low-income youth receive high-quality mentoring (input), they complete high school at higher rates (output), leading to increased college enrollment (outcome) and ultimately breaking the cycle of poverty (impact).'"
                  rows={5} />
              </div>
            </section>
          )}

          {/* ── SECTION 2: Problem & Population ── */}
          {activeSection === 2 && (
            <section className="form-section">
              <h2>3. Problem & Target Population</h2>
              <p className="section-tip">Use data and specifics. Reviewers want to see you understand the problem deeply.</p>

              <div className="form-group">
                <label>Statement of Need *</label>
                <textarea value={formData.problemStatement} onChange={e => set('problemStatement', e.target.value)}
                  placeholder="Describe the problem with local/national data. Include: Who is affected? How many? What are the root causes? What happens if nothing changes? E.g., '43% of 3rd graders in our county read below grade level (State DOE, 2024), a rate 2x the national average...'"
                  rows={5} required />
              </div>

              <div className="form-group">
                <label>Target Population *</label>
                <textarea value={formData.targetPopulation} onChange={e => set('targetPopulation', e.target.value)}
                  placeholder="Be specific: demographics, age range, income level, geography. E.g., '500 low-income youth ages 8-14 in Chicago's South Side, 85% Black and Latino, qualifying for free/reduced lunch.'"
                  rows={3} required />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Geographic Scope</label>
                  <select value={formData.geographicScope} onChange={e => set('geographicScope', e.target.value)}>
                    <option value="local">Local (city/county)</option>
                    <option value="regional">Regional (multi-county/state)</option>
                    <option value="national">National</option>
                    <option value="international">International</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Annual Individuals Served</label>
                  <input type="number" value={formData.annualClientsServed} onChange={e => set('annualClientsServed', e.target.value)} placeholder="e.g. 2500" min="0" />
                </div>
              </div>

              <div className="form-group">
                <label>Specific Service Area</label>
                <input type="text" value={formData.geographicServiceArea} onChange={e => set('geographicServiceArea', e.target.value)} placeholder="e.g. Cook County, IL — primarily ZIP codes 60615, 60637, 60649" />
              </div>
            </section>
          )}

          {/* ── SECTION 3: Programs & Evidence ── */}
          {activeSection === 3 && (
            <section className="form-section">
              <h2>4. Programs & Services</h2>
              <p className="section-tip">List each program separately. Funders want to see specific, named programs with outcomes — not vague "services."</p>

              {(formData.programsAndServices || []).map((prog, idx) => (
                <div key={idx} className="array-item">
                  <div className="array-item-header">
                    <strong>Program {idx + 1}</strong>
                    {idx > 0 && <button type="button" className="btn-remove" onClick={() => removeItem('programsAndServices', idx)}>Remove</button>}
                  </div>
                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Program Name</label>
                      <input type="text" value={prog.name} onChange={e => setItem('programsAndServices', idx, 'name', e.target.value)} placeholder="e.g. After-School STEM Academy" />
                    </div>
                    <div className="form-group">
                      <label>Participants Per Year</label>
                      <input type="number" value={prog.annual_participants} onChange={e => setItem('programsAndServices', idx, 'annual_participants', e.target.value)} placeholder="e.g. 300" min="0" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea value={prog.description} onChange={e => setItem('programsAndServices', idx, 'description', e.target.value)} placeholder="What does this program do? How? Frequency, duration, staffing model." rows={2} />
                  </div>
                  <div className="form-group">
                    <label>Measured Outcomes</label>
                    <textarea value={prog.outcomes} onChange={e => setItem('programsAndServices', idx, 'outcomes', e.target.value)} placeholder="What outcomes have you documented? E.g. '85% of completers improve reading by 1+ grade level.'" rows={2} />
                  </div>
                </div>
              ))}

              <button type="button" className="btn-add" onClick={() => addItem('programsAndServices', { name: '', description: '', annual_participants: '', outcomes: '' })}>
                + Add Program
              </button>

              <div className="form-group" style={{ marginTop: '24px' }}>
                <label>Evidence Base</label>
                <textarea value={formData.evidenceBase} onChange={e => set('evidenceBase', e.target.value)}
                  placeholder="What research or best-practice frameworks support your approach? Name specific studies, models, or curricula (e.g., 'Our model is based on the Big Brothers Big Sisters mentoring framework, supported by a 2022 Harvard meta-analysis...')"
                  rows={3} />
              </div>
            </section>
          )}

          {/* ── SECTION 4: Track Record & Outcomes ── */}
          {activeSection === 4 && (
            <section className="form-section">
              <h2>5. Track Record & Outcomes Data</h2>
              <p className="section-tip">This is where you prove you can deliver. Use real numbers from your own data.</p>

              <div className="form-group">
                <label>Biggest Successes</label>
                <textarea value={formData.trackRecord} onChange={e => set('trackRecord', e.target.value)}
                  placeholder="Describe 2-3 major wins with quantified outcomes. E.g., 'In 2023, 94% of our youth participants graduated on time vs. 78% district average. We received the Mayor's Nonprofit Excellence Award.'"
                  rows={4} />
              </div>

              <fieldset className="address-group">
                <legend>Outcomes Data System</legend>
                <div className="form-group">
                  <label>What metrics do you track?</label>
                  <input type="text" value={formData.outcomesData?.metrics || ''} onChange={e => setNested('outcomesData', 'metrics', e.target.value)} placeholder="e.g. Attendance rate, test score improvement, employment placement, housing stability" />
                </div>
                <div className="form-group">
                  <label>Most recent results (past 12 months)</label>
                  <textarea value={formData.outcomesData?.recent_results || ''} onChange={e => setNested('outcomesData', 'recent_results', e.target.value)} placeholder="e.g. 87% program completion rate (n=450), avg 1.4 grade-level reading improvement, 63% of graduates employed within 90 days" rows={2} />
                </div>
                <div className="form-group">
                  <label>Data collection system</label>
                  <input type="text" value={formData.outcomesData?.data_systems || ''} onChange={e => setNested('outcomesData', 'data_systems', e.target.value)} placeholder="e.g. Salesforce NPSP, Apricot by Bonterra, custom database, spreadsheet" />
                </div>
              </fieldset>

              <div className="form-group">
                <label>Number of grants previously won</label>
                <input type="number" value={formData.pastGrantsCount} onChange={e => set('pastGrantsCount', e.target.value)} placeholder="e.g. 12" min="0" />
              </div>
            </section>
          )}

          {/* ── SECTION 5: Team & Governance ── */}
          {activeSection === 5 && (
            <section className="form-section">
              <h2>6. Team & Governance</h2>
              <p className="section-tip">Funders invest in people as much as programs. Credentials, experience, and diversity matter.</p>

              <h3>Key Staff</h3>
              {(formData.keyStaff || []).map((s, idx) => (
                <div key={idx} className="array-item">
                  <div className="array-item-header">
                    <strong>Staff Member {idx + 1}</strong>
                    {idx > 0 && <button type="button" className="btn-remove" onClick={() => removeItem('keyStaff', idx)}>Remove</button>}
                  </div>
                  <div className="form-row-3">
                    <div className="form-group">
                      <label>Name</label>
                      <input type="text" value={s.name} onChange={e => setItem('keyStaff', idx, 'name', e.target.value)} placeholder="Full name" />
                    </div>
                    <div className="form-group">
                      <label>Title</label>
                      <input type="text" value={s.title} onChange={e => setItem('keyStaff', idx, 'title', e.target.value)} placeholder="Executive Director" />
                    </div>
                    <div className="form-group">
                      <label>Years Experience</label>
                      <input type="number" value={s.years_experience} onChange={e => setItem('keyStaff', idx, 'years_experience', e.target.value)} placeholder="15" min="0" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>2-sentence bio (credentials, expertise)</label>
                    <textarea value={s.bio} onChange={e => setItem('keyStaff', idx, 'bio', e.target.value)} placeholder="E.g. Jane has 15 years in youth development and holds an MSW from University of Chicago. She previously directed programs at YMCA serving 5,000+ youth annually." rows={2} />
                  </div>
                </div>
              ))}
              <button type="button" className="btn-add" onClick={() => addItem('keyStaff', { name: '', title: '', years_experience: '', bio: '' })}>+ Add Staff Member</button>

              <h3 style={{ marginTop: '24px' }}>Board of Directors</h3>
              <div className="form-row-3">
                <div className="form-group">
                  <label>Board Size</label>
                  <input type="number" value={formData.boardComposition?.size || ''} onChange={e => setNested('boardComposition', 'size', e.target.value)} placeholder="e.g. 12" min="1" />
                </div>
                <div className="form-group">
                  <label>Key Expertise Areas</label>
                  <input type="text" value={formData.boardComposition?.expertise_areas || ''} onChange={e => setNested('boardComposition', 'expertise_areas', e.target.value)} placeholder="Legal, Finance, Healthcare, Education" />
                </div>
                <div className="form-group">
                  <label>Community Representation</label>
                  <input type="text" value={formData.boardComposition?.community_representation || ''} onChange={e => setNested('boardComposition', 'community_representation', e.target.value)} placeholder="% lived experience, demographics" />
                </div>
              </div>
            </section>
          )}

          {/* ── SECTION 6: Financials ── */}
          {activeSection === 6 && (
            <section className="form-section">
              <h2>7. Financial Health</h2>
              <p className="section-tip">Funders assess your capacity to manage their investment. Be accurate — they check 990s.</p>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Annual Operating Budget ($) *</label>
                  <input type="number" value={formData.annualBudget} onChange={e => set('annualBudget', e.target.value)} placeholder="e.g. 1500000" min="0" required />
                </div>
                <div className="form-group">
                  <label>Financial Health</label>
                  <select value={formData.financialStatus} onChange={e => set('financialStatus', e.target.value)}>
                    <option value="strong">Strong — growing revenue, 6+ months reserves</option>
                    <option value="stable">Stable — flat revenue, 3–6 months reserves</option>
                    <option value="stressed">Stressed — declining revenue, &lt;3 months reserves</option>
                  </select>
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Operating Reserves (months)</label>
                  <input type="number" value={formData.reservesMonths} onChange={e => set('reservesMonths', e.target.value)} placeholder="e.g. 4.5" min="0" step="0.5" />
                </div>
                <div className="form-group">
                  <label>Independent Audit Completed?</label>
                  <select value={formData.auditCompleted ? 'yes' : 'no'} onChange={e => set('auditCompleted', e.target.value === 'yes')}>
                    <option value="yes">Yes — most recent year filed</option>
                    <option value="no">No — under review or not required</option>
                  </select>
                </div>
              </div>

              <fieldset className="address-group">
                <legend>Revenue Breakdown (% of total — should add to 100%)</legend>
                <div className="form-row-3">
                  <div className="form-group">
                    <label>Government grants/contracts %</label>
                    <input type="number" value={formData.revenueBreakdown?.government_pct || ''} onChange={e => setNested('revenueBreakdown', 'government_pct', e.target.value)} placeholder="30" min="0" max="100" />
                  </div>
                  <div className="form-group">
                    <label>Foundation grants %</label>
                    <input type="number" value={formData.revenueBreakdown?.foundation_pct || ''} onChange={e => setNested('revenueBreakdown', 'foundation_pct', e.target.value)} placeholder="40" min="0" max="100" />
                  </div>
                  <div className="form-group">
                    <label>Corporate giving %</label>
                    <input type="number" value={formData.revenueBreakdown?.corporate_pct || ''} onChange={e => setNested('revenueBreakdown', 'corporate_pct', e.target.value)} placeholder="10" min="0" max="100" />
                  </div>
                </div>
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Individual donations %</label>
                    <input type="number" value={formData.revenueBreakdown?.individual_pct || ''} onChange={e => setNested('revenueBreakdown', 'individual_pct', e.target.value)} placeholder="15" min="0" max="100" />
                  </div>
                  <div className="form-group">
                    <label>Earned revenue / fees %</label>
                    <input type="number" value={formData.revenueBreakdown?.earned_pct || ''} onChange={e => setNested('revenueBreakdown', 'earned_pct', e.target.value)} placeholder="5" min="0" max="100" />
                  </div>
                </div>
              </fieldset>

              <div className="financials-note">
                <strong>Financial Documents Vault:</strong> Upload your 990, audit, and budget in the Financials section of the dashboard after completing this questionnaire.
              </div>
            </section>
          )}

          {/* ── SECTION 7: Sustainability & DEI ── */}
          {activeSection === 7 && (
            <section className="form-section">
              <h2>8. Sustainability & Diversity, Equity & Inclusion</h2>
              <p className="section-tip">Two questions reviewers always ask: "What happens after the grant?" and "Does this org walk the DEI talk?"</p>

              <div className="form-group">
                <label>Sustainability Plan</label>
                <textarea value={formData.sustainabilityPlan} onChange={e => set('sustainabilityPlan', e.target.value)}
                  placeholder="How will this program continue after the grant period? Include: other funding sources in the pipeline, revenue diversification strategy, government contract potential, any earned revenue model."
                  rows={4} />
              </div>

              <div className="form-group">
                <label>Diversity, Equity & Inclusion Statement</label>
                <textarea value={formData.diversityEquityInclusion} onChange={e => set('diversityEquityInclusion', e.target.value)}
                  placeholder="Describe your DEI commitment in practice — not just values. E.g., staff demographics, board diversity, culturally responsive programming, community ownership, pay equity policies, etc."
                  rows={4} />
              </div>

              <div className="form-group">
                <label>Key Partnerships</label>
                <textarea
                  value={Array.isArray(formData.partnerships) ? formData.partnerships.join('\n') : (formData.partnerships || '')}
                  onChange={e => set('partnerships', e.target.value.split('\n').filter(p => p.trim()))}
                  placeholder="List key partners (one per line): name and their role in your work.&#10;E.g.&#10;Chicago Public Schools — referral and facilities partner&#10;United Way of Chicago — co-funder and evaluation support"
                  rows={4}
                />
              </div>
            </section>
          )}

          {/* ── SECTION 8: Previous Funders ── */}
          {activeSection === 8 && (
            <section className="form-section">
              <h2>9. Previous Funders & Grant History</h2>
              <p className="section-tip">A track record of winning grants builds credibility. List your most significant grants — funders check references.</p>

              {(formData.previousGrantors || []).map((g, idx) => (
                <div key={idx} className="array-item">
                  <div className="array-item-header">
                    <strong>Funder {idx + 1}</strong>
                    {idx > 0 && <button type="button" className="btn-remove" onClick={() => removeItem('previousGrantors', idx)}>Remove</button>}
                  </div>
                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Funder Name</label>
                      <input type="text" value={g.funder_name} onChange={e => setItem('previousGrantors', idx, 'funder_name', e.target.value)} placeholder="e.g. W.K. Kellogg Foundation" />
                    </div>
                    <div className="form-group">
                      <label>Amount ($)</label>
                      <input type="number" value={g.amount} onChange={e => setItem('previousGrantors', idx, 'amount', e.target.value)} placeholder="150000" min="0" />
                    </div>
                  </div>
                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Year</label>
                      <input type="number" value={g.year} onChange={e => setItem('previousGrantors', idx, 'year', e.target.value)} placeholder="2023" min="1990" max={new Date().getFullYear()} />
                    </div>
                    <div className="form-group">
                      <label>Purpose</label>
                      <input type="text" value={g.purpose} onChange={e => setItem('previousGrantors', idx, 'purpose', e.target.value)} placeholder="After-school programming expansion" />
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="btn-add" onClick={() => addItem('previousGrantors', { funder_name: '', amount: '', year: '', purpose: '' })}>
                + Add Funder
              </button>
            </section>
          )}

          {/* Navigation */}
          <div className="form-nav">
            {activeSection > 0 && (
              <button type="button" className="btn-secondary" onClick={() => setActiveSection(s => s - 1)}>
                ← Previous
              </button>
            )}
            <div className="form-nav-center">
              <span className="section-indicator">{activeSection + 1} / {SECTIONS.length}</span>
            </div>
            {activeSection < SECTIONS.length - 1 ? (
              <button type="button" className="btn-primary" onClick={() => setActiveSection(s => s + 1)}>
                Next →
              </button>
            ) : (
              <button type="submit" className="btn-primary btn-save" disabled={saving}>
                {saving ? 'Saving...' : '✓ Save Profile & Go to Dashboard'}
              </button>
            )}
          </div>

          {/* Save anywhere */}
          <div className="form-save-anywhere">
            <button type="submit" className="btn-outline" disabled={saving}>
              {saving ? 'Saving...' : 'Save Progress'}
            </button>
            <span className="form-help">You can save at any point and return later.</span>
          </div>

        </form>
      </div>
    </div>
  );
}
