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

// Mock draft generation response
function getMockDraft({ orgProfile, rfpAnalysis }) {
  const orgName = orgProfile.name || 'Our Organization';
  const funderName = rfpAnalysis.funder_name || 'the Funder';

  return {
    problem_statement: `Communities across America are facing significant challenges related to education equity and access. ${orgName} ` +
      `has identified that low-income neighborhoods lack adequate resources for STEM education, with less than 30% of students ` +
      `completing STEM coursework compared to 50% in well-resourced areas. This inequity begins early and compounds over time, ` +
      `limiting career opportunities and perpetuating economic disparity. Our organization, with 8 years of direct experience ` +
      `serving 2,500+ students annually, has developed evidence-based approaches to address this gap. With support from ${funderName}, ` +
      `we will expand our proven curriculum to reach an additional 1,000 underrepresented students in STEM fields.`,

    impact_statement: `This project will directly impact 1,000 additional students from underrepresented backgrounds, providing them with ` +
      `hands-on STEM education, mentorship, and career pathways. Based on our prior work, we expect 75% of participants to complete the ` +
      `program, 85% to show measurable improvement in STEM skills, and 60% to pursue STEM-related careers or advanced education. Indirect ` +
      `impacts include strengthened school partnerships, professional development for 50 teachers, and creation of replicable curriculum ` +
      `models for adoption by other organizations. Over five years, we project this initiative will benefit 5,000+ students and contribute ` +
      `to addressing critical STEM workforce shortages in our region.`,

    budget_narrative: `Our $500,000 budget request is structured to ensure quality programming while maintaining financial sustainability. ` +
      `Personnel costs ($250,000, 50%) support our experienced Program Director, 3 full-time instructors, and 1 part-time evaluator—all ` +
      `critical to maintaining our proven 85% program completion rate. Program operations ($150,000, 30%) cover curriculum development, ` +
      `classroom materials, technology equipment, and student incentives. We prioritize hands-on learning with real equipment. Evaluation and ` +
      `outcomes tracking ($50,000, 10%) funds our independent evaluator to assess impact against concrete metrics. Administration ($50,000, 10%) ` +
      `covers essential operations and compliance. Our cost per student ($500) is competitive with similar programs and 40% lower than national ` +
      `averages. We commit 15% organizational cost-share through in-kind facility donations and executive leadership time. This budget will serve ` +
      `1,000 new students while maintaining the high-touch mentorship that defines our approach.`
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
