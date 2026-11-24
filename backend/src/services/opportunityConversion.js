/**
 * Turn a matched opportunity into an application with a seeded RFP analysis,
 * so a draft can be generated right away. Shared by the convert route (the
 * manual approval) and the automation runner (auto-approval above a score).
 */
const { Grant, RFPAnalysis } = require('../models');
const { applicantLaneFor } = require('./matchingEngine');

async function convertMatchToGrant(org, match) {
  const opp = match.opportunity;

  const grant = await Grant.create({
    org_id: org.id,
    opportunity_id: opp.id,
    funder_name: opp.agency || opp.title,
    deadline: opp.close_date,
    amount: opp.award_ceiling || null,
    status: 'draft',
    // Which entity applies: the business, or the youth program via its sponsor.
    applicant_lane: (match.prefilter_result && match.prefilter_result.eligibility
      && match.prefilter_result.eligibility.apply_as)
      || applicantLaneFor(opp, org),
    rfp_analysis: {
      funder_name: opp.agency,
      deadline: opp.close_date,
      award_range: { min: opp.award_floor, max: opp.award_ceiling },
      eligibility: { who_can_apply: opp.eligibility_text || 'See opportunity listing' },
      source_url: opp.source_url
    },
    // Keep the trail back to the listing on the grant itself. Once this
    // becomes an application you are working for weeks, "where did this come
    // from" is a question you will ask again.
    notes: `Discovered via ${opp.source} (${opp.opportunity_number || opp.source_id}).`
      + (match.fit_score !== null ? ` Match score ${match.fit_score}/100.` : '')
      + (opp.source_url ? `\nListing: ${opp.source_url}` : '')
  });

  // Seed the RFP analysis so /api/drafts/generate works on this grant with no
  // further input — this is what makes discovery → draft a single click.
  const analysis = await RFPAnalysis.create({
    grant_id: grant.id,
    org_id: org.id,
    raw_text: (opp.description || opp.title || '').substring(0, 5000),
    funder_name: opp.agency || 'Unknown',
    deadline: opp.close_date,
    requirements: [],
    evaluation_criteria: {},
    research_summary: {
      source: opp.source,
      source_url: opp.source_url,
      opportunity_number: opp.opportunity_number,
      match_rationale: match.rationale,
      key_alignment: match.key_alignment,
      concerns: match.concerns
    }
  });

  await match.update({ status: 'converted', grant_id: grant.id });

  return { grant, analysis };
}

module.exports = { convertMatchToGrant };
