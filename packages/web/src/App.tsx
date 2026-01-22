import {useState, useEffect} from 'react';
import {Amplify} from 'aws-amplify';
import {Authenticator} from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import axios from 'axios';
import {fetchAuthSession} from 'aws-amplify/auth';
import {Config} from './config';
import Trips from './Trips';
import Toast, {ToastType} from './Toast';

// Configure Amplify
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: Config.USER_POOL_ID,
      userPoolClientId: Config.USER_POOL_CLIENT_ID,
      loginWith: {
        oauth: {
          domain: Config.COGNITO_DOMAIN,
          scopes: ['email', 'profile', 'openid'],
          redirectSignIn: [Config.REDIRECT_URI],
          redirectSignOut: [Config.REDIRECT_URI],
          responseType: 'code',
        },
      },
    },
  },
});

type ViewState = 'list' | 'search' | 'confirm';

interface FlightData {
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  airline: string;
}

function App() {
  const [view, setView] = useState<ViewState>('list');
  const [flightNumInput, setFlightNumInput] = useState('');
  const [homeAddress, setHomeAddress] = useState('');

  // New State for Search
  const [isSearching, setIsSearching] = useState(false);
  const [flightData, setFlightData] = useState<FlightData | null>(null);

  // Toast State
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);

  const showToast = (msg: string, type: ToastType = 'success') => {
    setToast({msg, type});
  };

  const handleSearchFlight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flightNumInput) return;

    setIsSearching(true);
    setFlightData(null); // Clear previous

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      // Call our new API endpoint
      const res = await axios.get(`${Config.API_URL}/flights/search`, {
        params: {flightNumber: flightNumInput},
        headers: {Authorization: `Bearer ${token}`}
      });

      const flights = res.data;

      if (flights && flights.length > 0) {
        // Find the first "active" or "scheduled" flight, or just default to the first one
        const match = flights[0];

        setFlightData({
          flightNumber: match.flightNumber,
          origin: match.origin,
          destination: match.destination,
          departureTime: match.departureTime,
          airline: match.airline
        });

        // Move to confirm step only if we found data
        setView('confirm');
      } else {
        showToast(`No flights found for ${flightNumInput}`, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to search flight info", 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleConfirmTrip = async () => {
    if (!flightData || !homeAddress) {
      showToast("Please enter your home address", 'error');
      return;
    }

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      await axios.post(
          `${Config.API_URL}/trips`,
          {
            flightNumber: flightData.flightNumber,
            date: flightData.departureTime, // Use the real date from API
            airportCode: flightData.origin, // Use real origin
            homeAddress,
            userId: "user_from_token" // Backend handles this now
          },
          {
            headers: {Authorization: `Bearer ${token}`},
          }
      );

      showToast("Trip tracked successfully!", "success");
      setFlightData(null);
      setFlightNumInput('');
      setHomeAddress('');
      setView('list');
    } catch (err) {
      console.error(err);
      showToast("Failed to save trip", "error");
    }
  };

  return (
      <Authenticator>
        {({signOut, user}) => (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10">

              {/* Toast Notification */}
              {toast && (
                  <Toast
                      message={toast.msg}
                      type={toast.type}
                      onClose={() => setToast(null)}
                  />
              )}

              <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden">
                {/* Header */}
                <div className="bg-indigo-600 p-6 flex justify-between items-center">
                  <h1 className="text-white text-xl font-bold">Flight AI</h1>
                  <button onClick={signOut} className="text-indigo-200 hover:text-white text-sm">
                    Sign Out
                  </button>
                </div>

                <div className="p-6">
                  {/* LIST VIEW */}
                  {view === 'list' && (
                      <Trips onBack={() => setView('search')}/>
                  )}

                  {/* SEARCH VIEW */}
                  {view === 'search' && (
                      <div>
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">Track a New
                          Flight</h2>
                        <form onSubmit={handleSearchFlight}>
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Flight
                              Number</label>
                            <input
                                type="text"
                                placeholder="e.g. AA123"
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                                value={flightNumInput}
                                onChange={(e) => setFlightNumInput(e.target.value.toUpperCase())}
                            />
                          </div>
                          <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setView('list')}
                                className="flex-1 py-3 text-gray-600 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 transition"
                            >
                              Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSearching || !flightNumInput}
                                className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                            >
                              {isSearching ? 'Searching...' : 'Find Flight'}
                            </button>
                          </div>
                        </form>
                      </div>
                  )}

                  {/* CONFIRM VIEW */}
                  {view === 'confirm' && flightData && (
                      <div>
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">Confirm Trip
                          Details</h2>

                        <div className="bg-indigo-50 p-4 rounded-lg mb-6 border border-indigo-100">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-500">Flight</p>
                              <p className="font-semibold text-gray-900">{flightData.flightNumber}</p>
                              <p className="text-xs text-gray-500">{flightData.airline}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-500">Departing</p>
                              <p className="font-semibold text-gray-900">
                                {new Date(flightData.departureTime).toLocaleDateString()}
                              </p>
                              <p className="text-xs text-gray-500">
                                {new Date(flightData.departureTime).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                            <div className="col-span-2 pt-2 border-t border-indigo-100 mt-2">
                              <p className="text-gray-500">Route</p>
                              <p className="font-semibold text-gray-900 flex items-center gap-2">
                                {flightData.origin}
                                <span className="text-indigo-400">➝</span>
                                {flightData.destination}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mb-6">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Where are you leaving from?
                          </label>
                          <input
                              type="text"
                              placeholder="e.g. 123 Main St, Chicago, IL"
                              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                              value={homeAddress}
                              onChange={(e) => setHomeAddress(e.target.value)}
                          />
                        </div>

                        <div className="flex gap-3">
                          <button
                              onClick={() => setView('search')}
                              className="flex-1 py-3 text-gray-600 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 transition"
                          >
                            Back
                          </button>
                          <button
                              onClick={handleConfirmTrip}
                              disabled={!homeAddress}
                              className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                          >
                            Track Flight
                          </button>
                        </div>
                      </div>
                  )}
                </div>
              </div>
            </div>
        )}
      </Authenticator>
  );
}

export default App;
