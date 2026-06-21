import { useEffect, useState } from 'react';
import axios from 'axios';
import { Config } from './config';
import { fetchAuthSession } from 'aws-amplify/auth';
import Toast, { type ToastType } from './Toast';
import AddressAutocomplete from './AddressAutocomplete';

interface UserProfile {
  phoneNumber: string;
  phoneVerified: boolean;
  email: string;
  homeAddress: string;
  arrivalPreference: number;
  emailEnabled: boolean;
  smsEnabled: boolean;
}

interface ProfileProps {
  onBack: () => void;
}

export default function Profile({ onBack }: ProfileProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [profile, setProfile] = useState<UserProfile>({
    phoneNumber: '',
    phoneVerified: false,
    email: '',
    homeAddress: '',
    arrivalPreference: 2,
    emailEnabled: true,
    smsEnabled: false,
  });
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);

  const showToast = (msg: string, type: ToastType = 'success') => {
    setToast({ msg, type });
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      const res = await axios.get(`${Config.API_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data) {
        setProfile(res.data);
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        console.error(err);
        showToast('Failed to load profile', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      await axios.put(`${Config.API_URL}/profile`, profile, {
        headers: { Authorization: `Bearer ${token}` }
      });

      showToast('Profile saved successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSendVerification = async () => {
    if (!profile.phoneNumber) {
      showToast('Please enter a phone number first', 'error');
      return;
    }

    setSendingCode(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      await axios.post(`${Config.API_URL}/profile/verify/send`,
          { phoneNumber: profile.phoneNumber },
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

  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, '');

    // If starts with 1, use it, otherwise add +1
    if (digits.startsWith('1') && digits.length === 11) {
      return `+${digits}`;
    } else if (digits.length === 10) {
      return `+1${digits}`;
    }
    return value; // Return as-is if invalid
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
          { phoneNumber: profile.phoneNumber, code: verificationCode },
          { headers: { Authorization: `Bearer ${token}` } }
      );

      setProfile({ ...profile, phoneVerified: true });
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

  const arrivalOptions = [
    { value: 1, label: '1 hour before' },
    { value: 1.5, label: '1.5 hours before' },
    { value: 2, label: '2 hours before' },
    { value: 2.5, label: '2.5 hours before' },
    { value: 3, label: '3 hours before' },
  ];

  return (
      <div className="w-full max-w-md animate-fade-in">
        {toast && (
            <Toast
                message={toast.msg}
                type={toast.type}
                onClose={() => setToast(null)}
            />
        )}

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">My Profile</h2>
          <button onClick={onBack} className="text-green-700 hover:text-green-800 text-sm font-semibold">
            Back
          </button>
        </div>

        {loading ? (
            <div className="text-center py-10 text-gray-500">Loading profile...</div>
        ) : (
            <form onSubmit={handleSave} className="space-y-5">
              {/* Phone Number */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                  Phone Number
                </label>
                <div className="flex gap-2">
                  <input
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={profile.phoneNumber}
                      onChange={(e) => {
                        const formatted = formatPhoneNumber(e.target.value);
                        setProfile({ ...profile, phoneNumber: formatted, phoneVerified: false });
                      }}
                      className="flex-1 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-green-600 transition-all outline-none"
                  />
                  {profile.phoneVerified ? (
                      <div className="flex items-center px-4 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-lg text-sm font-semibold">
                        ✓ Verified
                      </div>
                  ) : (
                      <button
                          type="button"
                          onClick={handleSendVerification}
                          disabled={sendingCode || !profile.phoneNumber}
                          className="px-4 py-3 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {sendingCode ? 'Sending...' : 'Verify'}
                      </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">We'll send SMS notifications to this number</p>

                {/* Verification Code Input */}
                {showVerification && !profile.phoneVerified && (
                    <div className="mt-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                        Enter the 6-digit code sent to {profile.phoneNumber}
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

              {/* Email */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                  Email Address
                </label>
                <input
                    type="email"
                    placeholder="you@example.com"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                />
              </div>

              {/* Home Address */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                  Default Home Address
                </label>
                <AddressAutocomplete
                    value={profile.homeAddress}
                    onChange={(value) => setProfile({ ...profile, homeAddress: value })}
                    placeholder="123 Main St, Chicago, IL 60601"
                />
                <p className="text-xs text-gray-400 mt-1">This will be pre-filled when tracking flights</p>
              </div>

              {/* Arrival Preference */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
                  Airport Arrival Preference
                </label>
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
                            checked={profile.arrivalPreference === option.value}
                            onChange={(e) => setProfile({ ...profile, arrivalPreference: parseFloat(e.target.value) })}
                            className="w-4 h-4 text-green-700 focus:ring-2 focus:ring-green-600"
                        />
                        <span className="ml-3 text-sm font-medium">{option.label}</span>
                      </label>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">We'll notify you when it's time to leave</p>
              </div>

              {/* Notification Preferences */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 mb-3 font-semibold">
                  Notification Preferences
                </label>
                <div className="space-y-3">
                  <label className="flex items-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <input
                        type="checkbox"
                        checked={profile.emailEnabled}
                        onChange={(e) => setProfile({ ...profile, emailEnabled: e.target.checked })}
                        className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500 rounded"
                    />
                    <span className="ml-3 text-sm font-medium">Email notifications</span>
                  </label>
                  <label className="flex items-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <input
                        type="checkbox"
                        checked={profile.smsEnabled}
                        onChange={(e) => setProfile({ ...profile, smsEnabled: e.target.checked })}
                        className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500 rounded"
                    />
                    <span className="ml-3 text-sm font-medium">SMS notifications</span>
                  </label>
                </div>
                <p className="text-xs text-gray-400 mt-2">Choose how you want to receive departure alerts</p>
              </div>

              <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3.5 bg-green-700 hover:bg-green-800 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-green-600/30 transition-all disabled:opacity-70"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
        )}
      </div>
  );
}
