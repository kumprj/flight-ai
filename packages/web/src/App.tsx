import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { useState } from 'react';
import axios from 'axios';
import { Config } from './config';
import { fetchAuthSession } from 'aws-amplify/auth';

function App() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: any, user: any) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.target);
    const trip = {
      userId: user.signInDetails?.loginId || user.username,
      flightNumber: formData.get('flightNumber'),
      date: formData.get('date'), // "2026-05-20T14:00"
      airportCode: formData.get('airportCode'),
      homeAddress: formData.get('homeAddress'),
    };

    try {
      // Get the JWT token to verify identity (optional, if you secured API)
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      await axios.post(`${Config.API_URL}/trips`, trip, {
        headers: { Authorization: token }
      });
      alert('Trip Added! You will be notified 4 hours before.');
      e.target.reset();
    } catch (err) {
      console.error(err);
      alert('Failed to add trip');
    } finally {
      setLoading(false);
    }
  };

  return (
      <Authenticator>
        {({ signOut, user }) => (
            <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
              <h1>✈️ Flight AI</h1>
              <p>Welcome, {user?.signInDetails?.loginId}</p>

              <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '8px' }}>
                <h2>Add New Trip</h2>
                <form onSubmit={(e) => handleSubmit(e, user)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                  <label>
                    Flight Number
                    <input name="flightNumber" placeholder="AA123" required style={{ display: 'block', width: '100%', padding: '0.5rem' }} />
                  </label>

                  <label>
                    Date & Time of Flight
                    <input name="date" type="datetime-local" required style={{ display: 'block', width: '100%', padding: '0.5rem' }} />
                  </label>

                  <label>
                    Airport Code
                    <input name="airportCode" placeholder="ORD" required style={{ display: 'block', width: '100%', padding: '0.5rem' }} />
                  </label>

                  <label>
                    Home Address
                    <input name="homeAddress" placeholder="123 Main St..." required style={{ display: 'block', width: '100%', padding: '0.5rem' }} />
                  </label>

                  <button type="submit" disabled={loading} style={{ padding: '0.75rem', background: 'black', color: 'white', border: 'none', cursor: 'pointer' }}>
                    {loading ? 'Scheduling...' : 'Track Flight'}
                  </button>
                </form>
              </div>

              <button onClick={signOut} style={{ marginTop: '2rem' }}>Sign Out</button>
            </main>
        )}
      </Authenticator>
  );
}

export default App;
