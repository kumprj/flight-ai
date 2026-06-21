import axios from 'axios';
import {Config} from './config';
import {fetchAuthSession, getCurrentUser, signInWithRedirect, signOut} from 'aws-amplify/auth';
import {Hub} from 'aws-amplify/utils';
import Trips from './Trips';
import {useState, useEffect} from 'react';
import Toast, {type ToastType} from './Toast';
import CustomDatePicker from './DatePicker';
import {formatFlightDate, formatFlightTimeOnly} from './utils/flightTimes';
import Profile from './Profile';
import CalendarImport from './CalendarImport';
import Onboarding from './Onboarding';
import type { CalendarFlight } from './utils/googleCalendar';

interface FlightData {
  flightNumber: string;
  departureTime: string;
  origin: string;
  destination: string;
  airline: string;
}

interface Trip {
  sk: string;
  flightNumber: string;
  date: string;
  originAirport: string;
  destinationAirport: string;
  homeAddress: string;
  createdAt?: number;
}

type Step = 'input' | 'select' | 'confirm';

function App() {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('input');

  // State for Data
  const [searchResults, setSearchResults] = useState<FlightData[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<FlightData | null>(null);
  const [homeAddress, setHomeAddress] = useState('');
  const [searchMode, setSearchMode] = useState<'flight' | 'route'>('flight');
  const [depAirport, setDepAirport] = useState('');
  const [arrAirport, setArrAirport] = useState('');

  const [view, setView] = useState<'add' | 'list' | 'profile'>('list');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [showCalendarImport, setShowCalendarImport] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null); // null = loading
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null); // null = loading

  const handleCalendarImport = async (flights: CalendarFlight[], address: string): Promise<void> => {
    if (flights.length === 0) { setShowCalendarImport(false); return; }
    if (address) setHomeAddress(address);

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      let imported = 0;
      const ambiguous: Array<{ flight: CalendarFlight; results: FlightData[] }> = [];
      const notFound: string[] = [];

      for (const calFlight of flights) {
        try {
          const res = await axios.get(`${Config.API_URL}/flights/search`, {
            params: { flightNumber: calFlight.flightNumber, date: calFlight.date },
            headers: { Authorization: `Bearer ${token}` }
          });
          const results: FlightData[] = res.data ?? [];

          if (results.length === 0) {
            notFound.push(calFlight.flightNumber);
          } else if (results.length === 1) {
            await axios.post(`${Config.API_URL}/trips`, {
              flightNumber: results[0].flightNumber,
              date: results[0].departureTime,
              originAirport: results[0].origin,
              destinationAirport: results[0].destination,
              homeAddress: calFlight.address || address,
            }, { headers: { Authorization: `Bearer ${token}` } });
            imported++;
          } else {
            ambiguous.push({ flight: calFlight, results });
          }
        } catch {
          notFound.push(calFlight.flightNumber);
        }
      }

      if (imported > 0) {
        showToast(`${imported} flight${imported !== 1 ? 's' : ''} imported successfully!`, 'success');
      }
      if (notFound.length > 0) {
        showToast(`Could not find: ${notFound.join(', ')}`, 'error');
      }

      // If any flights had multiple results, prompt for the first one manually
      if (ambiguous.length > 0) {
        const first = ambiguous[0];
        setSearchMode('flight');
        setSelectedDate(new Date(first.flight.date + 'T12:00:00'));
        setSearchResults(first.results);
        setView('add');
        setStep('select');
        if (ambiguous.length > 1) {
          showToast(`${first.flight.flightNumber} has multiple results — please select one. ${ambiguous.length - 1} more need manual selection.`, 'success');
        }
      } else if (imported > 0) {
        setView('list');
      }
    } catch (err) {
      console.error(err);
      showToast('Calendar import failed.', 'error');
    } finally {
      setLoading(false);
      setShowCalendarImport(false);
    }
  };

  const showToast = (msg: string, type: ToastType = 'success') => {
    setToast({msg, type});
  };

  useEffect(() => {
    getCurrentUser()
      .then(() => {
        setIsAuthenticated(true);
        checkOnboardingStatus();
      })
      .catch(() => setIsAuthenticated(false));

    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') {
        setIsAuthenticated(true);
        checkOnboardingStatus();
      }
      if (payload.event === 'signedOut') {
        setIsAuthenticated(false);
        setNeedsOnboarding(null);
      }
    });
    return unsubscribe;
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      const res = await axios.get(`${Config.API_URL}/profile`, {
        headers: {Authorization: `Bearer ${token}`}
      });

      // If profile exists and has homeAddress, user has completed onboarding
      if (res.data && res.data.homeAddress) {
        setNeedsOnboarding(false);
      } else {
        setNeedsOnboarding(true);
      }
    } catch (err: any) {
      // Profile doesn't exist yet, needs onboarding
      if (err.response?.status === 404) {
        setNeedsOnboarding(true);
      } else {
        console.error('Error checking onboarding status:', err);
        setNeedsOnboarding(true);
      }
    }
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
    const flightNumRaw = form.get('flightNumber') as string;
    const address = form.get('homeAddress') as string;
    const depRaw = form.get('depAirport') as string;
    const arrRaw = form.get('arrAirport') as string;

    const flightNum = flightNumRaw ? flightNumRaw.toUpperCase().replace(/\s/g, '') : '';
    const dep = depRaw ? depRaw.toUpperCase() : '';
    const arr = arrRaw ? arrRaw.toUpperCase() : '';

    setHomeAddress(address);

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      let params: any = {};

      if (searchMode === 'flight') {
        if (!flightNum) {
          showToast("Please enter a flight number.", "error");
          setLoading(false);
          return;
        }
        if (!/^[A-Z]{2}\d{1,4}$/.test(flightNum)) {
          showToast("Invalid flight number. Expected format: 2 letters followed by 1–4 digits (e.g. UA123 or DL 2806).", "error");
          setLoading(false);
          return;
        }
        params.flightNumber = flightNum;
        if (selectedDate) {
          params.date = selectedDate.toISOString().split('T')[0];
        }
      } else {
        // Route mode
        if (!dep || !arr || !selectedDate) {
          showToast("Please enter departure, destination airports, and date.", "error");
          setLoading(false);
          return;
        }
        params.depIata = dep;
        params.arrIata = arr;
        params.date = selectedDate.toISOString().split('T')[0];
        console.log('Route search params:', params);
      }

      console.log('Sending flight search request with params:', params);
      const res = await axios.get(`${Config.API_URL}/flights/search`, {
        params,
        headers: {Authorization: `Bearer ${token}`}
      });
      console.log('Flight search response:', res.status, res.data);

      const flights = res.data;

      if (flights && flights.length > 0) {
        setSearchResults(flights);
        setStep('select');
      } else {
        if (searchMode === 'flight') {
          showToast(`Flight ${flightNum} not found. Airlines typically publish schedules 6-11 months in advance.`, "error");
        } else {
          const monthsOut = selectedDate ? Math.floor((selectedDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)) : 0;
          const message = monthsOut > 11 
            ? `No flights found from ${dep} to ${arr} on ${selectedDate?.toLocaleDateString()}. This date is ${monthsOut} months away - airlines typically publish schedules only 6-11 months in advance. Try using Google Calendar Import for future flights.`
            : `No flights found from ${dep} to ${arr} on ${selectedDate?.toLocaleDateString()}.`;
          showToast(message, "error");
        }
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

      if (editingTrip) {
        // Update existing trip
        await axios.put(`${Config.API_URL}/trips`, {
          flightNumber: selectedFlight?.flightNumber,
          date: selectedFlight?.departureTime,
          originAirport: selectedFlight?.origin,
          destinationAirport: selectedFlight?.destination,
          homeAddress: homeAddress,
          createdAt: editingTrip.createdAt,
        }, {
          headers: {Authorization: `Bearer ${token}`}
        });
        showToast("Trip updated successfully!", "success");
      } else {
        // Create new trip
        await axios.post(`${Config.API_URL}/trips`, {
          flightNumber: selectedFlight?.flightNumber,
          date: selectedFlight?.departureTime,
          originAirport: selectedFlight?.origin,
          destinationAirport: selectedFlight?.destination,
          homeAddress: homeAddress,
        }, {
          headers: {Authorization: `Bearer ${token}`}
        });
        showToast("Trip tracked successfully!", "success");
      }

      setStep('input');
      setSelectedFlight(null);
      setSearchResults([]);
      setHomeAddress('');
      setSelectedDate(null); // Reset date
      setEditingTrip(null);
      setSearchMode('flight');
      setDepAirport('');
      setArrAirport('');
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
    setEditingTrip(null);
    setSearchMode('flight');
    setDepAirport('');
    setArrAirport('');
  };

  const handleEdit = (trip: Trip) => {
    setEditingTrip(trip);
    setHomeAddress(trip.homeAddress);
    setSelectedDate(new Date(trip.date));
    setView('add');
  };

  if (isAuthenticated === null || (isAuthenticated && needsOnboarding === null)) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col items-center justify-center p-6 font-sans">
        {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        <div className="w-full max-w-sm text-center">
          <div className="mb-8">
            <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-green-700 to-green-800 bg-clip-text text-transparent mb-2">Make My Flight</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Get notified when it&apos;s time to leave for your flight.</p>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => signInWithRedirect({ provider: 'Google' })}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all font-medium text-gray-700 dark:text-gray-200"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
            <button
              onClick={() => signInWithRedirect({ provider: 'Facebook' })}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-6 bg-[#1877F2] hover:bg-[#166FE5] rounded-xl shadow-sm hover:shadow-md transition-all font-medium text-white"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Continue with Facebook
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (needsOnboarding) {
    return (
      <Onboarding onComplete={() => {
        setNeedsOnboarding(false);
        setView('list');
      }} />
    );
  }

  return (
      <div className="app-container">
        {toast && (
            <Toast
                message={toast.msg}
                type={toast.type}
                onClose={() => setToast(null)}
            />
        )}

        <div
                  className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-6 flex flex-col items-center font-sans">

                <header
                    className="w-full max-w-md flex justify-between items-center mb-8 pb-4 border-b border-gray-100 dark:border-gray-800">
                  <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-green-700 to-green-800 bg-clip-text text-transparent">
                    Make My Flight
                  </h1>
                  <div className="flex gap-4 text-sm font-medium">
                    <button
                        onClick={() => setView('list')}
                        className={`${
                            view === 'list'
                                ? 'text-green-700 border-b-2 border-green-700'
                                : 'text-gray-500 hover:text-green-600 hover:border-b-2 hover:border-green-300'
                        } pb-1 transition-all cursor-pointer border-b-2 border-transparent`}
                    >
                      My Trips
                    </button>
                    <button
                        onClick={() => setView('profile')}
                        className={`${
                            view === 'profile'
                                ? 'text-green-700 border-b-2 border-green-700'
                                : 'text-gray-500 hover:text-green-600 hover:border-b-2 hover:border-green-300'
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
                      <Trips onBack={() => setView('add')} onEdit={handleEdit}/>
                  ) : view === 'profile' ? (
                      <Profile onBack={() => setView('list')}/>
                  ) : (
                      <>
                        {step === 'input' && (
                            <div className="animate-fade-in">
                              <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold">{editingTrip ? 'Edit Trip' : 'Track a New Flight'}</h2>
                                <button onClick={() => setView('list')}
                                        className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium rounded-lg transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>

                              <button
                                  type="button"
                                  onClick={async () => {
                    await loadUserProfile();
                    setShowCalendarImport(true);
                  }}
                                  className="w-full mb-4 py-2.5 px-4 border border-dashed border-green-600/50 hover:border-green-600 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Import from Google Calendar
                              </button>

                              <div className="relative my-6">
                                <div className="absolute inset-0 flex items-center">
                                  <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                                </div>
                                <div className="relative flex justify-center text-sm">
                                  <span className="px-2 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">or</span>
                                </div>
                              </div>

                              <form onSubmit={handleLookup} className="space-y-4">
                                <div>
                                  <label
                                      className="block text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
                                    Search By
                                  </label>
                                  <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSearchMode('flight')}
                                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                                            searchMode === 'flight'
                                                ? 'bg-green-700 text-white'
                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                      Flight Number
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSearchMode('route')}
                                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                                            searchMode === 'route'
                                                ? 'bg-green-700 text-white'
                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                      Airports
                                    </button>
                                  </div>
                                </div>

                                {searchMode === 'flight' ? (
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
                                            maxLength={8}
                                            defaultValue={editingTrip?.flightNumber}
                                            className="flex-1 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-green-600 transition-all outline-none uppercase font-medium"
                                        />

                                        <CustomDatePicker
                                            selected={selectedDate}
                                            onChange={(date) => setSelectedDate(date)}
                                            placeholder="Date (Opt)"
                                        />
                                      </div>
                                    </div>
                                ) : (
                                    <div>
                                      <label
                                          className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                                        Route Info
                                      </label>
                                      <div className="flex gap-2 mb-2">
                                        <input
                                            name="depAirport"
                                            placeholder="From (e.g. JFK)"
                                            required
                                            value={depAirport}
                                            onChange={(e) => setDepAirport(e.target.value.toUpperCase())}
                                            className="flex-1 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-green-600 transition-all outline-none uppercase font-medium"
                                        />
                                        <input
                                            name="arrAirport"
                                            placeholder="To (e.g. LAX)"
                                            required
                                            value={arrAirport}
                                            onChange={(e) => setArrAirport(e.target.value.toUpperCase())}
                                            className="flex-1 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-green-600 transition-all outline-none uppercase font-medium"
                                        />
                                      </div>
                                      <CustomDatePicker
                                          selected={selectedDate}
                                          onChange={(date) => setSelectedDate(date)}
                                          placeholder="Date (Required)"
                                          required
                                      />
                                    </div>
                                )}

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
                                      className="w-full p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-green-600 transition-all outline-none"
                                  />

                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-3.5 bg-green-700 hover:bg-green-800 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-green-600/30 transition-all disabled:opacity-70"
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
                                        className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium rounded-lg transition-colors"
                                >
                                  Back
                                </button>
                              </div>

                              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                                {searchResults.map((flight, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleSelectFlight(flight)}
                                        className="w-full text-left bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border-2 border-transparent hover:border-green-600 hover:bg-white dark:hover:bg-gray-700 transition-all shadow-sm group"
                                    >
                                      <div className="flex justify-between items-center mb-1">
                                        <span
                                            className="font-bold text-lg">{flight.flightNumber}</span>
                                        <span
                                            className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded-md">{flight.airline}</span>
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
                                    <p className="text-lg font-bold text-green-700">
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
                                        className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl font-medium transition-colors">Cancel
                                </button>
                                <button onClick={handleConfirm} disabled={loading}
                                        className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg transition-all">
                                  {loading ? 'Scheduling...' : (editingTrip ? 'Update Trip' : 'Track Flight')}
                                </button>
                              </div>
                            </div>
                        )}
                      </>
                  )}
                </main>
              </div>

        {showCalendarImport && (
            <CalendarImport
                onImport={handleCalendarImport}
                onClose={() => setShowCalendarImport(false)}
                homeAddress={homeAddress}
            />
        )}
      </div>
  );
}

export default App;
