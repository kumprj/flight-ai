import {Authenticator} from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import axios from 'axios';
import {Config} from './config';
import {fetchAuthSession} from 'aws-amplify/auth';
import Trips from './Trips';
import {useState} from 'react';
import Toast, {type ToastType} from './Toast';


interface FlightData {
  flightNumber: string;
  date: string;
  departureTime: string;
  origin: string;
  destination: string;
}

function App() {
  const [view, setView] = useState<'add' | 'list'>('list'); // Default to list view
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [flightData, setFlightData] = useState<FlightData | null>(null);
  const [address, setAddress] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const showToast = (msg: string, type: ToastType = 'success') => {
    setToast({msg, type});
  };
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.target as HTMLFormElement);

    // Simulate API delay
    await new Promise(r => setTimeout(r, 800));

    setFlightData({
      flightNumber: form.get('flightNumber') as string,
      date: form.get('date') as string,
      departureTime: "14:30",
      origin: "ORD",
      destination: "LHR"
    });
    setAddress(form.get('homeAddress') as string);
    setStep('confirm');
    setLoading(false);
  };

  const handleConfirm = async (user: any) => {
    setLoading(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      const fullDateTime = `${flightData?.date}T${flightData?.departureTime}`;

      await axios.post(`${Config.API_URL}/trips`, {
        userId: user.signInDetails?.loginId || user.username,
        flightNumber: flightData?.flightNumber,
        date: fullDateTime,
        airportCode: flightData?.origin,
        homeAddress: address
      }, {
        headers: {Authorization: `Bearer ${token}`}
      });

      showToast("Trip tracked successfully!", "success");
      setStep('input');
      setFlightData(null);
      setView('list'); // Go back to list after adding
    } catch (err) {
      console.error(err);
      showToast("Failed to save trip. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="app-container ...">
        {/* 4. Render the Toast at the top level */}
        {toast && (
            <Toast
                message={toast.msg}
                type={toast.type}
                onClose={() => setToast(null)}
            />
        )}
        <Authenticator socialProviders={['google']}>
          {({signOut, user}) => (
              <div
                  className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-6 flex flex-col items-center font-sans">

                <header
                    className="w-full max-w-md flex justify-between items-center mb-8 pb-4 border-b border-gray-100 dark:border-gray-800">
                  <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    Flight AI
                  </h1>
                  <div className="flex gap-4 text-sm font-medium">
                    <button onClick={() => setView('list')}
                            className={`${view === 'list' ? 'text-blue-600' : 'text-gray-500'}`}>My
                      Trips
                    </button>
                    <button onClick={signOut} className="text-gray-400 hover:text-red-500">Sign Out
                    </button>
                  </div>
                </header>

                <main className="w-full max-w-md">
                  {view === 'list' ? (
                      <Trips onBack={() => setView('add')}/>
                  ) : (
                      // --- ADD TRIP VIEW ---
                      step === 'input' ? (
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
                                    className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">Flight
                                  Info</label>
                                <div className="flex gap-2">
                                  <input name="flightNumber" placeholder="AA123" required
                                         className="flex-1 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-blue-500 transition-all outline-none"/>
                                  <input name="date" type="date" required
                                         className="w-1/3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-blue-500 transition-all outline-none"/>
                                </div>
                              </div>

                              <div>
                                <label
                                    className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">Start
                                  Location</label>
                                <input name="homeAddress" placeholder="123 Main St, Chicago..."
                                       required
                                       className="w-full p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-blue-500 transition-all outline-none"/>
                              </div>

                              <button type="submit" disabled={loading}
                                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 transition-all">
                                {loading ? 'Searching...' : 'Find Flight'}
                              </button>
                            </form>
                          </div>
                      ) : (
                          // --- CONFIRM VIEW ---
                          <div
                              className="bg-gray-50 dark:bg-gray-800 p-6 rounded-2xl shadow-xl space-y-6 animate-fade-in border border-gray-100 dark:border-gray-700">
                            <h2 className="text-xl font-bold text-center">Confirm Trip Details</h2>

                            <div className="space-y-4">
                              <div
                                  className="flex items-center justify-between p-4 bg-white dark:bg-gray-700/50 rounded-xl">
                                <div>
                                  <p className="text-xs text-gray-500 uppercase">Flight</p>
                                  <p className="text-xl font-bold">{flightData?.flightNumber}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-gray-500 uppercase">Departing</p>
                                  <p className="text-xl font-bold text-blue-500">{flightData?.departureTime}</p>
                                </div>
                              </div>

                              <div
                                  className="p-4 bg-white dark:bg-gray-700/50 rounded-xl flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                                <div className="flex-1">
                                  <p className="text-xs text-gray-500 uppercase">Route</p>
                                  <p className="font-medium">{flightData?.origin} ➝ {flightData?.destination}</p>
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                              <button onClick={() => setStep('input')}
                                      className="flex-1 py-3 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl font-medium transition-colors">
                                Cancel
                              </button>
                              <button onClick={() => handleConfirm(user)} disabled={loading}
                                      className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-500/20 transition-all active:scale-[0.98]">
                                {loading ? 'Scheduling...' : 'Track Flight'}
                              </button>
                            </div>
                          </div>
                      )
                  )}
                </main>
              </div>
          )}
        </Authenticator>
      </div>
  );
}

export default App;
