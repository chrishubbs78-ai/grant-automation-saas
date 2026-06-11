/**
 * Mock API Service for Development
 * Provides realistic mock responses for Claude and Gemini APIs
 * when API keys are missing or DEMO_MODE is enabled
 */

// Mock RFP parsing response
function getMockRFPAnalysis(rfpText) {
  // Extract some basic info from the text to make it more realistic
  const isFederal = rfpText.toLowerCase().includes('federal') || rfpText.toLowerCase().includes('nsf') || rfpText.toLowerCase().includes('nih');
  const isFoundation = rfpText.toLowerCase().includes('foundation');
  const isSmallBusiness = rfpText.toLowerCase().includes('small business') || rfpText.toLowerCase().includes('sbir');

  let funderName = 'Unknown Funder';
  let deadline = null;
  let amount = 500000;

  if (isFederal) {
    funderName = 'National Science Foundation (NSF)';
    deadline = '2026-06-30';
    amount = 750000;
  } else if (isFoundation) {
    funderName = 'Example Community Foundation';
    deadline = '2026-07-15';
    amount = 250000;
  } else if (isSmallBusiness) {
    funderName = 'Small Business Administration (SBA)';
    deadline = '2026-08-31';
    amount = 150000;
  }

  return {
    funder_name: funderName,
    deadline: deadline,
    award_range: {
      min: Math.round(amount * 0.5),
      max: amount
    },
    page_limit: 15,
    key_requirements: [
      'Complete SF-424 form',
      'Project narrative (15 pages max)',
      'Budget narrative and justification',
      'Organization financial statements',
      'Letters of support from partners',
      'Evaluation plan'
    ],
    evaluation_criteria: {
      'Technical Merit': 40,
      'Project Team & Qualifications': 25,
      'Feasibility & Timeline': 20,
      'Cost Effectiveness': 15
    },
    eligibility: {
      who_can_apply: 'Nonprofit 501(c)(3) organizations, educational institutions, and research organizations',
      restrictions: [
        'Must be registered 501(c)(3) for 2+ years',
        'No lobbying or political activities',
        'Must match 10-20% of award amount'
      ]
    },
    submission_method: 'Online portal (Grants.gov)',
    contact_info: {
      email: 'grants@example.gov',
      phone: '(800) 123-4567',
      website: 'https://www.example.gov/grants'
    }
  };
}

// Mock funder research response
function getMockFunderResearch(funderName, requirements = []) {
  const isNSF = funderName.toLowerCase().includes('nsf') || funderName.toLowerCase().includes('science foundation');
  const isNIH = funderName.toLowerCase().includes('nih') || funderName.toLowerCase().includes('health');
  const isFoundation = funderName.toLowerCase().includes('foundation');

  let funderPriorities = [];
  let successPatterns = '';
  let typicalAwardSize = '';
  let fundingRate = '';
  let redFlags = [];
  let insiderTips = [];

  if (isNSF) {
    funderPriorities = [
      'Research that advances fundamental science',
      'STEM education and workforce development',
      'Innovation and entrepreneurship',
      'Cross-disciplinary collaboration'
    ];
    successPatterns = 'NSF favors proposals that demonstrate clear intellectual merit and broader impacts. ' +
      'Strong track record of prior NSF funding is a plus. Proposals addressing national priorities get higher scores.';
    typicalAwardSize = '$150K - $750K depending on program';
    fundingRate = '20-25%';
    redFlags = [
      'Lack of specific evaluation metrics',
      'Missing preliminary data or proof of concept',
      'Poor alignment with stated program priorities',
      'Unclear dissemination/commercialization plan'
    ];
    insiderTips = [
      'Get a pre-submission meeting with Program Officer',
      'Check the latest NSF Dear Colleague Letter for hot topics',
      'Include diversity and inclusion statements',
      'Emphasize undergraduate mentoring and career development'
    ];
  } else if (isNIH) {
    funderPriorities = [
      'Biomedical and health research',
      'Disease prevention and health promotion',
      'Clinical outcomes research',
      'Underrepresented populations'
    ];
    successPatterns = 'NIH values innovation, feasibility, and potential impact. Success is correlated with ' +
      'prior NIH funding, strong publication record, and experienced research team. Data showing preliminary feasibility is critical.';
    typicalAwardSize = '$250K - $1.5M per year';
    fundingRate = '20-24%';
    redFlags = [
      'Insufficient preliminary data',
      'Overly ambitious scope for budget/timeline',
      'Weak statistical power or sample size justification',
      'PI with no prior federal funding experience'
    ];
    insiderTips = [
      'Schedule an NIH Scientific Review Officer (SRO) consultation',
      'Use the NIH biosketch format properly',
      'Include Aims page that is laser-focused',
      'Show progress on any previous NIH grants'
    ];
  } else if (isFoundation) {
    funderPriorities = [
      'Community impact and social change',
      'Local engagement and partnerships',
      'Measurable outcomes for target population',
      'Cost-effectiveness and sustainability'
    ];
    successPatterns = 'Foundation program officers value clarity, local knowledge, and realistic budgets. ' +
      'They want to see strong community partnerships and clear metrics. Personal relationships matter.';
    typicalAwardSize = '$50K - $500K one-time grants';
    fundingRate = '15-30% depending on foundation';
    redFlags = [
      'Proposal not aligned with foundation mission',
      'Unrealistic outcomes claims',
      'No clear sustainability plan after grant ends',
      'Missing documentation of community need'
    ];
    insiderTips = [
      'Call the foundation program officer before applying',
      'Include letters from community partners and beneficiaries',
      'Show you understand their priorities and past funding patterns',
      'Keep executive summary to 1 page maximum'
    ];
  } else {
    funderPriorities = [
      'Innovation and research excellence',
      'Organizational capacity and track record',
      'Clear alignment with funder priorities',
      'Strong team and partnerships'
    ];
    successPatterns = 'Strong proposals demonstrate clear need, feasible approach, ' +
      'experienced team, realistic budget, and measurable outcomes.';
    typicalAwardSize = 'Varies by funder';
    fundingRate = '20-25%';
    redFlags = [
      'Missing or unclear evaluation plan',
      'Weak organizational financials',
      'No evidence of similar work by applicant',
      'Unrealistic timeline or budget'
    ];
    insiderTips = [
      'Contact the funder before applying',
      'Read previous successful proposals if available',
      'Get letters of support from credible partners',
      'Be specific, not generic, in your approach'
    ];
  }

  return {
    funder_priorities: funderPriorities,
    success_patterns: successPatterns,
    typical_award_size: typicalAwardSize,
    funding_rate: fundingRate,
    red_flags: redFlags,
    insider_tips: insiderTips
  };
}

// Expert mock draft generation (all 8 sections)
function getMockDraft({ orgProfile, rfpAnalysis }) {
  const orgName = orgProfile.name || 'Our Organization';
  const funderName = rfpAnalysis.funder_name || 'the Funder';
  const budget = orgProfile.annualBudget || orgProfile.annual_budget || 500000;
  const pop = orgProfile.targetPopulation || orgProfile.target_population || 'underserved youth';
  const served = orgProfile.annualClientsServed || orgProfile.annual_clients_served || 2500;

  return {
    executive_summary:
      `${orgName} requests $${(budget * 0.2).toLocaleString()} from ${funderName} to expand our evidence-based program serving ${served.toLocaleString()} ${pop} annually. ` +
      `With ${orgProfile.yearsInOperation || orgProfile.years_in_operation || 8} years of proven outcomes and a ${orgProfile.financialStatus || 'stable'} financial base, ` +
      `we are uniquely positioned to deliver measurable impact aligned with ${funderName}'s priorities. ` +
      `This investment will increase program capacity by 40%, reaching 1,000 additional participants in the next 18 months.`,

    organization_background:
      `Founded ${orgProfile.yearsInOperation || orgProfile.years_in_operation || '8'} years ago, ${orgName} has built a track record of delivering measurable outcomes for ${pop}. ` +
      `${orgProfile.trackRecord || orgProfile.track_record || 'Our work has earned recognition from local and national funders for our rigorous evaluation approach and community-centered model.'} ` +
      `We currently operate with an annual budget of $${(budget).toLocaleString()}, supported by a diversified revenue base including government contracts, foundation grants, and earned income.\n\n` +
      `Our experienced team of professionals is led by a board of ${orgProfile.boardComposition?.size || 12} community leaders. ` +
      `We hold a 501(c)(3) designation and have completed independent financial audits. ` +
      `Our partnerships with ${(orgProfile.partnerships || []).length > 0 ? (orgProfile.partnerships || []).slice(0, 2).join(' and ') : 'local schools, government agencies, and community organizations'} ` +
      `extend our reach and strengthen program quality.`,

    statement_of_need:
      `The challenge facing ${pop} in our service area is both well-documented and urgent. National data shows that without targeted intervention, these individuals face significant barriers to economic mobility and long-term wellbeing. ` +
      `${orgProfile.problemStatement || orgProfile.problem_statement || 'Local research confirms this need is acute in our community, with rates exceeding national averages by 30-40%.'} ` +
      `Despite this documented need, existing services reach fewer than 20% of those who qualify, leaving a critical gap.\n\n` +
      `Root causes include inadequate public investment, systemic inequities, and limited access to high-quality, culturally responsive programming. ` +
      `Community needs assessments conducted in ${new Date().getFullYear() - 1} confirmed this gap directly from ${pop}: ` +
      `87% reported unmet need, and 73% identified our proposed program model as their preferred solution. ` +
      `Without intervention, the consequences compound over time — affecting not just individuals but families and the broader community economy.`,

    goals_and_objectives:
      `GOAL: Expand equitable access to high-quality services for ${pop} in our service area.\n\n` +
      `Objective 1: By Month 6, enroll 500 new participants (40% increase over baseline) with at least 60% from highest-need zip codes.\n` +
      `Objective 2: By Month 12, achieve an 85% program completion rate, measured by attendance and milestone attainment records.\n` +
      `Objective 3: By Month 18, 75% of completers will demonstrate measurable improvement on standardized outcome assessments.\n` +
      `Objective 4: By Month 18, 60% of completers will achieve a defined positive outcome (employment, education enrollment, or housing stability).\n` +
      `Objective 5: By end of grant period, document learnings and create a replication toolkit distributed to 5+ peer organizations.`,

    program_design:
      `${orgName}'s program model is grounded in ${orgProfile.evidenceBase || orgProfile.evidence_base || 'trauma-informed, strengths-based practice'} — an approach with strong evidence across multiple randomized controlled trials. ` +
      `${orgProfile.theoryOfChange || orgProfile.theory_of_change || 'Our theory of change holds that when individuals receive consistent, high-quality, culturally responsive support, they develop the skills and networks needed to achieve lasting change.'}\n\n` +
      `Program implementation follows a structured 3-phase model: (1) Intake and individualized planning in Months 1-3, ` +
      `(2) Core services delivery with weekly touchpoints in Months 4-12, and (3) Transition planning and alumni support in Months 13-18. ` +
      `Each participant receives approximately 120 hours of direct service, supported by a trained staff-to-participant ratio of 1:15. ` +
      `Our existing infrastructure, technology platform, and partnership network allow us to scale immediately without a ramp-up period.`,

    evaluation_plan:
      `Our evaluation approach uses a mixed-methods design to capture both quantitative outcomes and qualitative participant experience. ` +
      `Quantitative data is collected at enrollment, 6 months, and program exit using validated instruments. ` +
      `Data is entered into our secure case management system and reviewed monthly by our Program Manager. ` +
      `An independent external evaluator will conduct a summative evaluation at Month 18 with a comparison group.\n\n` +
      `Key metrics tracked: enrollment and retention, service hours delivered, goal attainment, standardized outcome scores, and 6-month post-exit outcomes. ` +
      `We will share quarterly data reports with ${funderName} and publish an annual outcomes report publicly. ` +
      `Findings will directly inform continuous improvement cycles and feed into our learning management system for ongoing staff development.`,

    sustainability_plan:
      `This grant provides critical bridge funding to expand capacity; ${orgName} has a clear plan to sustain this work beyond the grant period. ` +
      `We are in active conversations with two government agencies about multi-year contracts that would fund 60% of expanded program costs. ` +
      `We are also diversifying our foundation portfolio, with 4 additional grant proposals submitted or in development this fiscal year.\n\n` +
      `Over the grant period, we will build earned revenue components — training fees, consulting, and a social enterprise pilot — projected to generate $75,000/year by Year 3. ` +
      `Our board has committed to a 12-month bridge reserve fund and is conducting a capital campaign targeting $250,000. ` +
      `${orgProfile.sustainabilityPlan || orgProfile.sustainability_plan || 'We are committed to not creating dependency — every program participant has an exit plan, and our operating model is designed for long-term viability without reliance on any single funder.'}`,

    budget_narrative:
      `The total project budget of $${(budget * 0.2).toLocaleString()} covers 18 months of expanded operations. ` +
      `Personnel (55%, $${Math.round(budget * 0.11).toLocaleString()}) represents the largest cost center: a full-time Program Coordinator ($65,000/year, 100% allocated), ` +
      `2 part-time case managers ($40,000 each, 50% allocated), and 10% of the Executive Director's time for oversight and quality assurance. ` +
      `All salaries are benchmarked against local nonprofit sector data and include benefits at 25%.\n\n` +
      `Program operations (25%, $${Math.round(budget * 0.05).toLocaleString()}) covers participant materials, technology licenses, transportation assistance, and training. ` +
      `Evaluation (10%, $${Math.round(budget * 0.02).toLocaleString()}) funds the external evaluator, data systems, and reporting. ` +
      `Administration and indirect costs (10%) are well below our federally-negotiated rate of 15%, reflecting our commitment to program efficiency.\n\n` +
      `Cost per participant is $${Math.round((budget * 0.2) / 1000).toLocaleString()} — approximately 40% below comparable programs nationally per third-party benchmarking. ` +
      `We are leveraging $${Math.round(budget * 0.05).toLocaleString()} in in-kind contributions (facilities, volunteer hours) not included in this request. ` +
      `${funderName}'s investment is the cornerstone of a $${Math.round(budget * 0.35).toLocaleString()} diversified budget that includes government contracts, individual donations, and earned revenue.`
  };
}

// Mock improved draft for reapplications
function getMockImprovedDraft({ orgProfile, rfpAnalysis, previousDraft, rejectionFeedback }) {
  const base = getMockDraft({ orgProfile: orgProfile || {}, rfpAnalysis: rfpAnalysis || {} });
  const feedbackNote = rejectionFeedback
    ? `Directly responding to prior reviewer feedback ("${String(rejectionFeedback).substring(0, 120)}"), this revision strengthens the evidence base and clarifies measurable outcomes. `
    : 'This revision strengthens the evidence base and clarifies measurable outcomes compared to the prior submission. ';

  return {
    problem_statement: feedbackNote + base.problem_statement,
    impact_statement: base.impact_statement +
      ' This revised proposal adds quarterly milestone reporting and an independent evaluation partner to address concerns raised in the previous review cycle.',
    budget_narrative: base.budget_narrative +
      ' Compared to our previous submission, this budget has been re-justified line by line with benchmarking data from comparable funded programs.',
    improvement_summary: 'Revised to address rejection feedback: tightened the problem statement with stronger evidence, ' +
      'added concrete evaluation milestones to the impact statement, and benchmarked the budget against comparable funded programs.'
  };
}

module.exports = {
  getMockRFPAnalysis,
  getMockFunderResearch,
  getMockDraft,
  getMockImprovedDraft
};
