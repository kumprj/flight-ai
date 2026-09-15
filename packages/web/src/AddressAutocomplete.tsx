import { useEffect, useRef, useState } from 'react';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  required?: boolean;
}

let googleMapsLoaded = false;
let loadingPromise: Promise<void> | null = null;

const loadGoogleMapsScript = (): Promise<void> => {
  if (googleMapsLoaded) {
    return Promise.resolve();
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = new Promise((resolve, reject) => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;

    if (!apiKey) {
      console.warn('Google Maps API key not found. Autocomplete will be disabled.');
      resolve();
      return;
    }

    if (window.google?.maps?.places?.PlaceAutocompleteElement) {
      googleMapsLoaded = true;
      resolve();
      return;
    }

    const onScriptLoaded = async () => {
      try {
        if (window.google?.maps?.importLibrary) {
          await window.google.maps.importLibrary('places');
        }
        googleMapsLoaded = true;
        resolve();
      } catch (err) {
        console.error('Failed to import Google Maps places library:', err);
        reject(err);
      }
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );
    if (existingScript) {
      if (window.google?.maps?.places?.PlaceAutocompleteElement) {
        googleMapsLoaded = true;
        resolve();
      } else {
        existingScript.addEventListener('load', () => {
          onScriptLoaded().catch(reject);
        });
        existingScript.addEventListener('error', () => {
          reject(new Error('Failed to load Google Maps script'));
        });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      onScriptLoaded().catch(reject);
    };

    script.onerror = () => {
      console.error('Failed to load Google Maps script');
      reject(new Error('Failed to load Google Maps'));
    };

    document.head.appendChild(script);
  });

  return loadingPromise;
};

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder = '123 Main St, Chicago, IL 60601',
  className = 'w-full p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-green-600 transition-all outline-none',
  autoFocus = false,
  required = false,
}: AddressAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [isLoaded, setIsLoaded] = useState(
    googleMapsLoaded && typeof window !== 'undefined' && !!window.google?.maps?.places?.PlaceAutocompleteElement
  );

  useEffect(() => {
    loadGoogleMapsScript()
      .then(() => {
        setIsLoaded(true);
      })
      .catch((err) => {
        console.error('Google Maps loading error:', err);
      });
  }, []);

  const hasPlaceAutocomplete =
    isLoaded &&
    typeof window !== 'undefined' &&
    !!window.google?.maps?.places?.PlaceAutocompleteElement;

  useEffect(() => {
    if (!hasPlaceAutocomplete || !containerRef.current) {
      return;
    }

    const container = containerRef.current;
    container.innerHTML = '';

    const autocomplete = new window.google.maps.places.PlaceAutocompleteElement({
      includedRegionCodes: ['us'],
      internalUsageAttributionIds: ['gmp_git_agentskills_v1'],
    });

    autocompleteRef.current = autocomplete;
    autocomplete.className = 'w-full';
    autocomplete.style.width = '100%';
    autocomplete.style.display = 'block';

    if (placeholder) {
      autocomplete.setAttribute('placeholder', placeholder);
    }
    if (value) {
      autocomplete.value = value;
    }

    const handleSelect = async (event: any) => {
      try {
        const place = event.placePrediction?.toPlace();
        if (place) {
          await place.fetchFields({
            fields: ['formattedAddress', 'displayName'],
          });
          const selectedAddress = place.formattedAddress || place.displayName;
          if (selectedAddress) {
            onChangeRef.current(selectedAddress);
          }
        }
      } catch (err) {
        console.error('Error fetching place details:', err);
      }
    };

    const handleInput = (event: Event) => {
      const target = event.target as HTMLElement & { value?: string };
      const currentVal = autocomplete.value ?? target?.value ?? '';
      onChangeRef.current(currentVal);
    };

    autocomplete.addEventListener('gmp-select', handleSelect as EventListener);
    autocomplete.addEventListener('input', handleInput);

    container.appendChild(autocomplete);

    if (autoFocus) {
      setTimeout(() => {
        autocomplete.focus();
      }, 0);
    }

    return () => {
      autocomplete.removeEventListener('gmp-select', handleSelect as EventListener);
      autocomplete.removeEventListener('input', handleInput);
      if (container.contains(autocomplete)) {
        container.removeChild(autocomplete);
      }
      autocompleteRef.current = null;
    };
  }, [hasPlaceAutocomplete]);

  useEffect(() => {
    if (autocompleteRef.current && value !== undefined) {
      if (autocompleteRef.current.value !== value) {
        autocompleteRef.current.value = value;
      }
    }
  }, [value]);

  useEffect(() => {
    if (autocompleteRef.current) {
      if (placeholder) {
        autocompleteRef.current.setAttribute('placeholder', placeholder);
      } else {
        autocompleteRef.current.removeAttribute('placeholder');
      }
    }
  }, [placeholder]);

  if (!hasPlaceAutocomplete) {
    return (
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        autoFocus={autoFocus}
        required={required}
        autoComplete="off"
      />
    );
  }

  return (
    <div className="w-full relative">
      <div ref={containerRef} className="w-full" />
      {required && (
        <input
          type="text"
          value={value}
          onChange={() => {}}
          required={required}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
