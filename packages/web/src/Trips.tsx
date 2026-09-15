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

export interface DayConnectionInfo {
  isConnecting: boolean;
  legIndex: number; // 0 = Leg 1, 1 = Leg 2, etc.
  totalLegs: number;
  allLegs: Trip[];
  previousFlight?: Trip;
  nextFlight?: Trip;
  layoverMinutes?: number;
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

// Pure helper function to detect day-of connections across independent trips
export const getDayConnectionInfo = (trip: Trip, allTrips: Trip[]): DayConnectionInfo => {
  const tripTime = new Date(trip.revisedDate || trip.date).getTime();

  // Find candidate flights within 24 hours of this trip
  const candidateFlights = allTrips
    .filter((other) => {
      const otherTime = new Date(other.revisedDate || other.date).getTime();
      return Math.abs(tripTime - otherTime) <= 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => new Date(a.revisedDate || a.date).getTime() - new Date(b.revisedDate || b.date).getTime());

  // Build connecting chains: where current destination airport matches next origin airport
  const chains: Trip[][] = [];
  const used = new Set<string>();

  for (const candidate of candidateFlights) {
    if (used.has(candidate.sk)) continue;

    const currentChain: Trip[] = [candidate];
    used.add(candidate.sk);

    let current = candidate;
    let foundNext = true;

    while (foundNext) {
      foundNext = false;
      const currentArrTime = new Date(current.revisedArrivalTime || current.arrivalTime || current.date).getTime();

      for (const other of candidateFlights) {
        if (used.has(other.sk)) continue;
        const otherDepTime = new Date(other.revisedDate || other.date).getTime();

        // Destination of current matches origin of other, departing after arrival (within 14h window)
        if (
          current.destinationAirport === other.originAirport &&
          otherDepTime >= currentArrTime - 30 * 60 * 1000 &&
          otherDepTime - currentArrTime <= 14 * 60 * 60 * 1000
        ) {
          currentChain.push(other);
          used.add(other.sk);
          current = other;
          foundNext = true;
          break;
        }
      }
    }

    if (currentChain.length > 1) {
      chains.push(currentChain);
    }
  }

  // Check if our trip belongs to any chain
  for (const chain of chains) {
    const idx = chain.findIndex((f) => f.sk === trip.sk);
    if (idx !== -1) {
      const prev = chain[idx - 1];
      const next = chain[idx + 1];
      let layoverMins: number | undefined;

      if (prev) {
        const prevArr = new Date(prev.revisedArrivalTime || prev.arrivalTime || prev.date).getTime();
        const thisDep = new Date(trip.revisedDate || trip.date).getTime();
        layoverMins = Math.max(0, Math.round((thisDep - prevArr) / 60000));
      }

      return {
        isConnecting: true,
        legIndex: idx,
        totalLegs: chain.length,
        allLegs: chain,
        previousFlight: prev,
        nextFlight: next,
        layoverMinutes: layoverMins,
      };
    }
  }

  return {
    isConnecting: false,
    legIndex: 0,
    totalLegs: 1,
    allLegs: [trip],
  };
};

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

      // Active flights: sort soonest date first
      activeTrips.sort((a, b) => {
        const timeA = new Date(a.revisedDate || a.date).getTime();
        const timeB = new Date(b.revisedDate || b.date).getTime();
        return timeA - timeB;
      });

      // Past flights: most recent past flight first
      pastTrips.sort((a, b) => {
        const timeA = new Date(a.revisedDate || a.date).getTime();
        const timeB = new Date(b.revisedDate || b.date).getTime();
        return timeB - timeA;
      });

      const sortedTrips = [...activeTrips, ...pastTrips];
      setTrips(sortedTrips);

      // Load travel times only for flights departing from home (not intermediate connection layovers)
      loadTravelTimes(sortedTrips);
    } catch (err) {
      console.error(err);
      showToast("Failed to load trips", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadTravelTimes = async (allTripsList: Trip[]) => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      // Only compute travel time from home for active flights that originate from home (Leg 1)
      const travelTimePromises = allTripsList
        .filter((trip) => {
          if (isOldTrip(trip.revisedDate || trip.date)) return false;
          const conn = getDayConnectionInfo(trip, allTripsList);
          return conn.legIndex === 0;
        })
        .map(async (trip) => {
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
      const newTravelTimes: Record<string, TravelTimeData> = {};
      results.forEach(result => {
        if (result.data) {
          newTravelTimes[result.tripId] = result.data;
        }
      });
      setTravelTimes(newTravelTimes);
    } catch (err) {
      console.error("Failed to load travel times:", err);
    }
  };

  const handleTestNotify = async (trip: Trip) => {
    setTestNotifying(trip.sk);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      await axios.post(`${Config.API_URL}/trips/notify`, {
        tripId: trip.sk,
        type: 'both'
      }, {
        headers: {Authorization: `Bearer ${token}`}
      });
      showToast("Test notification sent! Check your SMS/Email.", "success");
    } catch (err: any) {
      console.error(err);
      const errorMsg = err.response?.data?.error || "Failed to send test notification.";
      showToast(errorMsg, "error");
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
      showToast("Flight deleted successfully", "success");
      if (expandedTrip?.sk === trip.sk) {
        setExpandedTrip(null);
      }
      loadTrips();
    } catch (err) {
      console.error(err);
      showToast("Failed to delete flight", "error");
    }
  };

  const handleDeleteAllLegs = async (legs: Trip[]) => {
    setConfirmDeleteId(null);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      await Promise.all(
        legs.map((leg) =>
          axios.delete(`${Config.API_URL}/trips`, {
            data: { tripId: leg.sk },
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      );
      showToast(`All ${legs.length} itinerary flights deleted`, "success");
      setExpandedTrip(null);
      loadTrips();
    } catch (err) {
      console.error(err);
      showToast("Failed to delete itinerary flights", "error");
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
      'LAS': 'Las Vegas, NV',
      'MCO': 'Orlando, FL',
      'EWR': 'Newark, NJ',
      'CLT': 'Charlotte, NC',
      'PHX': 'Phoenix, AZ',
      'IAH': 'Houston, TX',
      'MIA': 'Miami, FL',
      'BOS': 'Boston, MA',
      'MSP': 'Minneapolis, MN',
      'DTW': 'Detroit, MI',
      'FLL': 'Fort Lauderdale, FL',
      'PHL': 'Philadelphia, PA',
      'LGA': 'New York, NY',
      'BWI': 'Baltimore, MD',
      'SLC': 'Salt Lake City, UT',
      'SAN': 'San Diego, CA',
      'IAD': 'Washington, DC',
      'DCA': 'Washington, DC',
      'MDW': 'Chicago, IL',
      'TPA': 'Tampa, FL',
      'PDX': 'Portland, OR',
      'HNL': 'Honolulu, HI',
      'STL': 'St. Louis, MO',
      'BNA': 'Nashville, TN',
      'AUS': 'Austin, TX',
      'DAL': 'Dallas, TX',
      'RDU': 'Raleigh, NC',
      'HOU': 'Houston, TX',
      'OAK': 'Oakland, CA',
      'MSY': 'New Orleans, LA',
      'SMF': 'Sacramento, CA',
      'SNA': 'Santa Ana, CA',
      'SJC': 'San Jose, CA',
      'PIT': 'Pittsburgh, PA',
      'SAT': 'San Antonio, TX',
      'IND': 'Indianapolis, IN',
      'CLE': 'Cleveland, OH',
      'CMH': 'Columbus, OH',
      'MKE': 'Milwaukee, WI',
      'BDL': 'Hartford, CT',
      'JAX': 'Jacksonville, FL',
      'RSW': 'Fort Myers, FL',
      'PBI': 'West Palm Beach, FL',
      'OGG': 'Kahului, HI',
      'ABQ': 'Albuquerque, NM',
      'BUR': 'Burbank, CA',
      'BUF': 'Buffalo, NY',
      'OMA': 'Omaha, NE',
      'MEM': 'Memphis, TN',
      'RIC': 'Richmond, VA',
      'OKC': 'Oklahoma City, OK',
      'CHS': 'Charleston, SC',
      'TUS': 'Tucson, AZ',
      'ORF': 'Norfolk, VA',
      'SDF': 'Louisville, KY',
      'BOI': 'Boise, ID',
      'GRR': 'Grand Rapids, MI',
      'RNO': 'Reno, NV',
      'BHM': 'Birmingham, AL',
      'PVD': 'Providence, RI',
      'SAV': 'Savannah, GA',
      'SYR': 'Syracuse, NY',
      'TYS': 'Knoxville, TN',
      'GSO': 'Greensboro, NC',
      'PWM': 'Portland, ME',
      'ROC': 'Rochester, NY',
      'DAY': 'Dayton, OH',
      'LIT': 'Little Rock, AR',
      'TUL': 'Tulsa, OK',
      'ALB': 'Albany, NY',
      'FAT': 'Fresno, CA',
      'MYR': 'Myrtle Beach, SC',
      'COS': 'Colorado Springs, CO',
      'CAE': 'Columbia, SC',
      'BTV': 'Burlington, VT',
      'ICT': 'Wichita, KS',
      'HSV': 'Huntsville, AL',
      'MHT': 'Manchester, NH',
      'CAK': 'Akron, OH',
      'LEX': 'Lexington, KY',
      'ILM': 'Wilmington, NC',
      'ROA': 'Roanoke, VA',
      'MSN': 'Madison, WI',
      'FWA': 'Fort Wayne, IN',
      'PIA': 'Peoria, IL',
      'BMI': 'Bloomington, IL',
      'MLI': 'Moline, IL',
      'CID': 'Cedar Rapids, IA',
      'DSM': 'Des Moines, IA',
      'SGF': 'Springfield, MO',
      'FSD': 'Sioux Falls, SD',
      'FAR': 'Fargo, ND',
      'BIS': 'Bismarck, ND',
      'BIL': 'Billings, MT',
      'BZN': 'Bozeman, MT',
      'MSO': 'Missoula, MT',
      'JAC': 'Jackson Hole, WY',
      'CPR': 'Casper, WY',
      'GTF': 'Great Falls, MT',
      'RAP': 'Rapid City, SD',
      'EUG': 'Eugene, OR',
      'GEG': 'Spokane, WA',
      'PSC': 'Pasco, WA',
      'BLI': 'Bellingham, WA',
      'YKM': 'Yakima, WA',
      'RDD': 'Redding, CA',
      'BFL': 'Bakersfield, CA',
      'MRY': 'Monterey, CA',
      'SBP': 'San Luis Obispo, CA',
      'SBA': 'Santa Barbara, CA',
      'PSP': 'Palm Springs, CA',
      'IPL': 'Imperial, CA',
      'YUM': 'Yuma, AZ',
      'FLG': 'Flagstaff, AZ',
      'GJT': 'Grand Junction, CO',
      'DRO': 'Durango, CO',
      'ASE': 'Aspen, CO',
      'EGE': 'Vail, CO',
      'GUC': 'Gunnison, CO',
      'HDN': 'Hayden, CO',
      'MTJ': 'Montrose, CO',
      'SAF': 'Santa Fe, NM',
      'ROW': 'Roswell, NM',
      'HOB': 'Hobbs, NM',
      'ELP': 'El Paso, TX',
      'MAF': 'Midland, TX',
      'LBB': 'Lubbock, TX',
      'AMA': 'Amarillo, TX',
      'ABI': 'Abilene, TX',
      'SJT': 'San Angelo, TX',
      'ACT': 'Waco, TX',
      'TYR': 'Tyler, TX',
      'GGG': 'Longview, TX',
      'TXK': 'Texarkana, TX/AR',
      'CLL': 'College Station, TX',
      'BPT': 'Beaumont, TX',
      'CRP': 'Corpus Christi, TX',
      'MFE': 'McAllen, TX',
      'HRL': 'Harlingen, TX',
      'BRO': 'Brownsville, TX',
      'LRD': 'Laredo, TX',
      'SHV': 'Shreveport, LA',
      'MLU': 'Monroe, LA',
      'AEX': 'Alexandria, LA',
      'LFT': 'Lafayette, LA',
      'LCH': 'Lake Charles, LA',
      'BTR': 'Baton Rouge, LA',
      'GPT': 'Gulfport, MS',
      'HBG': 'Hattiesburg, MS',
      'JAN': 'Jackson, MS',
      'GTR': 'Columbus, MS',
      'TUP': 'Tupelo, MS',
      'MGM': 'Montgomery, AL',
      'MOB': 'Mobile, AL',
      'DHN': 'Dothan, AL',
      'CSG': 'Columbus, GA',
      'MCN': 'Macon, GA',
      'ABY': 'Albany, GA',
      'VLD': 'Valdosta, GA',
      'BQK': 'Brunswick, GA',
      'AGS': 'Augusta, GA',
      'HHH': 'Hilton Head, SC',
      'FLO': 'Florence, SC',
      'FAY': 'Fayetteville, NC',
      'OAJ': 'Jacksonville, NC',
      'EWN': 'New Bern, NC',
      'PGV': 'Greenville, NC',
      'ISO': 'Kinston, NC',
      'RWI': 'Rocky Mount, NC',
      'CHO': 'Charlottesville, VA',
      'SHD': 'Staunton, VA',
      'LYH': 'Lynchburg, VA',
      'TRI': 'Blountville, TN',
      'CHA': 'Chattanooga, TN',
      'PAH': 'Paducah, KY',
      'OWB': 'Owensboro, KY',
      'EVV': 'Evansville, IN',
      'SBN': 'South Bend, IN',
      'LAN': 'Lansing, MI',
      'FNT': 'Flint, MI',
      'MBS': 'Saginaw, MI',
      'AZO': 'Kalamazoo, MI',
      'MKG': 'Muskegon, MI',
      'TVC': 'Traverse City, MI',
      'APN': 'Alpena, MI',
      'CIU': 'Sault Ste. Marie, MI',
      'PLN': 'Pellston, MI',
      'MQT': 'Marquette, MI',
      'IMT': 'Iron Mountain, MI',
      'ESC': 'Escanaba, MI',
      'RHI': 'Rhinelander, WI',
      'CWA': 'Mosinee, WI',
      'ATW': 'Appleton, WI',
      'GRB': 'Green Bay, WI',
      'EAU': 'Eau Claire, WI',
      'LSE': 'La Crosse, WI',
      'DBQ': 'Dubuque, IA',
      'ALO': 'Waterloo, IA',
      'MCW': 'Mason City, IA',
      'SUX': 'Sioux City, IA',
      'BRL': 'Burlington, IA',
      'IRK': 'Kirksville, MO',
      'UIN': 'Quincy, IL',
      'DEC': 'Decatur, IL',
      'CMI': 'Champaign, IL',
      'MWA': 'Marion, IL',
      'CGI': 'Cape Girardeau, MO',
      'JLN': 'Joplin, MO',
      'COU': 'Columbia, MO',
      'XNA': 'Fayetteville, AR',
      'FSM': 'Fort Smith, AR',
      'ELD': 'El Dorado, AR',
      'HOT': 'Hot Springs, AR',
      'JBR': 'Jonesboro, AR',
      'GRI': 'Grand Island, NE',
      'LNK': 'Lincoln, NE',
      'EAR': 'Kearney, NE',
      'BFF': 'Scottsbluff, NE',
      'LBF': 'North Platte, NE',
      'HYS': 'Hays, KS',
      'GCK': 'Garden City, KS',
      'DDC': 'Dodge City, KS',
      'LBL': 'Liberal, KS',
      'SLN': 'Salina, KS',
      'MHK': 'Manhattan, KS',
      'FOE': 'Topeka, KS',
      'PIR': 'Pierre, SD',
      'ATY': 'Watertown, SD',
      'ABR': 'Aberdeen, SD',
      'HON': 'Huron, SD',
      'BKX': 'Brookings, SD',
      'MBG': 'Mobridge, SD',
      'GFK': 'Grand Forks, ND',
      'MOT': 'Minot, ND',
      'ISN': 'Williston, ND',
      'DIK': 'Dickinson, ND',
      'JMS': 'Jamestown, ND',
      'DVL': 'Devils Lake, ND',
      'BTM': 'Butte, MT',
      'HLN': 'Helena, MT',
      'FCA': 'Kalispell, MT',
      'GPI': 'Kalispell, MT',
      'WYS': 'West Yellowstone, MT',
      'COD': 'Cody, WY',
      'RKS': 'Rock Springs, WY',
      'LAR': 'Laramie, WY',
      'GCC': 'Gillette, WY',
      'SHR': 'Sheridan, WY',
      'WRL': 'Worland, WY',
      'RIW': 'Riverton, WY',
      'IDA': 'Idaho Falls, ID',
      'PIH': 'Pocatello, ID',
      'TWF': 'Twin Falls, ID',
      'LWS': 'Lewiston, ID',
      'SUN': 'Sun Valley, ID',
      'ALW': 'Walla Walla, WA',
      'EAT': 'Wenatchee, WA',
      'PUW': 'Pullman, WA',
      'CLM': 'Port Angeles, WA',
      'AST': 'Astoria, OR',
      'ONP': 'Newport, OR',
      'OTH': 'North Bend, OR',
      'LMT': 'Klamath Falls, OR',
      'MFR': 'Medford, OR',
      'RDM': 'Redmond, OR',
      'PDT': 'Pendleton, OR',
      'EKO': 'Elko, NV',
      'ENV': 'Wendover, NV',
      'ELY': 'Ely, NV',
      'TPH': 'Tonopah, NV',
      'CDC': 'Cedar City, UT',
      'SGU': 'St. George, UT',
      'CNY': 'Moab, UT',
      'VEL': 'Vernal, UT',
      'PRC': 'Prescott, AZ',
      'GCN': 'Grand Canyon, AZ',
      'PGA': 'Page, AZ',
      'IFP': 'Bullhead City, AZ',
      'INW': 'Winslow, AZ',
      'SOW': 'Show Low, AZ',
      'DUG': 'Douglas, AZ',
      'FMN': 'Farmington, NM',
      'GUP': 'Gallup, NM',
      'SVC': 'Silver City, NM',
      'ALM': 'Alamogordo, NM',
      'CNM': 'Carlsbad, NM',
      'CVN': 'Clovis, NM',
      'TCC': 'Tucumcari, NM',
      'PUB': 'Pueblo, CO',
      'ALS': 'Alamosa, CO',
      'STC': 'St. Cloud, MN',
      'BRD': 'Brainerd, MN',
      'BJI': 'Bemidji, MN',
      'HIB': 'Hibbing, MN',
      'INL': 'International Falls, MN',
      'DLH': 'Duluth, MN',
      'RST': 'Rochester, MN',
      // International
      'LHR': 'London Heathrow, UK',
      'LGW': 'London Gatwick, UK',
      'CDG': 'Paris Charles de Gaulle, France',
      'ORY': 'Paris Orly, France',
      'FRA': 'Frankfurt, Germany',
      'MUC': 'Munich, Germany',
      'AMS': 'Amsterdam, Netherlands',
      'MAD': 'Madrid, Spain',
      'BCN': 'Barcelona, Spain',
      'FCO': 'Rome Fiumicino, Italy',
      'MXP': 'Milan Malpensa, Italy',
      'ZRH': 'Zurich, Switzerland',
      'GVA': 'Geneva, Switzerland',
      'VIE': 'Vienna, Austria',
      'BRU': 'Brussels, Belgium',
      'DUB': 'Dublin, Ireland',
      'CPH': 'Copenhagen, Denmark',
      'ARN': 'Stockholm Arlanda, Sweden',
      'OSL': 'Oslo, Norway',
      'HEL': 'Helsinki, Finland',
      'LIS': 'Lisbon, Portugal',
      'ATH': 'Athens, Greece',
      'IST': 'Istanbul, Turkey',
      'WAW': 'Warsaw, Poland',
      'PRG': 'Prague, Czech Republic',
      'BUD': 'Budapest, Hungary',
      'YYZ': 'Toronto Pearson, Canada',
      'YVR': 'Vancouver, Canada',
      'YUL': 'Montreal Trudeau, Canada',
      'YYC': 'Calgary, Canada',
      'YOW': 'Ottawa, Canada',
      'MEX': 'Mexico City, Mexico',
      'CUN': 'Cancun, Mexico',
      'GDL': 'Guadalajara, Mexico',
      'MTY': 'Monterrey, Mexico',
      'TIJ': 'Tijuana, Mexico',
      'SJD': 'San Jose del Cabo, Mexico',
      'PVR': 'Puerto Vallarta, Mexico',
      'NRT': 'Tokyo Narita, Japan',
      'HND': 'Tokyo Haneda, Japan',
      'KIX': 'Osaka Kansai, Japan',
      'ICN': 'Seoul Incheon, South Korea',
      'PEK': 'Beijing Capital, China',
      'PKX': 'Beijing Daxing, China',
      'PVG': 'Shanghai Pudong, China',
      'SHA': 'Shanghai Hongqiao, China',
      'CAN': 'Guangzhou, China',
      'HKG': 'Hong Kong',
      'TPE': 'Taipei Taoyuan, Taiwan',
      'SIN': 'Singapore Changi, Singapore',
      'BKK': 'Bangkok Suvarnabhumi, Thailand',
      'DMK': 'Bangkok Don Mueang, Thailand',
      'KUL': 'Kuala Lumpur, Malaysia',
      'CGK': 'Jakarta Soekarno-Hatta, Indonesia',
      'MNL': 'Manila Ninoy Aquino, Philippines',
      'SGN': 'Ho Chi Minh City, Vietnam',
      'HAN': 'Hanoi Noi Bai, Vietnam',
      'DEL': 'Delhi Indira Gandhi, India',
      'BOM': 'Mumbai Chhatrapati Shivaji, India',
      'BLR': 'Bengaluru Kempegowda, India',
      'MAA': 'Chennai, India',
      'HYD': 'Hyderabad Rajiv Gandhi, India',
      'DXB': 'Dubai, UAE',
      'AUH': 'Abu Dhabi, UAE',
      'DOH': 'Doha Hamad, Qatar',
      'JED': 'Jeddah King Abdulaziz, Saudi Arabia',
      'RUH': 'Riyadh King Khalid, Saudi Arabia',
      'TLV': 'Tel Aviv Ben Gurion, Israel',
      'CAI': 'Cairo, Egypt',
      'JNB': 'Johannesburg O.R. Tambo, South Africa',
      'CPT': 'Cape Town, South Africa',
      'LOS': 'Lagos Murtala Muhammed, Nigeria',
      'NBO': 'Nairobi Jomo Kenyatta, Kenya',
      'SYD': 'Sydney Kingsford Smith, Australia',
      'MEL': 'Melbourne Tullamarine, Australia',
      'BNE': 'Brisbane, Australia',
      'PER': 'Perth, Australia',
      'AKL': 'Auckland, New Zealand',
      'GRU': 'Sao Paulo Guarulhos, Brazil',
      'GIG': 'Rio de Janeiro Galeao, Brazil',
      'EZE': 'Buenos Aires Ezeiza, Argentina',
      'SCL': 'Santiago, Chile',
      'BOG': 'Bogota El Dorado, Colombia',
      'LIM': 'Lima Jorge Chavez, Peru',
      'PTY': 'Panama City Tocumen, Panama',
      'SJO': 'San Jose Juan Santamaria, Costa Rica',
      'GUA': 'Guatemala City La Aurora, Guatemala',
      'SAL': 'San Salvador, El Salvador',
      'SDQ': 'Santo Domingo Las Americas, Dominican Republic',
      'PUJ': 'Punta Cana, Dominican Republic',
      'SJU': 'San Juan Luis Munoz Marin, Puerto Rico',
      'BQN': 'Aguadilla, Puerto Rico',
      'PSE': 'Ponce, Puerto Rico',
      'MBJ': 'Montego Bay Sangster, Jamaica',
      'KIN': 'Kingston Norman Manley, Jamaica',
      'HAV': 'Havana Jose Marti, Cuba',
      'VRA': 'Varadero, Cuba',
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

  const formatDate = (dateStr: string) => {
    const [datePart, timePart] = dateStr.split('T');
    if (datePart && timePart) {
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);

      const d = new Date(year, month - 1, day, hour, minute);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      const dayOfWeek = days[d.getDay()];
      const monthDay = `${months[d.getMonth()]} ${d.getDate()}`;

      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      const displayMinute = minute < 10 ? `0${minute}` : minute;
      const time = `${displayHour}:${displayMinute} ${period}`;

      return { dayOfWeek, monthDay, time };
    }

    const d = new Date(dateStr);
    return {
      dayOfWeek: d.toLocaleDateString(undefined, { weekday: 'short' }),
      monthDay: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    };
  };

  const getArrivalFormatted = (trip: Trip) => {
    const arrivalDateStr = trip.revisedArrivalTime || trip.arrivalTime;
    if (arrivalDateStr) {
      return formatDate(arrivalDateStr);
    }
    // Fallback: estimate +2 hours after departure
    const depDateStr = trip.revisedDate || trip.date;
    const [datePart, timePart] = depDateStr.split('T');
    if (datePart && timePart) {
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);
      const d = new Date(year, month - 1, day, hour + 2, minute);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const period = d.getHours() >= 12 ? 'PM' : 'AM';
      const displayHour = d.getHours() % 12 || 12;
      const displayMinute = d.getMinutes() < 10 ? `0${d.getMinutes()}` : d.getMinutes();
      return {
        dayOfWeek: days[d.getDay()],
        monthDay: `${months[d.getMonth()]} ${d.getDate()}`,
        time: `${displayHour}:${displayMinute} ${period}`
      };
    }
    return { dayOfWeek: '', monthDay: '', time: '--:--' };
  };

  const formatLayover = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
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
    const connectionInfo = getDayConnectionInfo(trip, trips);

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
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-extrabold text-green-700 dark:text-green-500 tracking-tight group-hover:text-green-800 dark:group-hover:text-green-400 transition-colors">
                  {trip.flightNumber}
                </span>
                {connectionInfo.isConnecting && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                    Leg {connectionInfo.legIndex + 1} of {connectionInfo.totalLegs}
                  </span>
                )}
              </div>
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
                {!isCanceled && !isDelayed && !old && !connectionInfo.isConnecting && (
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
            {connectionInfo.nextFlight && (
              <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 font-medium truncate">
                ↳ Connecting to {connectionInfo.nextFlight.flightNumber} ({connectionInfo.nextFlight.originAirport} → {connectionInfo.nextFlight.destinationAirport})
              </p>
            )}
            {connectionInfo.previousFlight && (
              <p className="text-[11px] text-purple-600 dark:text-purple-400 mt-1 font-medium truncate">
                ↳ Connected from {connectionInfo.previousFlight.flightNumber} (arr. {formatDate(connectionInfo.previousFlight.revisedArrivalTime || connectionInfo.previousFlight.arrivalTime || connectionInfo.previousFlight.date).time})
              </p>
            )}
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
          {connectionInfo.legIndex > 0 && connectionInfo.layoverMinutes !== undefined ? (
            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium truncate">
              <span>⏱️ {formatLayover(connectionInfo.layoverMinutes)} layover at {trip.originAirport}</span>
            </div>
          ) : tripTravelTime ? (
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

        {/* Expandable Screen Overlay Modal */}
        {expandedTrip && (() => {
          const effectiveDate = expandedTrip.revisedDate || expandedTrip.date;
          const formatted = formatDate(effectiveDate);
          const arrivalFormatted = getArrivalFormatted(expandedTrip);
          const originalFormatted = expandedTrip.revisedDate && expandedTrip.revisedDate !== expandedTrip.date ? formatDate(expandedTrip.date) : null;
          const old = isOldTrip(effectiveDate);
          const isCanceled = expandedTrip.status === 'Canceled';
          const isDelayed = !isCanceled && (expandedTrip.status === 'Delayed' || Boolean(expandedTrip.revisedDate && expandedTrip.revisedDate !== expandedTrip.date));
          const tripTravelTime = travelTimes[expandedTrip.sk];
          const connectionInfo = getDayConnectionInfo(expandedTrip, trips);

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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Flight Details</span>
                    <span className="text-gray-300 dark:text-gray-600">•</span>
                    <span className="text-base font-extrabold text-green-700 dark:text-green-500">{expandedTrip.flightNumber}</span>
                    {connectionInfo.isConnecting && (
                      <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                        Leg {connectionInfo.legIndex + 1} of {connectionInfo.totalLegs}
                      </span>
                    )}
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

                {/* Scrollable Big Card Content */}
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

                  {/* TODAY'S FLIGHT ITINERARY COMPONENT (when connection exists) */}
                  {connectionInfo.isConnecting && (
                    <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-blue-950/30 dark:to-indigo-950/30 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                          <span>✈️</span> Today&apos;s Flight Itinerary ({connectionInfo.totalLegs} legs)
                        </span>
                        <span className="text-xs text-blue-700 dark:text-blue-400 font-medium">
                          Viewing Leg {connectionInfo.legIndex + 1} of {connectionInfo.totalLegs}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {connectionInfo.allLegs.map((leg, idx) => {
                          const isCurrent = leg.sk === expandedTrip.sk;
                          const legDep = formatDate(leg.revisedDate || leg.date);
                          const legArr = getArrivalFormatted(leg);
                          const nextLeg = connectionInfo.allLegs[idx + 1];
                          const legLayoverMins = nextLeg ? Math.round((new Date(nextLeg.revisedDate || nextLeg.date).getTime() - new Date(leg.revisedArrivalTime || leg.arrivalTime || leg.date).getTime()) / 60000) : null;

                          return (
                            <div key={leg.sk}>
                              <div
                                onClick={() => setExpandedTrip(leg)}
                                className={`p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between flex-wrap gap-2 ${
                                  isCurrent
                                    ? 'bg-white dark:bg-gray-800 shadow-sm border-2 border-blue-600 dark:border-blue-500'
                                    : 'bg-white/60 dark:bg-gray-800/60 hover:bg-white dark:hover:bg-gray-800 border border-blue-100/60 dark:border-gray-700'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                                    isCurrent
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                                  }`}>
                                    {idx + 1}
                                  </span>
                                  <div>
                                    <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white text-sm">
                                      <span>{leg.flightNumber}</span>
                                      <span className="text-gray-400 font-normal">•</span>
                                      <span>{leg.originAirport} → {leg.destinationAirport}</span>
                                      {isCurrent && (
                                        <span className="ml-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                                          (Current)
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {getAirportCity(leg.originAirport).split(',')[0]} to {getAirportCity(leg.destinationAirport).split(',')[0]}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 text-right">
                                  <span>🛫 {legDep.time}</span>
                                  <span className="mx-1 text-gray-400">→</span>
                                  <span>🛬 {legArr.time}</span>
                                </div>
                              </div>

                              {/* Layover transfer connector */}
                              {nextLeg && legLayoverMins !== null && (
                                <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-amber-700 dark:text-amber-400 font-medium">
                                  <div className="w-0.5 h-4 bg-blue-300 dark:bg-blue-700 ml-2.5" />
                                  <span>
                                    ⏱️ {formatLayover(legLayoverMins)} layover at {leg.destinationAirport} ({getAirportCity(leg.destinationAirport).split(',')[0]})
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Flight Route Map */}
                  <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-inner">
                    <img
                      src={`https://maps.googleapis.com/maps/api/staticmap?size=600x200&maptype=roadmap&markers=color:green|label:A|${getAirportCity(expandedTrip.originAirport)}&markers=color:red|label:B|${getAirportCity(expandedTrip.destinationAirport)}&path=color:0x15803d|weight:3|${getAirportCity(expandedTrip.originAirport)}|${getAirportCity(expandedTrip.destinationAirport)}&key=${import.meta.env.VITE_GOOGLE_MAPS_KEY}`}
                      alt={`Flight route from ${expandedTrip.originAirport} to ${expandedTrip.destinationAirport}`}
                      className="w-full h-auto"
                      loading="lazy"
                    />
                  </div>

                  {/* Commute and Transfer Details */}
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50">
                    <div className="text-sm text-gray-400 dark:text-gray-500 space-y-3">
                      {connectionInfo.legIndex > 0 ? (
                        <>
                          <div>
                            <p className="text-xs uppercase font-medium tracking-wide">Connection Origin</p>
                            <p className="font-semibold text-gray-800 dark:text-gray-200 text-base mt-0.5">
                              Transfer at {expandedTrip.originAirport} ({getAirportCity(expandedTrip.originAirport)})
                            </p>
                          </div>

                          {connectionInfo.previousFlight && (
                            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Connecting from <span className="font-bold text-gray-800 dark:text-gray-200">{connectionInfo.previousFlight.flightNumber}</span> ({connectionInfo.previousFlight.originAirport} → {connectionInfo.previousFlight.destinationAirport})
                              </p>
                              {connectionInfo.layoverMinutes !== undefined && (
                                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 mt-1">
                                  ⏱️ Scheduled Layover: {formatLayover(connectionInfo.layoverMinutes)}
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
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
                                        .filter((step) => step.transitLine)
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
                        </>
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
                            Delete This Flight
                          </button>
                          {connectionInfo.isConnecting && (
                            <button
                                onClick={() => handleDeleteAllLegs(connectionInfo.allLegs)}
                                className="px-4 py-2 text-sm font-medium rounded-xl border bg-red-700 text-white hover:bg-red-800 border-red-700 transition-colors cursor-pointer"
                            >
                              Delete All {connectionInfo.totalLegs} Legs
                            </button>
                          )}
                          <button
                              onClick={() => {
                                setConfirmDeleteId(null);
                              }}
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
                      Edit Flight
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
