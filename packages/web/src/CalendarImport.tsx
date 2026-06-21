import { useState } from 'react';
import { scanCalendarForFlights, type CalendarFlight } from './utils/googleCalendar';

interface Props {
  onImport: (flights: CalendarFlight[], address: string) => Promise<void>;
  onClose: () => void;
  homeAddress?: string;
}

export default function CalendarImport({ onImport, onClose, homeAddress = '' }: Props) {
  const [state, setState] = useState<'idle' | 'scanning' | 'results' | 'error'>('idle');
  const [flights, setFlights] = useState<CalendarFlight[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);

  const getAddress = (key: string) => addresses[key] ?? homeAddress;
  const setAddress = (key: string, val: string) =>
    setAddresses((prev) => ({ ...prev, [key]: val }));

  const scan = async () => {
    setState('scanning');
    try {
      const found = await scanCalendarForFlights();
      setFlights(found);
      setSelected(new Set(found.map((f) => `${f.flightNumber}::${f.date}`)));
      setState('results');
    } catch (e: any) {
      setError(e.message ?? 'Failed to scan calendar');
      setState('error');
    }
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleImport = async () => {
    const toImport = flights
      .filter((f) => selected.has(`${f.flightNumber}::${f.date}`))
      .map((f) => ({ ...f, address: getAddress(`${f.flightNumber}::${f.date}`) }));
    setImporting(true);
    try {
      await onImport(toImport, '');
    } finally {
      setImporting(false);
    }
  };

  const allAddressesFilled = flights
    .filter((f) => selected.has(`${f.flightNumber}::${f.date}`))
    .every((f) => getAddress(`${f.flightNumber}::${f.date}`).trim() !== '');

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md relative">
        {importing && (
          <div className="absolute inset-0 bg-white/70 dark:bg-gray-900/70 rounded-2xl z-10 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Importing flights…</p>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/>
            </svg>
            <h2 className="font-semibold text-gray-900 dark:text-white">Import from Google Calendar</h2>
          </div>
          <button onClick={onClose} disabled={importing} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {state === 'idle' && (
            <div className="text-center py-4">
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">
                Scan your Google Calendar for events containing flight numbers over the next 12 months.
              </p>
              <button
                onClick={scan}
                className="w-full py-3 px-4 bg-green-700 hover:bg-green-800 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Connect & Scan Calendar
              </button>
            </div>
          )}

          {state === 'scanning' && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">Scanning your calendar…</p>
            </div>
          )}

          {state === 'error' && (
            <div className="text-center py-4">
              <p className="text-red-500 text-sm mb-4">{error}</p>
              <button
                onClick={() => setState('idle')}
                className="text-green-600 hover:text-green-700 text-sm font-medium"
              >
                Try again
              </button>
            </div>
          )}

          {state === 'results' && (
            <>
              {flights.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    No flight numbers found in your calendar events for the next 12 months.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Found {flights.length} flight{flights.length !== 1 ? 's' : ''}. Select which to import:
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                    {flights.map((flight) => {
                      const key = `${flight.flightNumber}::${flight.date}`;
                      const isSelected = selected.has(key);
                      return (
                        <div
                          key={key}
                          className={`p-3 rounded-xl transition-colors ${
                            isSelected
                              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                              : 'bg-gray-50 dark:bg-gray-800 border border-transparent'
                          }`}
                        >
                          <label className="flex items-center gap-3 cursor-pointer mb-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggle(key)}
                              className="accent-green-600 w-4 h-4 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-white text-sm">
                                {flight.flightNumber}
                                {flight.route && (
                                  <span className="ml-2 text-gray-500 dark:text-gray-400 font-normal">
                                    {flight.route.from} → {flight.route.to}
                                  </span>
                                )}
                                <span className="ml-2 text-green-700 dark:text-green-400 font-medium">
                                  {new Date(flight.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                              </p>
                              <p className="text-xs text-gray-400 truncate">{flight.eventTitle}</p>
                            </div>
                          </label>
                          {isSelected && (
                            <div className="mt-2">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Starting address</p>
                              <input
                                type="text"
                                value={getAddress(key)}
                                onChange={(e) => setAddress(key, e.target.value)}
                                placeholder="e.g. 123 Main St, Chicago, IL"
                                className="w-full p-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-green-600 outline-none text-xs transition-all"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={handleImport}
                    disabled={selected.size === 0 || !allAddressesFilled}
                    className="w-full py-3 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-medium rounded-xl transition-colors"
                  >
                    Import {selected.size} Flight{selected.size !== 1 ? 's' : ''}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
