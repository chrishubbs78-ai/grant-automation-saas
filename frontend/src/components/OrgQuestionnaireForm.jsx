import { useState } from 'react';
import '../styles/questionnaire.css';

export default function OrgQuestionnaireForm({ onSubmit, initialData }) {
  const [formData, setFormData] = useState(initialData || {
    name: '',
    mission: '',
    vision: '',
    problemStatement: '',
    targetPopulation: '',
    yearsInOperation: '',
    trackRecord: '',
    annualBudget: '',
    financialStatus: 'stable',
    questionnaire: {}
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="questionnaire-container">
      <div className="questionnaire-wrapper">
        <h1>Organization Profile Questionnaire</h1>
        <p className="subtitle">Tell us about your organization (takes ~15 minutes)</p>

        <form onSubmit={handleSubmit} className="questionnaire-form">
          {/* Section 1: Organization Basics */}
          <section className="form-section">
            <h2>1. Organization Basics</h2>

            <div className="form-group">
              <label htmlFor="name">Organization Name *</label>
              <input
                id="name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Community Education Initiative"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="yearsInOperation">Years in Operation</label>
              <input
                id="yearsInOperation"
                type="number"
                name="yearsInOperation"
                value={formData.yearsInOperation}
                onChange={handleChange}
                placeholder="e.g., 5"
              />
            </div>

            <div className="form-group">
              <label htmlFor="mission">Mission Statement *</label>
              <textarea
                id="mission"
                name="mission"
                value={formData.mission}
                onChange={handleChange}
                placeholder="What is your organization's core mission?"
                rows="3"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="vision">Vision Statement</label>
              <textarea
                id="vision"
                name="vision"
                value={formData.vision}
                onChange={handleChange}
                placeholder="Where are you headed in 5-10 years?"
                rows="3"
              />
            </div>
          </section>

          {/* Section 2: The Problem You Solve */}
          <section className="form-section">
            <h2>2. The Problem You Solve</h2>

            <div className="form-group">
              <label htmlFor="problemStatement">What specific problem do you address? *</label>
              <textarea
                id="problemStatement"
                name="problemStatement"
                value={formData.problemStatement}
                onChange={handleChange}
                placeholder="Be specific. E.g., 'Low literacy rates in underserved neighborhoods'"
                rows="3"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="targetPopulation">Who do you serve? *</label>
              <textarea
                id="targetPopulation"
                name="targetPopulation"
                value={formData.targetPopulation}
                onChange={handleChange}
                placeholder="E.g., '3rd graders in Chicago's South Side, 500+ annually'"
                rows="3"
                required
              />
            </div>
          </section>

          {/* Section 3: Track Record */}
          <section className="form-section">
            <h2>3. Your Track Record</h2>

            <div className="form-group">
              <label htmlFor="trackRecord">What's your biggest success to date?</label>
              <textarea
                id="trackRecord"
                name="trackRecord"
                value={formData.trackRecord}
                onChange={handleChange}
                placeholder="Describe 1-2 major wins with quantified outcomes"
                rows="3"
              />
            </div>
          </section>

          {/* Section 4: Finances */}
          <section className="form-section">
            <h2>4. Finances</h2>

            <div className="form-group">
              <label htmlFor="annualBudget">Annual Budget</label>
              <input
                id="annualBudget"
                type="number"
                name="annualBudget"
                value={formData.annualBudget}
                onChange={handleChange}
                placeholder="e.g., 500000"
              />
            </div>

            <div className="form-group">
              <label htmlFor="financialStatus">Financial Health</label>
              <select
                id="financialStatus"
                name="financialStatus"
                value={formData.financialStatus}
                onChange={handleChange}
              >
                <option value="strong">Strong (growing revenue, 6+ month reserves)</option>
                <option value="stable">Stable (flat revenue, 3-6 month reserves)</option>
                <option value="stressed">Stressed (declining revenue, &lt;3 month reserves)</option>
              </select>
            </div>
          </section>

          {/* Submit */}
          <div className="form-actions">
            <button type="submit" className="btn-primary btn-large">
              Save & Continue
            </button>
            <p className="form-help">
              Your responses are saved automatically. You can edit them anytime.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
