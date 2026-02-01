import {useEffect, useState} from 'react';
import axios from 'axios';
import {Config} from './config';
import {fetchAuthSession} from 'aws-amplify/auth';

interface Trip {
  sk: string; // The ID "TRIP#2026-05-20#AA123"
  flightNumber: string;
  date: string; // "2026-05-20T14:30"
  airportCode: string;
  homeAddress: string;
}

export default function Trips({onBack}: { onBack: () => void }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      // console.log("Using Token:", token);

      const res = await axios.get(`${Config.API_URL}/trips`, {
        headers: {
          Authorization: `Bearer ${token}` // <--- ADD "Bearer "
        }
      });

      setTrips(res.data);
    } catch (err) {
      console.error(err);
      alert('Failed to load trips');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  };

  return (
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">My Trips</h2>
          <button onClick={onBack}
                  className="text-blue-500 hover:text-blue-600 text-sm font-semibold">
            + Add New
          </button>
        </div>

        {loading ? (
            <div className="text-center py-10 text-gray-500">Loading flights...</div>
        ) : trips.length === 0 ? (
            <div className="text-center py-10 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p>No upcoming trips found.</p>
              <button onClick={onBack}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
                Track your first flight
              </button>
            </div>
        ) : (
            <div className="space-y-4">
              {trips.map((trip) => (
                  <div key={trip.sk}
                       className="bg-gray-100 dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400">{trip.flightNumber}</h3>
                        <p className="text-xs text-gray-500 font-mono mt-1">TO {trip.airportCode}</p>
                      </div>
                      <div className="text-right">
                        <div
                            className="text-lg font-semibold">{formatDate(trip.date).split(',')[0]}</div>
                        <div
                            className="text-sm text-gray-500">{formatDate(trip.date).split(', ')[1]}</div>
                      </div>
                    </div>

                    <div
                        className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center text-sm">
                      <span className="text-gray-500">Leaving from</span>
                      <span className="truncate max-w-[150px] font-medium"
                            title={trip.homeAddress}>{trip.homeAddress}</span>
                    </div>
                  </div>
              ))}
            </div>
        )}
      </div>
  );
}
