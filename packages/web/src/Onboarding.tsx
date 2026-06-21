import { useState, useEffect } from 'react';
import axios from 'axios';
import { Config } from './config';
import { fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';
import Toast, { type ToastType } from './Toast';
import AddressAutocomplete from './AddressAutocomplete';

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  
  const [homeAddress, setHomeAddress] = useState('');
  const [arrivalPreference, setArrivalPreference] = useState(2);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [email, setEmail] = useState('');
  const [emailFromAuth, setEmailFromAuth] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);

  const showToast = (msg: string, type: ToastType = 'success') => {
    setToast({ msg, type });
  };

  useEffect(() => {
    const loadUserEmail = async () => {
      try {
        const attributes = await fetchUserAttributes();
        if (attributes.email) {
          setEmail(attributes.email);
          setEmailFromAuth(true);
        }
      } catch (err) {
        console.error('Failed to fetch user attributes:', err);
      }
    };
    loadUserEmail();
  }, []);

  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.startsWith('1') && digits.length === 11) {
      return `+${digits}`;
    } else if (digits.length === 10) {
      return `+1${digits}`;
    }
    return value;
  };

  const handleSendVerification = async () => {
    if (!phoneNumber) {
      showToast('Please enter a phone number first', 'error');
      return;
    }

    setSendingCode(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      await axios.post(`${Config.API_URL}/profile/verify/send`,
        { phoneNumber },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setShowVerification(true);
      showToast('Verification code sent!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to send verification code', 'error');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      showToast('Please enter the 6-digit code', 'error');
      return;
    }

    setVerifying(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      await axios.post(`${Config.API_URL}/profile/verify/confirm`,
        { phoneNumber, code: verificationCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setPhoneVerified(true);
      setShowVerification(false);
      setVerificationCode('');
      showToast('Phone number verified!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Invalid verification code', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      await axios.put(`${Config.API_URL}/profile`, {
        homeAddress,
        arrivalPreference,
        phoneNumber,
        phoneVerified,
        email,
        emailEnabled,
        smsEnabled,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      showToast('Profile setup complete!', 'success');
      setTimeout(() => onComplete(), 1000);
    } catch (err) {
      console.error(err);
      showToast('Failed to save profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const arrivalOptions = [
    { value: 1, label: '1 hour before' },
    { value: 1.5, label: '1.5 hours before' },
    { value: 2, label: '2 hours before' },
    { value: 2.5, label: '2.5 hours before' },
    { value: 3, label: '3 hours before' },
  ];

  const totalSteps = emailFromAuth ? 4 : 5;
  const progressPercent = (step / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col items-center justify-center p-6 font-sans">
      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="w-full max-w-md">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-green-700 to-green-800 bg-clip-text text-transparent">
              Welcome to Make My Flight
            </h1>
            <span className="text-sm text-gray-500">Step {step} of {totalSteps}</span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-600 to-green-700 transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Step 1: Home Address */}
        {step === 1 && (
          <div className="animate-fade-in space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">What's your home address?</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                We'll use this as your default starting location when tracking flights.
              </p>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                Home Address
              </label>
              <AddressAutocomplete
                value={homeAddress}
                onChange={setHomeAddress}
                placeholder="123 Main St, Chicago, IL 60601"
                autoFocus
                required
              />
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!homeAddress.trim()}
              className="w-full py-3.5 bg-green-700 hover:bg-green-800 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-green-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Email (skip if from Google) */}
        {step === 2 && !emailFromAuth && (
          <div className="animate-fade-in space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">What's your email address?</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                We'll send you email notifications for your flights.
              </p>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                Email Address
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-green-600 transition-all outline-none"
                required
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!email.trim()}
                className="flex-1 py-3.5 bg-green-700 hover:bg-green-800 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-green-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Arrival Preference */}
        {step === (emailFromAuth ? 2 : 3) && (
          <div className="animate-fade-in space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">When do you like to arrive at the airport?</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                We'll calculate when you should leave based on this preference.
              </p>
            </div>
            <div className="space-y-2">
              {arrivalOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <input
                    type="radio"
                    name="arrivalPreference"
                    value={option.value}
                    checked={arrivalPreference === option.value}
                    onChange={(e) => setArrivalPreference(parseFloat(e.target.value))}
                    className="w-4 h-4 text-green-700 focus:ring-2 focus:ring-green-600"
                  />
                  <span className="ml-3 text-sm font-medium">{option.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(emailFromAuth ? 1 : 2)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(emailFromAuth ? 3 : 4)}
                className="flex-1 py-3.5 bg-green-700 hover:bg-green-800 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-green-600/30 transition-all"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Phone Number (Optional) */}
        {step === (emailFromAuth ? 3 : 4) && (
          <div className="animate-fade-in space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">Add your phone number <span className="text-gray-400 text-sm font-normal">(Optional)</span></h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Add a phone number to receive SMS notifications when it's time to leave for your flight.
              </p>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                Phone Number
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={phoneNumber}
                  onChange={(e) => {
                    const formatted = formatPhoneNumber(e.target.value);
                    setPhoneNumber(formatted);
                    setPhoneVerified(false);
                  }}
                  className="flex-1 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-green-600 transition-all outline-none"
                />
                {phoneVerified ? (
                  <div className="flex items-center px-4 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-lg text-sm font-semibold">
                    ✓ Verified
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendVerification}
                    disabled={sendingCode || !phoneNumber}
                    className="px-4 py-3 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {sendingCode ? 'Sending...' : 'Verify'}
                  </button>
                )}
              </div>

              {showVerification && !phoneVerified && (
                <div className="mt-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                    Enter the 6-digit code sent to {phoneNumber}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="123456"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      className="flex-1 p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-green-600 outline-none text-center text-lg font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyCode}
                      disabled={verifying || verificationCode.length !== 6}
                      className="px-4 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {verifying ? 'Verifying...' : 'Confirm'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendVerification}
                    disabled={sendingCode}
                    className="text-xs text-green-700 hover:text-green-800 mt-2"
                  >
                    Didn't receive it? Resend code
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(emailFromAuth ? 2 : 3)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(emailFromAuth ? 4 : 5)}
                className="flex-1 py-3.5 bg-green-700 hover:bg-green-800 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-green-600/30 transition-all"
              >
                {phoneNumber ? 'Continue' : 'Skip'}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Notification Preferences */}
        {step === (emailFromAuth ? 4 : 5) && (
          <div className="animate-fade-in space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">How would you like to be notified?</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Choose which notification methods you prefer.
              </p>
            </div>
            <div className="space-y-3">
              <label className="flex items-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                  className="w-4 h-4 text-green-600 focus:ring-2 focus:ring-green-500 rounded"
                />
                <div className="ml-3">
                  <span className="text-sm font-medium block">Email notifications</span>
                  <span className="text-xs text-gray-400">Receive alerts via email</span>
                </div>
              </label>
              <label className="flex items-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <input
                  type="checkbox"
                  checked={smsEnabled}
                  onChange={(e) => setSmsEnabled(e.target.checked)}
                  className="w-4 h-4 text-green-600 focus:ring-2 focus:ring-green-500 rounded"
                />
                <div className="ml-3">
                  <span className="text-sm font-medium block">SMS notifications</span>
                  <span className="text-xs text-gray-400">Receive alerts via text message</span>
                </div>
              </label>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(emailFromAuth ? 3 : 4)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleComplete}
                disabled={loading}
                className="flex-1 py-3.5 bg-green-700 hover:bg-green-800 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-green-600/30 transition-all disabled:opacity-70"
              >
                {loading ? 'Saving...' : 'Get Started'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
