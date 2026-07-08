import { useState, useEffect } from 'react';
import './App.css';
import OrgQuestionnaireForm from './components/OrgQuestionnaireForm';
import Dashboard from './components/Dashboard';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [orgProfile, setOrgProfile] = useState(null);
  const [view, setView] = useState('loading'); // loading, questionnaire, dashboard
  const [error, setError] = useState(null);

  // Auto-login on app load
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Try to get stored token first
        let currentToken = token;

        // If no stored token, fetch default token for private/personal use
        if (!currentToken) {
          const response = await fetch('http://localhost:4006/api/auth/default-token');
          const result = await response.json();

          if (result.success) {
            currentToken = result.data.token;
            localStorage.setItem('token', currentToken);
            setToken(currentToken);
          } else {
            setError('Failed to initialize. Please refresh.');
            return;
          }
        }

        // Now fetch org profile
        const orgResponse = await fetch('http://localhost:4006/api/org', {
          headers: { Authorization: `Bearer ${currentToken}` }
        });
        const orgResult = await orgResponse.json();

        if (orgResult.success && orgResult.data) {
          setOrgProfile(orgResult.data);
          setView('dashboard');
        } else {
          setView('questionnaire');
        }
      } catch (err) {
        console.error('Initialization error:', err);
        setError('Failed to connect to server. Is it running on port 4006?');
        setView('error');
      }
    };

    initializeApp();
  }, []);

  const handleQuestionnaireSubmit = async (formData) => {
    try {
      const response = await fetch('http://localhost:4006/api/org/questionnaire', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      const result = await response.json();

      if (result.success) {
        setOrgProfile(result.data);
        setView('dashboard');
      }
    } catch (error) {
      console.error('Questionnaire submission error:', error);
      setError('Failed to save questionnaire');
    }
  };

  if (view === 'loading') {
    return (
      <div className="app loading">
        <div className="loading-spinner">
          <p>🚀 Grant Automation SaaS</p>
          <p style={{ fontSize: '12px', marginTop: '10px' }}>Initializing...</p>
        </div>
      </div>
    );
  }

  if (view === 'error') {
    return (
      <div className="app error">
        <div className="error-message">
          <h2>⚠️ Connection Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {view === 'questionnaire' && token && (
        <OrgQuestionnaireForm
          onSubmit={handleQuestionnaireSubmit}
          initialData={orgProfile}
        />
      )}

      {view === 'dashboard' && token && orgProfile && (
        <Dashboard
          orgProfile={orgProfile}
          onEditProfile={() => setView('questionnaire')}
        />
      )}
    </div>
  );
}

export default App
