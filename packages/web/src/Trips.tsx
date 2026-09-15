import {useEffect, useState} from 'react';
import axios from 'axios';
import {Config} from './config';
import {fetchAuthSession} from 'aws-amplify/auth';
import Toast, { type ToastType } from './Toast';

interface Trip {
  sk: string;
  flightNumber: string;
  date: string;
  arrivalTime?: string;
  revisedArrivalTime?: string;
  originAirport: string;
  destinationAirport: string;
  homeAddress: string;
  status?: string;
  revisedDate?: string;
  delayMinutes?: number;
  createdAt?: number;
}

interface TransitStep {
  instruction?: string;
  stopName?: string;
  departureStop?: string;
  arrivalStop?: string;
  vehicleType?: string | { text?: string };
  numStops?: number;
  distanceMeters?: number;
  durationSeconds?: number;
  transitLine?: string;
  lineShortName?: string;
}

interface TravelTimeData {
  durationText: string;
  durationSeconds: number;
  transit?: {
    durationText: string;
    durationSeconds: number;
    transitLine?: string;
    transitAgency?: string;
    transitSteps?: TransitStep[];
  };
  ctaAlerts?: any[];
  mtaAlerts?: any[];
  stationInfo?: { agency?: string; line?: string; fareDescription?: string };
}

export default function Trips({onBack, onEdit}: { onBack: () => void; onEdit: (trip: Trip) => void }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [testNotifying, setTestNotifying] = useState<string | null>(null);
  const [travelTimes, setTravelTimes] = useState<Record<string, TravelTimeData>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const [expandedTrip, setExpandedTrip] = useState<Trip | null>(null);

  const showToast = (msg: string, type: ToastType = 'success') => setToast({ msg, type });

  useEffect(() => {
    loadTrips();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expandedTrip) {
        setExpandedTrip(null);
      }
    };
    if (expandedTrip) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [expandedTrip]);

  const isOldTrip = (dateStr: string) => {
    const tripDate = new Date(dateStr);
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    return tripDate < twoDaysAgo;
  };

  const loadTrips = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      const res = await axios.get(`${Config.API_URL}/trips`, {
        headers: {Authorization: `Bearer ${token}`}
      });

      const activeTrips: Trip[] = [];
      const pastTrips: Trip[] = [];

      (res.data || []).forEach((trip: Trip) => {
        const effectiveDate = trip.revisedDate || trip.date;
        if (isOldTrip(effectiveDate)) {
          pastTrips.push(trip);
        } else {
          activeTrips.push(trip);
        }
      });

      // Active flights: sort by soonest date first (next flight as first tile)
      activeTrips.sort((a, b) => {
        const timeA = new Date(a.revisedDate || a.date).getTime();
        const timeB = new Date(b.revisedDate || b.date).getTime();
        return timeA - timeB;
      });

      // Past flights: leave sorted order as is (most recent past flight first)
      pastTrips.sort((a, b) => {
        const timeA = new Date(a.revisedDate || a.date).getTime();
        const timeB = new Date(b.revisedDate || b.date).getTime();
        return timeB - timeA;
      });

      const sortedTrips = [...activeTrips, ...pastTrips];
      setTrips(sortedTrips);

      // Load travel times for each trip
      loadTravelTimes(sortedTrips);
    } catch (err) {
      console.error(err);
      showToast("Failed to load trips", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadTravelTimes = async (trips: Trip[]) => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      const travelTimePromises = trips.filter(trip => !isOldTrip(trip.revisedDate || trip.date)).map(async (trip) => {
        try {
          const res = await axios.post(`${Config.API_URL}/trips/travel-time`, {
            homeAddress: trip.homeAddress,
            airportCode: trip.originAirport
          }, {
            headers: {Authorization: `Bearer ${token}`}
          });
          return { tripId: trip.sk, data: res.data };
        } catch (err) {
          console.error(`Failed to get travel time for trip ${trip.sk}:`, err);
          return { tripId: trip.sk, data: null };
        }
      });

      const results = await Promise.all(travelTimePromises);

      const travelTimesMap: Record<string, TravelTimeData> = {};
      results.forEach(({ tripId, data }) => {
        if (data) {
          travelTimesMap[tripId] = data;
        }
      });

      setTravelTimes(travelTimesMap);
    } catch (err) {
      console.error("Failed to load travel times:", err);
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

  const getArrivalFormatted = (trip: Trip) => {
    const arrivalStr = trip.revisedArrivalTime || trip.arrivalTime;
    if (arrivalStr) {
      return formatDate(arrivalStr);
    }
    // Fallback: estimate arrival from departure time + typical flight duration (~2h 15m)
    const depDate = new Date(trip.revisedDate || trip.date);
    if (isNaN(depDate.getTime())) {
      return { dayOfWeek: '', monthDay: '', time: '--:--' };
    }
    const estimatedDate = new Date(depDate.getTime() + 135 * 60 * 1000);
    return formatDate(estimatedDate.toISOString());
  };

  const handleTestNotify = async (trip: Trip) => {
    setTestNotifying(trip.sk);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      await axios.post(`${Config.API_URL}/trips/test-notify`, { tripId: trip.sk }, {
        headers: {Authorization: `Bearer ${token}`}
      });
      alert("Test notification sent! Check your email.");
    } catch (err) {
      console.error(err);
      showToast("Failed to send test notification.", "error");
    } finally {
      setTestNotifying(null);
    }
  };

  const handleDelete = async (trip: Trip) => {
    setConfirmDeleteId(null);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      await axios.delete(`${Config.API_URL}/trips`, {
        data: { tripId: trip.sk },
        headers: {Authorization: `Bearer ${token}`}
      });
      showToast(`${trip.flightNumber} removed.`);
      if (expandedTrip?.sk === trip.sk) {
        setExpandedTrip(null);
      }
      loadTrips();
    } catch (err) {
      console.error(err);
      showToast("Failed to delete trip.", "error");
    }
  };

  const getAirportCity = (airportCode: string): string => {
    const airportMap: Record<string, string> = {
      // United States
      'ATL': 'Atlanta, GA',
      'LAX': 'Los Angeles, CA',
      'ORD': 'Chicago, IL',
      'DFW': 'Dallas, TX',
      'DEN': 'Denver, CO',
      'JFK': 'New York, NY',
      'SFO': 'San Francisco, CA',
      'SEA': 'Seattle, WA',
      'MIA': 'Miami, FL',
      'EWR': 'Newark, NJ',
      'BOS': 'Boston, MA',
      'PHL': 'Philadelphia, PA',
      'PHX': 'Phoenix, AZ',
      'IAH': 'Houston, TX',
      'MSP': 'Minneapolis, MN',
      'DTW': 'Detroit, MI',
      'CLT': 'Charlotte, NC',
      'LAS': 'Las Vegas, NV',
      'LGA': 'New York, NY',
      'FLL': 'Fort Lauderdale, FL',
      'SAN': 'San Diego, CA',
      'IAD': 'Washington, DC',
      'TPA': 'Tampa, FL',
      'MDW': 'Chicago, IL',
      'BWI': 'Baltimore, MD',
      'SLC': 'Salt Lake City, UT',
      'HNL': 'Honolulu, HI',
      'PDX': 'Portland, OR',
      'MCO': 'Orlando, FL',
      'DCA': 'Washington, DC',
      'STL': 'St. Louis, MO',
      'BNA': 'Nashville, TN',
      'AUS': 'Austin, TX',
      'SJU': 'San Juan, PR',
      'SJC': 'San Jose, CA',
      'OAK': 'Oakland, CA',
      'SMF': 'Sacramento, CA',
      'SNA': 'Orange County, CA',
      'MCI': 'Kansas City, MO',
      'RDU': 'Raleigh, NC',
      'CLE': 'Cleveland, OH',
      'IND': 'Indianapolis, IN',
      'PIT': 'Pittsburgh, PA',
      'CMH': 'Columbus, OH',
      'CVG': 'Cincinnati, OH',
      'BDL': 'Hartford, CT',
      'PBI': 'West Palm Beach, FL',
      'RSW': 'Fort Myers, FL',
      'JAX': 'Jacksonville, FL',
      'OKC': 'Oklahoma City, OK',
      'ABQ': 'Albuquerque, NM',
      'OMA': 'Omaha, NE',
      'BUR': 'Burbank, CA',
      'SDF': 'Louisville, KY',
      'HOU': 'Houston, TX',
      'DAL': 'Dallas, TX',
      'SAT': 'San Antonio, TX',
      'MSY': 'New Orleans, LA',
      'RNO': 'Reno, NV',
      'PVD': 'Providence, RI',
      'MEM': 'Memphis, TN',
      'ALB': 'Albany, NY',
      'TUS': 'Tucson, AZ',
      'ELP': 'El Paso, TX',
      'ONT': 'Ontario, CA',
      'MKE': 'Milwaukee, WI',
      'BUF': 'Buffalo, NY',
      'ROC': 'Rochester, NY',
      'RIC': 'Richmond, VA',
      'GSO': 'Greensboro, NC',
      'PNS': 'Pensacola, FL',
      'ORF': 'Norfolk, VA',
      'CHS': 'Charleston, SC',
      'SAV': 'Savannah, GA',
      'MYR': 'Myrtle Beach, SC',
      'PSP': 'Palm Springs, CA',
      'LGB': 'Long Beach, CA',
      'ISP': 'Islip, NY',
      'HPN': 'White Plains, NY',
      'SWF': 'Newburgh, NY',
      'ALO': 'Waterloo, IA',
      'DSM': 'Des Moines, IA',
      'CID': 'Cedar Rapids, IA',
      'MLI': 'Moline, IL',
      'PIA': 'Peoria, IL',
      'SPI': 'Springfield, IL',
      'DEC': 'Decatur, IL',
      'BMI': 'Bloomington, IL',
      'CMI': 'Champaign, IL',
      'EVV': 'Evansville, IN',
      'FWA': 'Fort Wayne, IN',
      'SBN': 'South Bend, IN',
      'TOL': 'Toledo, OH',
      'DAY': 'Dayton, OH',
      'CAK': 'Akron, OH',
      'LAN': 'Lansing, MI',
      'GRR': 'Grand Rapids, MI',
      'MBS': 'Saginaw, MI',
      'PLN': 'Pellston, MI',
      'ESC': 'Escanaba, MI',
      'MQT': 'Marquette, MI',
      'IMT': 'Iron Mountain, MI',
      'AZO': 'Kalamazoo, MI',
      'BTL': 'Battle Creek, MI',
      'FNT': 'Flint, MI',
      'DET': 'Detroit, MI',
      'MKG': 'Muskegon, MI',
      'TVC': 'Traverse City, MI',
      'JLN': 'Joplin, MO',
      'COU': 'Columbia, MO',
      'SGF': 'Springfield, MO',
      'TBN': 'Branson, MO',
      'MSN': 'Madison, WI',
      'GRB': 'Green Bay, WI',
      'EAU': 'Eau Claire, WI',
      'LSE': 'La Crosse, WI',
      'CWA': 'Wausau, WI',
      'RST': 'Rochester, MN',
      'DLH': 'Duluth, MN',
      'BRD': 'Brainerd, MN',
      'INL': 'International Falls, MN',
      'FAR': 'Fargo, ND',
      'BIS': 'Bismarck, ND',
      'MOT': 'Minot, ND',
      'RAP': 'Rapid City, SD',
      'PIR': 'Pierre, SD',
      'FSD': 'Sioux Falls, SD',
      'ABR': 'Aberdeen, SD',
      'LNK': 'Lincoln, NE',
      'GRI': 'Grand Island, NE',
      'LBF': 'North Platte, NE',
      'CPR': 'Casper, WY',
      'JAC': 'Jackson Hole, WY',
      'BIL': 'Billings, MT',
      'GTF': 'Great Falls, MT',
      'MSO': 'Missoula, MT',
      'BOI': 'Boise, ID',
      'PIH': 'Pocatello, ID',
      'SUN': 'Hailey, ID',
      'GEG': 'Spokane, WA',
      'PSC': 'Pasco, WA',
      'ALW': 'Walla Walla, WA',
      'EAT': 'Wenatchee, WA',
      'YKM': 'Yakima, WA',
      'EUG': 'Eugene, OR',
      'MFR': 'Medford, OR',
      'RDM': 'Redmond, OR',
      'LMT': 'Klamath Falls, OR',
      'FAT': 'Fresno, CA',
      'BFL': 'Bakersfield, CA',
      'SBA': 'Santa Barbara, CA',
      'SMX': 'Santa Maria, CA',
      'MRY': 'Monterey, CA',
      'MAF': 'Midland, TX',
      'LBB': 'Lubbock, TX',
      'AMA': 'Amarillo, TX',
      'BTR': 'Baton Rouge, LA',
      'LFT': 'Lafayette, LA',
      'SHV': 'Shreveport, LA',
      'LIT': 'Little Rock, AR',
      'XNA': 'Fayetteville, AR',
      'TUL': 'Tulsa, OK',
      'ICT': 'Wichita, KS',
      'CHA': 'Chattanooga, TN',
      'TYS': 'Knoxville, TN',
      'TRI': 'Bristol, TN',
      'AVL': 'Asheville, NC',
      'CAE': 'Columbia, SC',
      'GSP': 'Greenville, SC',
      'VPS': 'Destin, FL',
      'TLH': 'Tallahassee, FL',
      'EYW': 'Key West, FL',
      'BQN': 'Aguadilla, PR',
      'SDQ': 'Santo Domingo, Dominican Republic',
      'PUJ': 'Punta Cana, Dominican Republic',
      'CUN': 'Cancun, Mexico',
      'SJD': 'San Jose del Cabo, Mexico',
      'MEX': 'Mexico City, Mexico',
      'PVR': 'Puerto Vallarta, Mexico',
      'GDL': 'Guadalajara, Mexico',
      'MTY': 'Monterrey, Mexico',
      
      // Canada
      'YYZ': 'Toronto, Canada',
      'YVR': 'Vancouver, Canada',
      'YUL': 'Montreal, Canada',
      'YYC': 'Calgary, Canada',
      'YEG': 'Edmonton, Canada',
      'YOW': 'Ottawa, Canada',
      'YWG': 'Winnipeg, Canada',
      'YXE': 'Saskatoon, Canada',
      'YQR': 'Regina, Canada',
      'YHZ': 'Halifax, Canada',
      'YQB': 'Quebec City, Canada',
      'YKA': 'Kamloops, Canada',
      'YYJ': 'Victoria, Canada',
      'YXS': 'Prince George, Canada',
      'YXY': 'Whitehorse, Canada',
      'YZF': 'Yellowknife, Canada',
      'YFB': 'Iqaluit, Canada',
      
      // Europe
      'LHR': 'London, UK',
      'LGW': 'London, UK',
      'STN': 'London, UK',
      'LTN': 'London, UK',
      'MAN': 'Manchester, UK',
      'BHX': 'Birmingham, UK',
      'EDI': 'Edinburgh, UK',
      'GLA': 'Glasgow, UK',
      'BFS': 'Belfast, UK',
      'DUB': 'Dublin, Ireland',
      'SNN': 'Shannon, Ireland',
      'CDG': 'Paris, France',
      'ORY': 'Paris, France',
      'NCE': 'Nice, France',
      'LYS': 'Lyon, France',
      'MRS': 'Marseille, France',
      'TLS': 'Toulouse, France',
      'FRA': 'Frankfurt, Germany',
      'MUC': 'Munich, Germany',
      'DUS': 'Dusseldorf, Germany',
      'HAM': 'Hamburg, Germany',
      'BER': 'Berlin, Germany',
      'CGN': 'Cologne, Germany',
      'STR': 'Stuttgart, Germany',
      'AMS': 'Amsterdam, Netherlands',
      'BRU': 'Brussels, Belgium',
      'ZRH': 'Zurich, Switzerland',
      'GVA': 'Geneva, Switzerland',
      'BSL': 'Basel, Switzerland',
      'VIE': 'Vienna, Austria',
      'MXP': 'Milan, Italy',
      'FCO': 'Rome, Italy',
      'VCE': 'Venice, Italy',
      'NAP': 'Naples, Italy',
      'FLR': 'Florence, Italy',
      'BLQ': 'Bologna, Italy',
      'MAD': 'Madrid, Spain',
      'BCN': 'Barcelona, Spain',
      'AGP': 'Malaga, Spain',
      'PMI': 'Palma de Mallorca, Spain',
      'LIS': 'Lisbon, Portugal',
      'OPO': 'Porto, Portugal',
      'CPH': 'Copenhagen, Denmark',
      'ARN': 'Stockholm, Sweden',
      'OSL': 'Oslo, Norway',
      'HEL': 'Helsinki, Finland',
      'LED': 'St. Petersburg, Russia',
      'SVO': 'Moscow, Russia',
      'WAW': 'Warsaw, Poland',
      'PRG': 'Prague, Czech Republic',
      'BUD': 'Budapest, Hungary',
      'ATH': 'Athens, Greece',
      'IST': 'Istanbul, Turkey',
      'SAW': 'Istanbul, Turkey',
      'ESB': 'Ankara, Turkey',
      'OTP': 'Bucharest, Romania',
      'SOF': 'Sofia, Bulgaria',
      'BEG': 'Belgrade, Serbia',
      'ZAG': 'Zagreb, Croatia',
      'LJU': 'Ljubljana, Slovenia',
      'SKG': 'Thessaloniki, Greece',
      'HER': 'Heraklion, Greece',
      'MLA': 'Malta, Malta',
      
      // Asia
      'NRT': 'Tokyo, Japan',
      'HND': 'Tokyo, Japan',
      'KIX': 'Osaka, Japan',
      'NGO': 'Nagoya, Japan',
      'CTS': 'Sapporo, Japan',
      'FUK': 'Fukuoka, Japan',
      'ICN': 'Seoul, South Korea',
      'GMP': 'Seoul, South Korea',
      'PUS': 'Busan, South Korea',
      'PEK': 'Beijing, China',
      'PVG': 'Shanghai, China',
      'CAN': 'Guangzhou, China',
      'SZX': 'Shenzhen, China',
      'CTU': 'Chengdu, China',
      'HKG': 'Hong Kong',
      'MFM': 'Macau',
      'TPE': 'Taipei, Taiwan',
      'KHH': 'Kaohsiung, Taiwan',
      'MNL': 'Manila, Philippines',
      'CEB': 'Cebu, Philippines',
      'DVO': 'Davao, Philippines',
      'SIN': 'Singapore',
      'KUL': 'Kuala Lumpur, Malaysia',
      'BKK': 'Bangkok, Thailand',
      'DMK': 'Bangkok, Thailand',
      'HKT': 'Phuket, Thailand',
      'CGK': 'Jakarta, Indonesia',
      'DPS': 'Bali, Indonesia',
      'SUB': 'Surabaya, Indonesia',
      'SGN': 'Ho Chi Minh City, Vietnam',
      'HAN': 'Hanoi, Vietnam',
      'DAD': 'Da Nang, Vietnam',
      'PNH': 'Phnom Penh, Cambodia',
      'REP': 'Siem Reap, Cambodia',
      'BWN': 'Bandar Seri Begawan, Brunei',
      'VTE': 'Vientiane, Laos',
      'RGN': 'Yangon, Myanmar',
      'DEL': 'New Delhi, India',
      'BOM': 'Mumbai, India',
      'BLR': 'Bangalore, India',
      'MAA': 'Chennai, India',
      'CCU': 'Kolkata, India',
      'HYD': 'Hyderabad, India',
      'COK': 'Kochi, India',
      'AMD': 'Ahmedabad, India',
      'ISB': 'Islamabad, Pakistan',
      'KHI': 'Karachi, Pakistan',
      'LHE': 'Lahore, Pakistan',
      'KTM': 'Kathmandu, Nepal',
      'DAC': 'Dhaka, Bangladesh',
      'CMB': 'Colombo, Sri Lanka',
      'MLE': 'Male, Maldives',
      
      // Middle East
      'DXB': 'Dubai, UAE',
      'AUH': 'Abu Dhabi, UAE',
      'DOH': 'Doha, Qatar',
      'KWI': 'Kuwait City, Kuwait',
      'BAH': 'Manama, Bahrain',
      'MCT': 'Muscat, Oman',
      'AMM': 'Amman, Jordan',
      'BEY': 'Beirut, Lebanon',
      'TLV': 'Tel Aviv, Israel',
      'JED': 'Jeddah, Saudi Arabia',
      'RUH': 'Riyadh, Saudi Arabia',
      'DMM': 'Dammam, Saudi Arabia',
      
      // Oceania
      'SYD': 'Sydney, Australia',
      'MEL': 'Melbourne, Australia',
      'BNE': 'Brisbane, Australia',
      'PER': 'Perth, Australia',
      'ADL': 'Adelaide, Australia',
      'CBR': 'Canberra, Australia',
      'OOL': 'Gold Coast, Australia',
      'AKL': 'Auckland, New Zealand',
      'WLG': 'Wellington, New Zealand',
      'CHC': 'Christchurch, New Zealand',
      'ZQN': 'Queenstown, New Zealand',
      'NAN': 'Nadi, Fiji',
      'PPT': 'Papeete, Tahiti',
      'NOU': 'Noumea, New Caledonia',
      
      // South America
      'GRU': 'Sao Paulo, Brazil',
      'GIG': 'Rio de Janeiro, Brazil',
      'EZE': 'Buenos Aires, Argentina',
      'AEP': 'Buenos Aires, Argentina',
      'SCL': 'Santiago, Chile',
      'LIM': 'Lima, Peru',
      'BOG': 'Bogota, Colombia',
      'MDE': 'Medellin, Colombia',
      'CLO': 'Cali, Colombia',
      'UIO': 'Quito, Ecuador',
      'GYE': 'Guayaquil, Ecuador',
      'CCS': 'Caracas, Venezuela',
      
      // Africa
      'JNB': 'Johannesburg, South Africa',
      'CPT': 'Cape Town, South Africa',
      'DUR': 'Durban, South Africa',
      'NBO': 'Nairobi, Kenya',
      'ADD': 'Addis Ababa, Ethiopia',
      'CAI': 'Cairo, Egypt',
      'CMN': 'Casablanca, Morocco',
      'TUN': 'Tunis, Tunisia',
      'ALG': 'Algiers, Algeria',
      'LOS': 'Lagos, Nigeria',
      'ACC': 'Accra, Ghana',
      'DAR': 'Dar es Salaam, Tanzania',
      'EBB': 'Entebbe, Uganda',
      
      // Caribbean
      'MBJ': 'Montego Bay, Jamaica',
      'KIN': 'Kingston, Jamaica',
      'POS': 'Port of Spain, Trinidad',
      'BGI': 'Bridgetown, Barbados',
      'AUA': 'Oranjestad, Aruba',
      'CUR': 'Willemstad, Curacao',
      'SXM': 'Sint Maarten',
      'STT': 'Charlotte Amalie, US Virgin Islands',
      'STX': 'Christiansted, US Virgin Islands',
      'GCM': 'George Town, Cayman Islands',
      'NAS': 'Nassau, Bahamas',
      'PLS': 'Providenciales, Turks and Caicos',
      'BDA': 'Hamilton, Bermuda',
    };
    return airportMap[airportCode] || airportCode;
  };

  const getTransitRouteSummary = (travelTime: TravelTimeData) => {
    if (!travelTime.transit) return null;
    const steps = travelTime.transit.transitSteps?.filter((s) => s.transitLine) || [];
    if (steps.length > 0) {
      const stepDescriptions = steps.map((s) => {
        const lineName = s.lineShortName && !s.transitLine?.toLowerCase().includes(s.lineShortName.toLowerCase())
          ? `${s.lineShortName} - ${s.transitLine}`
          : s.transitLine || '';
        if (s.departureStop && s.arrivalStop) {
          return `${lineName} - ${s.departureStop} to ${s.arrivalStop}`;
        } else if (s.departureStop) {
          return `${lineName} from ${s.departureStop}`;
        } else if (s.arrivalStop) {
          return `${lineName} to ${s.arrivalStop}`;
        } else if (s.instruction) {
          return `${lineName} (${s.instruction})`;
        }
        return lineName;
      });
      return stepDescriptions.join(' → ');
    }
    if (travelTime.stationInfo?.line) {
      return travelTime.stationInfo.line;
    }
    if (travelTime.transit.transitLine) {
      return travelTime.transit.transitLine;
    }
    return null;
  };

  const activeTrips = trips.filter((t) => !isOldTrip(t.revisedDate || t.date));
  const pastTrips = trips.filter((t) => isOldTrip(t.revisedDate || t.date));
  const upcomingCount = activeTrips.length;
  const pastCount = pastTrips.length;

  const renderTripTile = (trip: Trip) => {
    const effectiveDate = trip.revisedDate || trip.date;
    const formatted = formatDate(effectiveDate);
    const arrivalFormatted = getArrivalFormatted(trip);
    const originalFormatted = trip.revisedDate && trip.revisedDate !== trip.date ? formatDate(trip.date) : null;
    const old = isOldTrip(effectiveDate);
    const isCanceled = trip.status === 'Canceled';
    const isDelayed = !isCanceled && (trip.status === 'Delayed' || Boolean(trip.revisedDate && trip.revisedDate !== trip.date));
    const tripTravelTime = travelTimes[trip.sk];

    return (
      <div
        key={trip.sk}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label={`Flight ${trip.flightNumber} from ${trip.originAirport} to ${trip.destinationAirport}`}
        onClick={() => setExpandedTrip(trip)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpandedTrip(trip);
          }
        }}
        className={`group relative bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg hover:border-green-600 dark:hover:border-green-500 transition-all duration-200 cursor-pointer flex flex-col justify-between text-left hover:-translate-y-0.5 ${
          old ? 'opacity-60 grayscale hover:opacity-100 hover:grayscale-0' : ''
        }`}
      >
        <div>
          {/* Header row: Flight # + Status Badge + Expand Icon */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <span className="text-xl font-extrabold text-green-700 dark:text-green-500 tracking-tight group-hover:text-green-800 dark:group-hover:text-green-400 transition-colors">
                {trip.flightNumber}
              </span>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                {isCanceled && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                    ❌ Canceled
                  </span>
                )}
                {isDelayed && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    ⚠️ Delayed {trip.delayMinutes ? `(+${trip.delayMinutes}m)` : ''}
                  </span>
                )}
                {!isCanceled && !isDelayed && !old && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200/60 dark:border-green-800/60">
                    ✈️ Scheduled
                  </span>
                )}
              </div>
            </div>

            <div className="p-1.5 rounded-lg text-gray-400 group-hover:text-green-600 dark:group-hover:text-green-400 group-hover:bg-green-50 dark:group-hover:bg-green-900/30 transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </div>
          </div>

          {/* Route details */}
          <div className="my-2.5">
            <div className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
              <span>{trip.originAirport}</span>
              <span className="text-gray-400 dark:text-gray-500 font-normal">→</span>
              <span>{trip.destinationAirport}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {getAirportCity(trip.originAirport).split(',')[0]} to {getAirportCity(trip.destinationAirport).split(',')[0]}
            </p>
          </div>

          {/* Date & Time pill */}
          <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs mt-3">
            <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 shrink-0">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium">{formatted.dayOfWeek}, {formatted.monthDay}</span>
            </div>
            <div className="flex items-center gap-2 font-semibold justify-end flex-wrap">
              <span className={`inline-flex items-center gap-1 ${isCanceled ? 'text-red-600 line-through' : isDelayed ? 'text-amber-600 dark:text-amber-400' : 'text-green-700 dark:text-green-500'}`} title="Departure Time">
                <span className="text-sm leading-none">🛫</span>
                <span>{formatted.time}</span>
              </span>
              <span className="text-gray-300 dark:text-gray-600 font-normal">•</span>
              <span className={`inline-flex items-center gap-1 ${isCanceled ? 'text-red-600 line-through' : 'text-gray-700 dark:text-gray-200'}`} title="Arrival Time">
                <span className="text-sm leading-none">🛬</span>
                <span>{arrivalFormatted.time}</span>
              </span>
              {originalFormatted && !isCanceled && (
                <span className="text-[10px] text-gray-400 line-through ml-0.5">({originalFormatted.time})</span>
              )}
            </div>
          </div>
        </div>

        {/* Tile footer */}
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between text-xs">
          {tripTravelTime ? (
            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium truncate">
              <span>🚗 {tripTravelTime.durationText}</span>
              {tripTravelTime.transit && (
                <span className="text-blue-600 dark:text-blue-400 ml-1">
                  • 🚆 {tripTravelTime.transit.durationText}
                </span>
              )}
            </div>
          ) : old ? (
            <span />
          ) : (
            <span className="text-gray-400 dark:text-gray-500">Checking traffic...</span>
          )}
          <span className="text-green-700 dark:text-green-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 shrink-0 ml-2">
            Details
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    );
  };

  return (
      <div className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">My Trips</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {trips.length === 0
                ? 'No flights scheduled'
                : `${upcomingCount} upcoming ${upcomingCount === 1 ? 'flight' : 'flights'}${pastCount > 0 ? `, ${pastCount} past` : ''}`}
            </p>
          </div>
          <button
              onClick={onBack}
              className="px-4 py-2 bg-green-700 text-white font-medium rounded-lg hover:bg-green-800 transition-colors shadow-sm self-start sm:self-auto cursor-pointer text-sm flex items-center gap-1.5"
          >
            <span>+</span> Add New
          </button>
        </div>

        {loading ? (
            <div className="text-center text-gray-500 py-16">Loading flights...</div>
        ) : trips.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
              <p className="text-gray-500 dark:text-gray-400 mb-4 text-base">No upcoming trips found.</p>
              <button
                  onClick={onBack}
                  className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg transition-colors cursor-pointer font-medium text-sm"
              >
                Track your first flight
              </button>
            </div>
        ) : (
          <div className="space-y-10">
            {/* Active Trips Section */}
            {activeTrips.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {activeTrips.map(renderTripTile)}
              </div>
            ) : (
              <div className="text-center sm:text-left py-6 text-gray-500 dark:text-gray-400 text-sm bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 border border-dashed border-gray-200 dark:border-gray-700">
                No active flights scheduled.
              </div>
            )}

            {/* Separator and Past Trips Section */}
            {pastTrips.length > 0 && (
              <div className="pt-8 border-t border-gray-200 dark:border-gray-700/80">
                <div className="mb-5">
                  <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Past Trips</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {pastTrips.length} previously taken {pastTrips.length === 1 ? 'flight' : 'flights'}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {pastTrips.map(renderTripTile)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expandable Screen Overlay Modal (fills screen as the 1 big card with scroll & X out) */}
        {expandedTrip && (() => {
          const effectiveDate = expandedTrip.revisedDate || expandedTrip.date;
          const formatted = formatDate(effectiveDate);
          const arrivalFormatted = getArrivalFormatted(expandedTrip);
          const originalFormatted = expandedTrip.revisedDate && expandedTrip.revisedDate !== expandedTrip.date ? formatDate(expandedTrip.date) : null;
          const old = isOldTrip(effectiveDate);
          const isCanceled = expandedTrip.status === 'Canceled';
          const isDelayed = !isCanceled && (expandedTrip.status === 'Delayed' || Boolean(expandedTrip.revisedDate && expandedTrip.revisedDate !== expandedTrip.date));
          const tripTravelTime = travelTimes[expandedTrip.sk];

          return (
            <div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setExpandedTrip(null);
                }
              }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="expanded-dialog-title"
            >
              <div
                className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] flex flex-col overflow-hidden my-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Top Bar with 'X' close button */}
                <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Flight Details</span>
                    <span className="text-gray-300 dark:text-gray-600">•</span>
                    <span className="text-base font-extrabold text-green-700 dark:text-green-500">{expandedTrip.flightNumber}</span>
                  </div>
                  <button
                    onClick={() => setExpandedTrip(null)}
                    className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                    aria-label="Close dialog"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Scrollable Big Card Content (fills modal screen) */}
                <div className="overflow-y-auto p-6 space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h2 id="expanded-dialog-title" className="text-3xl font-bold text-green-700 dark:text-green-600">
                          {expandedTrip.flightNumber}
                        </h2>
                        {isCanceled && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                            ❌ Canceled
                          </span>
                        )}
                        {isDelayed && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            ⚠️ Delayed {expandedTrip.delayMinutes ? `(+${expandedTrip.delayMinutes}m)` : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 text-lg mb-1">
                        {expandedTrip.originAirport} → {expandedTrip.destinationAirport}
                      </p>
                      <p className="text-sm text-gray-400 dark:text-gray-500">
                        {getAirportCity(expandedTrip.originAirport)} to {getAirportCity(expandedTrip.destinationAirport)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatted.dayOfWeek}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400">
                        {formatted.monthDay}
                      </div>
                      <div className="mt-2.5 flex items-center justify-end gap-3 text-base sm:text-lg font-semibold flex-wrap">
                        <div className={`inline-flex items-center gap-1.5 ${isCanceled ? 'text-red-600 line-through' : (isDelayed ? 'text-amber-600 dark:text-amber-500' : 'text-green-700 dark:text-green-600')}`} title="Departure Time">
                          <span className="text-xl leading-none">🛫</span>
                          <span>{formatted.time}</span>
                        </div>
                        <span className="text-gray-300 dark:text-gray-600 text-sm">→</span>
                        <div className={`inline-flex items-center gap-1.5 ${isCanceled ? 'text-red-600 line-through' : 'text-gray-800 dark:text-gray-100'}`} title="Arrival Time">
                          <span className="text-xl leading-none">🛬</span>
                          <span>{arrivalFormatted.time}</span>
                        </div>
                      </div>
                      {originalFormatted && !isCanceled && (
                        <div className="text-xs text-gray-400 dark:text-gray-500 line-through mt-1">
                          Was departure {originalFormatted.time}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Flight Route Map */}
                  <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-inner">
                    <img
                      src={`https://maps.googleapis.com/maps/api/staticmap?size=600x200&maptype=roadmap&markers=color:green|label:A|${getAirportCity(expandedTrip.originAirport)}&markers=color:red|label:B|${getAirportCity(expandedTrip.destinationAirport)}&path=color:0x15803d|weight:3|${getAirportCity(expandedTrip.originAirport)}|${getAirportCity(expandedTrip.destinationAirport)}&key=${import.meta.env.VITE_GOOGLE_MAPS_KEY}`}
                      alt={`Flight route from ${expandedTrip.originAirport} to ${expandedTrip.destinationAirport}`}
                      className="w-full h-auto"
                      loading="lazy"
                    />
                  </div>

                  {/* Commute and Address Details */}
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50">
                    <div className="text-sm text-gray-400 dark:text-gray-500 space-y-3">
                      <div>
                        <p className="text-xs uppercase font-medium tracking-wide">Leaving from</p>
                        <p className="font-semibold text-gray-800 dark:text-gray-200 text-base mt-0.5">{expandedTrip.homeAddress}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase font-medium tracking-wide">To Departure Airport</p>
                        <p className="font-semibold text-gray-800 dark:text-gray-200 text-base mt-0.5">
                          {expandedTrip.originAirport} ({getAirportCity(expandedTrip.originAirport)})
                        </p>
                      </div>

                      {tripTravelTime && (
                        <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
                          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                            <span className="text-base">🚗</span>
                            <span>Estimated drive time: {tripTravelTime.durationText}</span>
                          </div>

                          {tripTravelTime.transit && (
                            <div className="text-blue-700 dark:text-blue-400 font-semibold text-sm bg-blue-50/70 dark:bg-blue-900/20 p-3.5 rounded-xl border border-blue-100 dark:border-blue-900/30">
                              <div className="flex items-center gap-1.5">
                                <span className="text-base">🚆</span>
                                <span>
                                  {tripTravelTime.stationInfo?.agency || tripTravelTime.transit.transitAgency || "Transit"}: {tripTravelTime.transit.durationText}
                                </span>
                              </div>
                              {tripTravelTime.transit.transitSteps && tripTravelTime.transit.transitSteps.length > 0 ? (
                                <div className="mt-2.5 space-y-1.5 text-xs text-gray-600 dark:text-gray-300 font-normal">
                                  {tripTravelTime.transit.transitSteps
                                    .filter(step => step.transitLine)
                                    .map((step, idx) => {
                                      const vehicleType = typeof step.vehicleType === 'string'
                                        ? step.vehicleType.toLowerCase()
                                        : (step.vehicleType as any)?.text?.toLowerCase() || '';
                                      let icon = '🚆';
                                      if (vehicleType.includes('subway') || vehicleType.includes('train')) {
                                        icon = '🚇';
                                      } else if (vehicleType.includes('bus')) {
                                        icon = '🚌';
                                      } else if (vehicleType.includes('light rail')) {
                                        icon = '🚃';
                                      }

                                      const stopSegment = step.departureStop && step.arrivalStop
                                        ? `${step.departureStop} to ${step.arrivalStop}`
                                        : step.departureStop
                                        ? `from ${step.departureStop}`
                                        : step.arrivalStop
                                        ? `to ${step.arrivalStop}`
                                        : step.instruction
                                        ? step.instruction
                                        : step.stopName
                                        ? `at ${step.stopName}`
                                        : null;

                                      const lineDisplay = step.lineShortName && (!step.transitLine || !step.transitLine.toLowerCase().includes(step.lineShortName.toLowerCase()))
                                        ? (step.transitLine ? `${step.lineShortName} - ${step.transitLine}` : step.lineShortName)
                                        : (step.transitLine || step.lineShortName || '');

                                      return (
                                        <div key={idx} className="flex items-center gap-1.5 flex-wrap">
                                          <span>{icon}</span>
                                          <span className="font-semibold text-gray-800 dark:text-gray-200">{lineDisplay}</span>
                                          {stopSegment && (
                                            <span className="text-gray-600 dark:text-gray-300 font-normal">
                                              - {stopSegment}
                                            </span>
                                          )}
                                          {step.numStops ? (
                                            <span className="text-gray-400 dark:text-gray-500 text-[11px]">
                                              ({step.numStops} {step.numStops === 1 ? 'stop' : 'stops'})
                                            </span>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                </div>
                              ) : getTransitRouteSummary(tripTravelTime) ? (
                                <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 font-normal">
                                  {getTransitRouteSummary(tripTravelTime)}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                    <button
                        onClick={() => handleTestNotify(expandedTrip)}
                        disabled={testNotifying === expandedTrip.sk || old}
                        className={`px-4 py-2 text-sm font-medium rounded-xl border transition-colors cursor-pointer ${
                          testNotifying === expandedTrip.sk || old
                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                            : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/50 border-amber-200 dark:border-amber-800'
                        }`}
                    >
                      {testNotifying === expandedTrip.sk ? 'Sending...' : 'Test Notify'}
                    </button>
                    {confirmDeleteId === expandedTrip.sk ? (
                        <>
                          <button
                              onClick={() => handleDelete(expandedTrip)}
                              className="px-4 py-2 text-sm font-medium rounded-xl border bg-red-600 text-white hover:bg-red-700 border-red-600 transition-colors cursor-pointer"
                          >
                            Confirm Delete
                          </button>
                          <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-4 py-2 text-sm font-medium rounded-xl border bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setConfirmDeleteId(expandedTrip.sk)}
                            disabled={old}
                            className={`px-4 py-2 text-sm font-medium rounded-xl border transition-colors cursor-pointer ${
                              old
                                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                                : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 border-red-200 dark:border-red-800'
                            }`}
                        >
                          Delete
                        </button>
                    )}
                    <button
                        onClick={() => {
                          setExpandedTrip(null);
                          onEdit(expandedTrip);
                        }}
                        disabled={old}
                        className={`px-4 py-2 text-sm font-medium rounded-xl border transition-colors cursor-pointer ${
                          old
                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                            : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-500 hover:bg-green-100 dark:hover:bg-green-900/50 border-green-200 dark:border-green-800'
                        }`}
                    >
                      Edit Trip
                    </button>
                    <button
                        onClick={() => setExpandedTrip(null)}
                        className="px-4 py-2 text-sm font-medium rounded-xl border bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 border-gray-200 dark:border-gray-600 transition-colors cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {toast && (
            <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
        )}
      </div>
  );
}
