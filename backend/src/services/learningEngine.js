const { Outcome, Analytics, Grant } = require('../models');

/**
 * Compute analytics from outcomes
 * This is rule-based learning: analyze funding patterns to generate recommendations
 */
async function computeAnalytics(orgId) {
  try {
    // Fetch all outcomes for this org
    const outcomes = await Outcome.findAll({
      where: { org_id: orgId },
      include: [{ association: 'grant', attributes: ['id', 'funder_name', 'amount'] }]
    });

    if (outcomes.length === 0) {
      // No outcomes yet, return empty analytics
      return {
        org_id: orgId,
        total_submitted: 0,
        total_funded: 0,
        win_rate: 0,
        win_rate_by_funder_type: {},
        avg_award_amount: 0,
        success_funders: [],
        recommendations: []
      };
    }

    // Compute metrics
    const totalSubmitted = outcomes.length;
    const totalFunded = outcomes.filter(o => o.funded).length;
    const winRate = (totalFunded / totalSubmitted) * 100;

    // Win rate by funder type
    const byFunderType = {};
    outcomes.forEach(outcome => {
      const type = outcome.funder_type || 'unknown';
      if (!byFunderType[type]) {
        byFunderType[type] = { submitted: 0, funded: 0 };
      }
      byFunderType[type].submitted += 1;
      if (outcome.funded) {
        byFunderType[type].funded += 1;
      }
    });

    const winRateByFunderType = {};
    Object.entries(byFunderType).forEach(([type, stats]) => {
      winRateByFunderType[type] = (stats.funded / stats.submitted) * 100;
    });

    // Average award amount (for funded grants only)
    const fundedOutcomes = outcomes.filter(o => o.funded && o.grant?.amount);
    const avgAwardAmount = fundedOutcomes.length > 0
      ? fundedOutcomes.reduce((sum, o) => sum + (o.grant?.amount || 0), 0) / fundedOutcomes.length
      : 0;

    // Success funders (funded at least once)
    const successFunders = [
      ...new Set(
        outcomes
          .filter(o => o.funded && o.grant?.funder_name)
          .map(o => o.grant.funder_name)
      )
    ];

    // Generate recommendations (rule-based learning)
    const recommendations = generateRecommendations(
      winRateByFunderType,
      successFunders,
      outcomes,
      totalSubmitted,
      totalFunded
    );

    // Store or update analytics
    let analytics = await Analytics.findOne({ where: { org_id: orgId } });

    if (!analytics) {
      analytics = await Analytics.create({
        org_id: orgId,
        total_submitted: totalSubmitted,
        total_funded: totalFunded,
        win_rate: winRate,
        win_rate_by_funder_type: winRateByFunderType,
        avg_award_amount: avgAwardAmount,
        success_funders: successFunders,
        recommendations
      });
    } else {
      await analytics.update({
        total_submitted: totalSubmitted,
        total_funded: totalFunded,
        win_rate: winRate,
        win_rate_by_funder_type: winRateByFunderType,
        avg_award_amount: avgAwardAmount,
        success_funders: successFunders,
        recommendations,
        computed_at: new Date()
      });
    }

    return analytics.get({ plain: true });
  } catch (error) {
    console.error('Analytics computation error:', error);
    throw error;
  }
}

/**
 * Rule-based recommendation engine
 * Analyzes patterns from outcomes to suggest where to focus efforts
 */
function generateRecommendations(winRateByFunderType, successFunders, outcomes, total, funded) {
  const recommendations = [];

  // Rule 1: If win rate > 50%, you're doing great
  if ((funded / total) * 100 > 50) {
    recommendations.push({
      type: 'success',
      message: `🎯 Excellent win rate (${((funded / total) * 100).toFixed(1)}%)! You're in top tier. Focus on consistency.`
    });
  }

  // Rule 2: Identify best-performing funder types
  const topFunderTypes = Object.entries(winRateByFunderType)
    .filter(([type, rate]) => rate > 50)
    .sort((a, b) => b[1] - a[1]);

  if (topFunderTypes.length > 0) {
    const bestType = topFunderTypes[0][0];
    const bestRate = topFunderTypes[0][1];
    recommendations.push({
      type: 'focus',
      message: `📈 ${bestType} funders are your strength (${bestRate.toFixed(1)}% win rate). Prioritize these.`
    });
  }

  // Rule 3: Identify weak areas needing improvement
  const weakFunderTypes = Object.entries(winRateByFunderType)
    .filter(([type, rate]) => rate < 25)
    .sort((a, b) => a[1] - b[1]);

  if (weakFunderTypes.length > 0) {
    const weakType = weakFunderTypes[0][0];
    const weakRate = weakFunderTypes[0][1];
    recommendations.push({
      type: 'warning',
      message: `⚠️ ${weakType} funders have low success (${weakRate.toFixed(1)}%). Consider improving approach or reducing volume.`
    });
  }

  // Rule 4: If you have success funders, recommend doubling down
  if (successFunders.length > 0) {
    const topFunder = successFunders[0]; // Could enhance with frequency analysis
    recommendations.push({
      type: 'strategy',
      message: `✨ "${topFunder}" has funded you. Build on this relationship—they know your value.`
    });
  }

  // Rule 5: Minimum data threshold warning
  if (total < 5) {
    recommendations.push({
      type: 'info',
      message: `📊 You have ${total} outcome(s). After 10-20 outcomes, patterns will become clearer.`
    });
  }

  // Rule 6: If you have no fundeds yet, provide encouragement
  if (funded === 0 && total >= 3) {
    recommendations.push({
      type: 'caution',
      message: `💪 No wins yet, but ${total} applications is a good start. Refine your approach and keep going.`
    });
  }

  return recommendations;
}

module.exports = {
  computeAnalytics,
  generateRecommendations
};
