declare namespace google.maps.places {
  interface PlaceAutocompleteElementOptions {
    includedPrimaryTypes?: string[];
    includedRegionCodes?: string[];
    locationBias?: any;
    locationRestriction?: any;
    name?: string;
    origin?: any;
    requestedLanguage?: string;
    requestedRegion?: string;
    unitSystem?: any;
    value?: string;
    internalUsageAttributionIds?: string[];
  }

  interface PlacePrediction {
    toPlace(): Place;
    text?: { text: string };
  }

  interface PlacePredictionSelectEvent extends Event {
    placePrediction: PlacePrediction;
  }

  interface FetchFieldsOptions {
    fields: string[];
  }

  class Place {
    id?: string;
    formattedAddress?: string;
    displayName?: string;
    location?: {
      lat(): number;
      lng(): number;
    };
    fetchFields(options: FetchFieldsOptions): Promise<void>;
  }

  class PlaceAutocompleteElement extends HTMLElement {
    constructor(options?: PlaceAutocompleteElementOptions);
    placeholder?: string;
    value?: string;
    includedRegionCodes?: string[];
    includedPrimaryTypes?: string[];
    focus(): void;
    blur(): void;
    addEventListener(
      type: 'gmp-select',
      listener: (event: PlacePredictionSelectEvent) => void,
      options?: boolean | AddEventListenerOptions
    ): void;
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ): void;
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions
    ): void;
  }

  class Autocomplete {
    constructor(
      inputField: HTMLInputElement,
      opts?: AutocompleteOptions
    );
    addListener(eventName: string, handler: () => void): void;
    getPlace(): PlaceResult;
  }

  interface AutocompleteOptions {
    types?: string[];
    componentRestrictions?: ComponentRestrictions;
  }

  interface ComponentRestrictions {
    country?: string | string[];
  }

  interface PlaceResult {
    formatted_address?: string;
    address_components?: AddressComponent[];
    geometry?: {
      location: {
        lat(): number;
        lng(): number;
      };
    };
  }

  interface AddressComponent {
    long_name: string;
    short_name: string;
    types: string[];
  }
}

declare namespace google.maps {
  function importLibrary(libraryName: 'places'): Promise<{
    PlaceAutocompleteElement: typeof google.maps.places.PlaceAutocompleteElement;
    Place: typeof google.maps.places.Place;
  }>;
  function importLibrary(libraryName: string): Promise<any>;
}

declare namespace google.maps.event {
  function clearInstanceListeners(instance: any): void;
}

interface Window {
  google: {
    maps: typeof google.maps;
  };
}
