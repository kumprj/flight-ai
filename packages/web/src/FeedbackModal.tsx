import { useState, useEffect } from 'react';
import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Config } from './config';

export type FeedbackType = 'bug' | 'feature' | 'route' | 'general';

interface CurrentTripContext {
  flightNumber?: string;
  originAirport?: string;
  destinationAirport?: string;
  date?: string;
}

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string, issueUrl?: string) => void;
  currentTrip?: CurrentTripContext;
}

const TYPE_OPTIONS: Array<{ type: FeedbackType; label: string; icon: string }> = [
  { type: 'bug', label: 'Bug Report', icon: '🐛' },
  { type: 'feature', label: 'Idea / Feature', icon: '💡' },
  { type: 'route', label: 'Route / ETA', icon: '🚗' },
  { type: 'general', label: 'General', icon: '💬' },
];

export default function FeedbackModal({
  isOpen,
  onClose,
  onSuccess,
  currentTrip,
}: FeedbackModalProps) {
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [showDiagPreview, setShowDiagPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const diagnostics = {
    platform: navigator.platform || 'Web',
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    currentTrip,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) {
      setError('Title must be at least 3 characters long.');
      return;
    }
    if (description.trim().length < 5) {
      setError('Description must be at least 5 characters long.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      const payload = {
        type,
        title: title.trim(),
        description: description.trim(),
        diagnostics: includeDiagnostics ? diagnostics : undefined,
      };

      const res = await axios.post(`${Config.API_URL}/feedback`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const issueUrl = res.data?.issueUrl;
      const issueNumber = res.data?.issueNumber;

      const successMsg = issueNumber
        ? `Issue #${issueNumber} created! Thank you for your feedback.`
        : 'Feedback sent! Thank you for helping improve Make My Flight.';

      // Reset form
      setTitle('');
      setDescription('');
      setType('bug');
      onSuccess(successMsg, issueUrl);
      onClose();
    } catch (err: any) {
      console.error('Failed to submit feedback:', err);
      const errMsg =
        err.response?.data?.error ||
        err.message ||
        'Failed to submit feedback. Please try again.';
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden my-6 animate-fade-in transition-all">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start">
          <div>
            <h2 id="feedback-modal-title" className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              Send Feedback
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
              Suggestions & bug reports automatically sync to our GitHub tracker.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200/80 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs sm:text-sm">
              {error}
            </div>
          )}

          {/* Feedback Type Segmented Control */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
              Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setType(opt.type)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-medium border transition-all cursor-pointer select-none active:scale-95 ${
                    type === opt.type
                      ? 'bg-green-700 text-white border-green-700 shadow-sm font-semibold'
                      : 'bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 border-gray-200/80 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/60'
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Subject / Title */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Summary
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                type === 'bug'
                  ? 'e.g., Drive time to ORD was estimated too short'
                  : type === 'feature'
                  ? 'e.g., Support Southwest Airlines flight lookup'
                  : type === 'route'
                  ? 'e.g., Traffic delay was not reflected in notification'
                  : 'Brief summary of your feedback'
              }
              className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-green-600 focus:border-transparent text-sm outline-none transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Details
            </label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                type === 'bug'
                  ? 'What happened? What was expected? If applicable, mention the flight number, airport, or time.'
                  : 'Share any details, context, or ideas to help us understand.'
              }
              className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-green-600 focus:border-transparent text-sm outline-none transition-all resize-y"
            />
          </div>

          {/* Device & Context Diagnostics */}
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 border border-gray-200/70 dark:border-gray-700/60 text-xs">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeDiagnostics}
                onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                className="w-4 h-4 text-green-600 rounded focus:ring-green-500 cursor-pointer"
              />
              <span className="text-gray-700 dark:text-gray-300 font-medium">
                Include environment diagnostics (helps us reproduce and fix bugs)
              </span>
            </label>

            {includeDiagnostics && (
              <div className="mt-2 pl-6">
                <button
                  type="button"
                  onClick={() => setShowDiagPreview(!showDiagPreview)}
                  className="text-green-700 dark:text-green-400 hover:underline font-medium"
                >
                  {showDiagPreview ? 'Hide diagnostic details' : 'Preview diagnostic details'}
                </button>

                {showDiagPreview && (
                  <div className="mt-2 space-y-1 text-gray-500 dark:text-gray-400 font-mono text-[11px] bg-white dark:bg-gray-900 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div>Platform: {diagnostics.platform}</div>
                    <div>Viewport: {diagnostics.viewport}</div>
                    <div>Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
                    {currentTrip?.flightNumber && (
                      <div>
                        Trip: {currentTrip.flightNumber} ({currentTrip.originAirport} → {currentTrip.destinationAirport})
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl font-medium text-sm transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim() || !description.trim()}
              className="flex-1 py-3 px-4 bg-green-700 hover:bg-green-800 active:scale-[0.98] text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-green-700/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Submit Feedback</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
