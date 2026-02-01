import {Authenticator} from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import axios from 'axios';
import {Config} from './config';
import {fetchAuthSession} from 'aws-amplify/auth';
import Trips from './Trips';
import {useState, useEffect} from 'react';
import Toast, {type ToastType} from './Toast';
import CustomDatePicker from './DatePicker';
import {formatFlightDate, formatFlightTimeOnly} from './utils/flightTimes';
import Profile from './Profile';

interface FlightData {
  flightNumber: string;
  departureTime: string;
  origin: string;
  destination: string;
  airline: string;
}

type Step = 'input' | 'select' | 'confirm';

function App() {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('input');

  // State for Data
  const [searchResults, setSearchResults] = useState<FlightData[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<FlightData | null>(null);
  const [homeAddress, setHomeAddress] = useState('');

  const [view, setView] = useState<'add' | 'list' | 'profile'>('list');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);

  const showToast = (msg: string, type: ToastType = 'success') => {
    setToast({msg, type});
  };

  const loadUserProfile = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      const res = await axios.get(`${Config.API_URL}/profile`, {
        headers: {Authorization: `Bearer ${token}`}
      });

      if (res.data && res.data.homeAddress) {
        setHomeAddress(res.data.homeAddress); // Directly set the home address
      }
    } catch (err) {
      // Profile doesn't exist yet, that's ok
      console.log('No profile found');
    }
  };


  useEffect(() => {
    if (view === 'add') {
      loadUserProfile();
    }
  }, [view]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const form = new FormData(e.target as HTMLFormElement);
    const flightNum = (form.get('flightNumber') as string).toUpperCase();
    const address = form.get('homeAddress') as string;

    setHomeAddress(address);

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      const res = await axios.get(`${Config.API_URL}/flights/search`, {
        params: {flightNumber: flightNum},
        headers: {Authorization: `Bearer ${token}`}
      });

      const flights = res.data;

      if (flights && flights.length > 0) {
        let matches = flights;

        // FILTER: If user picked a date, filter by it
        if (selectedDate) {
          const dateStr = selectedDate.toISOString().split('T')[0];
          matches = flights.filter((f: any) => f.departureTime.startsWith(dateStr));

          // If strict filtering removed everything, fallback to original list (or show empty)
          if (matches.length === 0) {
            showToast(`Showing all flights found on ${selectedDate.toLocaleDateString()}. `, "success");
            matches = flights;
          }
        }

        setSearchResults(matches);
        setStep('select');
      } else {
        showToast(`Flight ${flightNum} not found.`, "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to search flight. Check inputs.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFlight = (flight: FlightData) => {
    setSelectedFlight(flight);
    setStep('confirm');
  };

  // 3. CONFIRM TRIP
  const handleConfirm = async () => {
    setLoading(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      await axios.post(`${Config.API_URL}/trips`, {
        flightNumber: selectedFlight?.flightNumber,
        date: selectedFlight?.departureTime,
        airportCode: selectedFlight?.origin,
        homeAddress: homeAddress,
      }, {
        headers: {Authorization: `Bearer ${token}`}
      });

      showToast("Trip tracked successfully!", "success");

      setStep('input');
      setSelectedFlight(null);
      setSearchResults([]);
      setHomeAddress('');
      setSelectedDate(null); // Reset date
      setView('list');
    } catch (err) {
      console.error(err);
      showToast("Failed to save trip.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setStep('input');
    setSearchResults([]);
  };

  return (
      <div className="app-container">
        {toast && (
            <Toast
                message={toast.msg}
                type={toast.type}
                onClose={() => setToast(null)}
            />
        )}

        <Authenticator socialProviders={['google']}>
          {({signOut}) => (
              <div
                  className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-6 flex flex-col items-center font-sans">

                <header
                    className="w-full max-w-md flex justify-between items-center mb-8 pb-4 border-b border-gray-100 dark:border-gray-800">
                  <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    Flight AI
                  </h1>
                  <div className="flex gap-4 text-sm font-medium">
                    <button
                        onClick={() => setView('list')}
                        className={`${
                            view === 'list'
                                ? 'text-blue-600 border-b-2 border-blue-600'
                                : 'text-gray-500 hover:text-blue-500 hover:border-b-2 hover:border-blue-300'
                        } pb-1 transition-all cursor-pointer border-b-2 border-transparent`}
                    >
                      My Trips
                    </button>
                    <button
                        onClick={() => setView('profile')}
                        className={`${
                            view === 'profile'
                                ? 'text-blue-600 border-b-2 border-blue-600'
                                : 'text-gray-500 hover:text-blue-500 hover:border-b-2 hover:border-blue-300'
                        } pb-1 transition-all cursor-pointer border-b-2 border-transparent`}
                    >
                      Profile
                    </button>
                    <button
                        onClick={signOut}
                        className="text-gray-400 hover:text-red-500 pb-1 transition-colors cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>

                </header>

                <main className="w-full max-w-md">
                  {view === 'list' ? (
                      <Trips onBack={() => setView('add')}/>
                  ) : view === 'profile' ? (
                      <Profile onBack={() => setView('list')}/>
                  ) : (
                      <>
                        {step === 'input' && (
                            <div className="animate-fade-in">
                              <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold">Track a New Flight</h2>
                                <button onClick={() => setView('list')}
                                        className="text-sm text-gray-500">Cancel
                                </button>
                              </div>

                              <form onSubmit={handleLookup} className="space-y-4">
                                <div>
                                  <label
                                      className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                                    Flight Info
                                  </label>
                                  <div className="flex gap-2">
                                    <input
                                        name="flightNumber"
                                        placeholder="e.g. AA123"
                                        required
                                        className="flex-1 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-blue-500 transition-all outline-none uppercase font-medium"
                                    />

                                    <CustomDatePicker
                                        selected={selectedDate}
                                        onChange={(date) => setSelectedDate(date)}
                                        placeholder="Date (Opt)"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label
                                      className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                                    Start Location
                                  </label>
                                  <input
                                      name="homeAddress"
                                      placeholder="123 Main St, Chicago..."
                                      required
                                      value={homeAddress}
                                      onChange={(e) => setHomeAddress(e.target.value)}
                                      className="w-full p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                  />

                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 transition-all disabled:opacity-70"
                                >
                                  {loading ? 'Searching...' : 'Find Flight'}
                                </button>
                              </form>
                            </div>
                        )}

                        {/* STEP 2: SELECT FLIGHT */}
                        {step === 'select' && (
                            <div className="animate-fade-in">
                              <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold">Select Flight</h2>
                                <button onClick={handleCancel}
                                        className="text-sm text-gray-500">Back
                                </button>
                              </div>

                              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                                {searchResults.map((flight, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleSelectFlight(flight)}
                                        className="w-full text-left bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border-2 border-transparent hover:border-blue-500 hover:bg-white dark:hover:bg-gray-700 transition-all shadow-sm group"
                                    >
                                      <div className="flex justify-between items-center mb-1">
                                        <span
                                            className="font-bold text-lg">{flight.flightNumber}</span>
                                        <span
                                            className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-md">{flight.airline}</span>
                                      </div>
                                      <div
                                          className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                                        <span>{formatFlightDate(flight.departureTime, flight.origin)}</span>
                                        <span>{formatFlightTimeOnly(flight.departureTime, flight.origin)}</span>
                                      </div>

                                      <div
                                          className="mt-2 text-xs text-gray-400 font-medium flex items-center gap-2">
                                        <span>{flight.origin}</span>
                                        <span
                                            className="h-[1px] flex-1 bg-gray-300 dark:bg-gray-600"></span>
                                        <span>{flight.destination}</span>
                                      </div>
                                    </button>
                                ))}
                              </div>
                            </div>
                        )}

                        {/* STEP 3: CONFIRM */}
                        {step === 'confirm' && (
                            <div
                                className="bg-gray-50 dark:bg-gray-800 p-6 rounded-2xl shadow-xl space-y-6 animate-fade-in border border-gray-100 dark:border-gray-700">
                              <h2 className="text-xl font-bold text-center">Confirm Trip
                                Details</h2>
                              <div className="space-y-4">
                                <div
                                    className="flex items-center justify-between p-4 bg-white dark:bg-gray-700/50 rounded-xl">
                                  <div>
                                    <p className="text-xs text-gray-500 uppercase">Flight</p>
                                    <p className="text-xl font-bold">{selectedFlight?.flightNumber}</p>
                                    <p className="text-xs text-gray-400">{selectedFlight?.airline}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs text-gray-500 uppercase">Departing</p>
                                    <p className="text-lg font-bold text-blue-500">
                                      {selectedFlight ? formatFlightDate(selectedFlight.departureTime, selectedFlight.origin) : ''}
                                    </p>
                                    <p className="text-sm font-medium text-gray-400">
                                      {selectedFlight ? formatFlightTimeOnly(selectedFlight.departureTime, selectedFlight.origin) : ''}
                                    </p>
                                  </div>

                                </div>
                                <div className="px-2">
                                  <p className="text-xs text-gray-500 uppercase">Leaving From</p>
                                  <p className="text-sm truncate">{homeAddress}</p>
                                </div>
                              </div>
                              <div className="flex gap-3 pt-2">
                                <button onClick={handleCancel}
                                        className="flex-1 py-3 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl font-medium">Cancel
                                </button>
                                <button onClick={handleConfirm} disabled={loading}
                                        className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg transition-all">
                                  {loading ? 'Scheduling...' : 'Track Flight'}
                                </button>
                              </div>
                            </div>
                        )}
                      </>
                  )}
                </main>
              </div>
          )}
        </Authenticator>
      </div>
  );
}

export default App;
