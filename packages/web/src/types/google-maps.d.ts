declare namespace google.maps.places {
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

declare namespace google.maps.event {
  function clearInstanceListeners(instance: any): void;
}

interface Window {
  google: {
    maps: typeof google.maps;
  };
}
