import {useEffect, useState} from 'react';
import axios from 'axios';
import {Config} from './config';
import {fetchAuthSession} from 'aws-amplify/auth';

interface Trip {
  sk: string;
  flightNumber: string;
  date: string;
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
      const res = await axios.get(`${Config.API_URL}/trips`, {
        headers: {Authorization: `Bearer ${token}`}
      });

      const sortedTrips = res.data.sort((a: Trip, b: Trip) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateA - dateB;
      });
      setTrips(sortedTrips);
    } catch (err) {
      console.error(err);
      alert("Failed to load trips");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string, timezone?: string) => {
    // Parse the ISO string (handles +00:00 UTC format)
    const date = new Date(dateStr);

    // Use the timezone from the trip data
    const options: Intl.DateTimeFormatOptions = timezone
        ? {timeZone: timezone}
        : {};

    return {
      dayOfWeek: date.toLocaleDateString('en-US', {
        weekday: 'short',
        ...options
      }),
      monthDay: date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...options
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        ...options
      })
    };
  };

  return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">My Trips</h1>
          <button
              onClick={onBack}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Add New
          </button>
        </div>

        {loading ? (
            <div className="text-center text-gray-500 py-12">Loading flights...</div>
        ) : trips.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No upcoming trips found.</p>
              <button
                  onClick={onBack}
                  className="text-blue-600 hover:underline"
              >
                Track your first flight
              </button>
            </div>
        ) : (
            <div className="space-y-4">
              {trips.map((trip) => {
                const formatted = formatDate(trip.date);
                return (
                    <div
                        key={trip.sk}
                        className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h2 className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                            {trip.flightNumber}
                          </h2>
                          <p className="text-gray-600 dark:text-gray-400 text-lg mb-3">
                            TO {trip.airportCode}
                          </p>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            <p className="mb-1">Leaving from</p>
                            <p className="font-medium text-gray-700 dark:text-gray-300">
                              {trip.homeAddress}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-gray-900 dark:text-white">
                            {formatted.dayOfWeek}
                          </div>
                          <div className="text-gray-600 dark:text-gray-400">
                            {formatted.monthDay}
                          </div>
                          <div
                              className="text-lg font-semibold text-blue-600 dark:text-blue-400 mt-2">
                            {formatted.time}
                          </div>
                        </div>
                      </div>
                    </div>
                );
              })}
            </div>
        )}
      </div>
  );
}
