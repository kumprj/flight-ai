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

interface Journey {
  id: string;
  flights: Trip[];
  isConnecting: boolean;
  originAirport: string;
  destinationAirport: string;
  date: string;
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
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const [testNotifying, setTestNotifying] = useState<string | null>(null);
  const [travelTimes, setTravelTimes] = useState<Record<string, TravelTimeData>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const [expandedJourney, setExpandedJourney] = useState<Journey | null>(null);

  const showToast = (msg: string, type: ToastType = 'success') => setToast({ msg, type });

  // Group trips into journeys (connecting flights)
  const groupIntoJourneys = (trips: Trip[]): Journey[] => {
    const sortedTrips = [...trips].sort((a, b) => {
      const dateA = new Date(a.revisedDate || a.date).getTime();
      const dateB = new Date(b.revisedDate || b.date).getTime();
      return dateA - dateB; // Ascending order (oldest first)
    });

    const resultJourneys: Journey[] = [];
    const used = new Set<string>();

    for (const trip of sortedTrips) {
      if (used.has(trip.sk)) continue;

      const tripDate = trip.date.split('T')[0];
      const connectedFlights = [trip];
      used.add(trip.sk);

      // Look for connecting flights on the same day (supports multi-segment chains)
      let currentDestination = trip.destinationAirport;
      let foundNext = true;
      while (foundNext) {
        foundNext = false;
        for (const otherTrip of sortedTrips) {
          if (used.has(otherTrip.sk)) continue;
          const otherDate = otherTrip.date.split('T')[0];

          if (tripDate === otherDate && currentDestination === otherTrip.originAirport) {
            connectedFlights.push(otherTrip);
            used.add(otherTrip.sk);
            currentDestination = otherTrip.destinationAirport;
            foundNext = true;
            break;
          }
        }
      }

      const journey: Journey = {
        id: connectedFlights.map(f => f.sk).sort().join('-'),
        flights: connectedFlights,
        isConnecting: connectedFlights.length > 1,
        originAirport: connectedFlights[0].originAirport,
        destinationAirport: connectedFlights[connectedFlights.length - 1].destinationAirport,
        date: connectedFlights[0].date,
      };

      resultJourneys.push(journey);
    }

    return resultJourneys;
  };

  useEffect(() => {
    loadTrips();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expandedJourney) {
        setExpandedJourney(null);
      }
    };
    if (expandedJourney) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [expandedJourney]);

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

      // Group trips into journeys
      const groupedJourneys = groupIntoJourneys(sortedTrips);
      setJourneys(groupedJourneys);

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

  const handleDeleteJourney = async (journey: Journey) => {
    setConfirmDeleteId(null);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      // Delete all flights in the journey
      await Promise.all(
        journey.flights.map((flight) =>
          axios.delete(`${Config.API_URL}/trips`, {
            data: { tripId: flight.sk },
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      );

      showToast(journey.isConnecting ? "Connecting flights deleted successfully" : "Trip deleted successfully", "success");
      if (expandedJourney?.id === journey.id) {
        setExpandedJourney(null);
      }
      loadTrips();
    } catch (err) {
      console.error(err);
      showToast("Failed to delete trip", "error");
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
      'TXK': 'Texarkana, TX',
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
    // Parse naive local time string (e.g. "2026-03-29T14:30:00") directly to preserve intended local time
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

  const activeJourneys = journeys.filter((j) => {
    const firstFlight = j.flights[0];
    return !isOldTrip(firstFlight.revisedDate || firstFlight.date);
  });
  const pastJourneys = journeys.filter((j) => {
    const firstFlight = j.flights[0];
    return isOldTrip(firstFlight.revisedDate || firstFlight.date);
  });

  // Active flights: sort by soonest date first (next flight as first tile)
  activeJourneys.sort((a, b) => {
    const timeA = new Date(a.flights[0].revisedDate || a.flights[0].date).getTime();
    const timeB = new Date(b.flights[0].revisedDate || b.flights[0].date).getTime();
    return timeA - timeB;
  });

  // Past flights: most recent first
  pastJourneys.sort((a, b) => {
    const timeA = new Date(a.flights[0].revisedDate || a.flights[0].date).getTime();
    const timeB = new Date(b.flights[0].revisedDate || b.flights[0].date).getTime();
    return timeB - timeA;
  });

  const upcomingCount = activeJourneys.length;
  const pastCount = pastJourneys.length;

  const renderJourneyTile = (journey: Journey) => {
    const firstFlight = journey.flights[0];
    const lastFlight = journey.flights[journey.flights.length - 1];
    const effectiveDate = firstFlight.revisedDate || firstFlight.date;
    const formatted = formatDate(effectiveDate);
    const arrivalFormatted = getArrivalFormatted(lastFlight);
    const originalFormatted = firstFlight.revisedDate && firstFlight.revisedDate !== firstFlight.date ? formatDate(firstFlight.date) : null;
    const old = isOldTrip(effectiveDate);
    const isCanceled = journey.flights.some((f) => f.status === 'Canceled');
    const isDelayed = !isCanceled && journey.flights.some((f) => f.status === 'Delayed' || Boolean(f.revisedDate && f.revisedDate !== f.date));
    const delayMins = journey.flights.reduce((max, f) => Math.max(max, f.delayMinutes || 0), 0);
    const tripTravelTime = travelTimes[firstFlight.sk];

    return (
      <div
        key={journey.id}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label={`Flight ${journey.flights.map(f => f.flightNumber).join(' ')} from ${journey.originAirport} to ${journey.destinationAirport}`}
        onClick={() => setExpandedJourney(journey)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpandedJourney(journey);
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
                {journey.isConnecting ? journey.flights.map(f => f.flightNumber).join(' → ') : firstFlight.flightNumber}
              </span>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                {journey.isConnecting && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                    Connecting ({journey.flights.length})
                  </span>
                )}
                {isCanceled && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                    ❌ Canceled
                  </span>
                )}
                {isDelayed && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    ⚠️ Delayed {delayMins ? `(+${delayMins}m)` : ''}
                  </span>
                )}
                {!isCanceled && !isDelayed && !old && !journey.isConnecting && (
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
            <div className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white flex-wrap">
              {journey.isConnecting ? (
                <>
                  {journey.flights.map((f) => (
                    <span key={f.sk} className="flex items-center gap-2">
                      <span>{f.originAirport}</span>
                      <span className="text-gray-400 dark:text-gray-500 font-normal">→</span>
                    </span>
                  ))}
                  <span>{journey.destinationAirport}</span>
                </>
              ) : (
                <>
                  <span>{journey.originAirport}</span>
                  <span className="text-gray-400 dark:text-gray-500 font-normal">→</span>
                  <span>{journey.destinationAirport}</span>
                </>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {getAirportCity(journey.originAirport).split(',')[0]} to {getAirportCity(journey.destinationAirport).split(',')[0]}
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
              {journeys.length === 0
                ? 'No flights scheduled'
                : `${upcomingCount} upcoming ${upcomingCount === 1 ? 'trip' : 'trips'}${pastCount > 0 ? `, ${pastCount} past` : ''}`}
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
        ) : journeys.length === 0 ? (
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
            {activeJourneys.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {activeJourneys.map(renderJourneyTile)}
              </div>
            ) : (
              <div className="text-center sm:text-left py-6 text-gray-500 dark:text-gray-400 text-sm bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 border border-dashed border-gray-200 dark:border-gray-700">
                No active flights scheduled.
              </div>
            )}

            {/* Separator and Past Trips Section */}
            {pastJourneys.length > 0 && (
              <div className="pt-8 border-t border-gray-200 dark:border-gray-700/80">
                <div className="mb-5">
                  <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Past Trips</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {pastJourneys.length} previously taken {pastJourneys.length === 1 ? 'trip' : 'trips'}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {pastJourneys.map(renderJourneyTile)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expandable Screen Overlay Modal (fills screen as the 1 big card with scroll & X out) */}
        {expandedJourney && (() => {
          const firstFlight = expandedJourney.flights[0];
          const lastFlight = expandedJourney.flights[expandedJourney.flights.length - 1];
          const effectiveDate = firstFlight.revisedDate || firstFlight.date;
          const formatted = formatDate(effectiveDate);
          const arrivalFormatted = getArrivalFormatted(lastFlight);
          const originalFormatted = firstFlight.revisedDate && firstFlight.revisedDate !== firstFlight.date ? formatDate(firstFlight.date) : null;
          const old = isOldTrip(effectiveDate);
          const isCanceled = expandedJourney.flights.some((f) => f.status === 'Canceled');
          const isDelayed = !isCanceled && expandedJourney.flights.some((f) => f.status === 'Delayed' || Boolean(f.revisedDate && f.revisedDate !== f.date));
          const delayMins = expandedJourney.flights.reduce((max, f) => Math.max(max, f.delayMinutes || 0), 0);
          const tripTravelTime = travelTimes[firstFlight.sk];

          return (
            <div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setExpandedJourney(null);
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
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {expandedJourney.isConnecting ? 'Journey Details' : 'Flight Details'}
                    </span>
                    <span className="text-gray-300 dark:text-gray-600">•</span>
                    <span className="text-base font-extrabold text-green-700 dark:text-green-500">
                      {expandedJourney.isConnecting
                        ? expandedJourney.flights.map(f => f.flightNumber).join(' → ')
                        : firstFlight.flightNumber}
                    </span>
                  </div>
                  <button
                    onClick={() => setExpandedJourney(null)}
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
                          {expandedJourney.isConnecting
                            ? expandedJourney.flights.map(f => f.flightNumber).join(' → ')
                            : firstFlight.flightNumber}
                        </h2>
                        {expandedJourney.isConnecting && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                            Connecting ({expandedJourney.flights.length} flights)
                          </span>
                        )}
                        {isCanceled && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                            ❌ Canceled
                          </span>
                        )}
                        {isDelayed && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            ⚠️ Delayed {delayMins ? `(+${delayMins}m)` : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 text-lg mb-1">
                        {expandedJourney.isConnecting
                          ? `${expandedJourney.flights.map(f => f.originAirport).join(' → ')} → ${expandedJourney.destinationAirport}`
                          : `${expandedJourney.originAirport} → ${expandedJourney.destinationAirport}`}
                      </p>
                      <p className="text-sm text-gray-400 dark:text-gray-500">
                        {getAirportCity(expandedJourney.originAirport)} to {getAirportCity(expandedJourney.destinationAirport)}
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

                  {/* Connecting Flights Breakdown (if connecting) */}
                  {expandedJourney.isConnecting && (
                    <div className="bg-blue-50/60 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/30 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                          <span>🔀</span> Flight Connections ({expandedJourney.flights.length} flights)
                        </span>
                      </div>
                      <div className="divide-y divide-blue-100 dark:divide-blue-900/40">
                        {expandedJourney.flights.map((f, idx) => {
                          const segDep = formatDate(f.revisedDate || f.date);
                          const segArr = getArrivalFormatted(f);
                          return (
                            <div key={f.sk} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-sm flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-xs font-bold flex items-center justify-center">
                                  {idx + 1}
                                </span>
                                <span className="font-bold text-gray-900 dark:text-white">{f.flightNumber}</span>
                                <span className="text-gray-500 dark:text-gray-400 text-xs">
                                  {f.originAirport} → {f.destinationAirport}
                                </span>
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                  ({getAirportCity(f.originAirport).split(',')[0]} → {getAirportCity(f.destinationAirport).split(',')[0]})
                                </span>
                              </div>
                              <div className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                                🛫 {segDep.time} → 🛬 {segArr.time}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Flight Route Map */}
                  <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-inner">
                    <img
                      src={`https://maps.googleapis.com/maps/api/staticmap?size=600x200&maptype=roadmap&markers=color:green|label:A|${getAirportCity(expandedJourney.originAirport)}&markers=color:red|label:B|${getAirportCity(expandedJourney.destinationAirport)}&path=color:0x15803d|weight:3|${getAirportCity(expandedJourney.originAirport)}|${getAirportCity(expandedJourney.destinationAirport)}&key=${import.meta.env.VITE_GOOGLE_MAPS_KEY}`}
                      alt={`Flight route from ${expandedJourney.originAirport} to ${expandedJourney.destinationAirport}`}
                      className="w-full h-auto"
                      loading="lazy"
                    />
                  </div>

                  {/* Commute and Address Details */}
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50">
                    <div className="text-sm text-gray-400 dark:text-gray-500 space-y-3">
                      <div>
                        <p className="text-xs uppercase font-medium tracking-wide">Leaving from</p>
                        <p className="font-semibold text-gray-800 dark:text-gray-200 text-base mt-0.5">{firstFlight.homeAddress}</p>
                      </div>

                      <div>
                        <p className="text-xs uppercase font-medium tracking-wide">To Departure Airport</p>
                        <p className="font-semibold text-gray-800 dark:text-gray-200 text-base mt-0.5">
                          {firstFlight.originAirport} ({getAirportCity(firstFlight.originAirport)})
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
                        onClick={() => handleTestNotify(firstFlight)}
                        disabled={testNotifying === firstFlight.sk || old}
                        className={`px-4 py-2 text-sm font-medium rounded-xl border transition-colors cursor-pointer ${
                          testNotifying === firstFlight.sk || old
                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                            : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/50 border-amber-200 dark:border-amber-800'
                        }`}
                    >
                      {testNotifying === firstFlight.sk ? 'Sending...' : 'Test Notify'}
                    </button>
                    {confirmDeleteId === expandedJourney.id ? (
                        <>
                          <button
                              onClick={() => handleDeleteJourney(expandedJourney)}
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
                            onClick={() => setConfirmDeleteId(expandedJourney.id)}
                            disabled={old}
                            className={`px-4 py-2 text-sm font-medium rounded-xl border transition-colors cursor-pointer ${
                              old
                                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                                : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 border-red-200 dark:border-red-800'
                            }`}
                        >
                          {expandedJourney.isConnecting ? 'Delete Journey' : 'Delete'}
                        </button>
                    )}
                    <button
                        onClick={() => {
                          setExpandedJourney(null);
                          onEdit(firstFlight);
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
                        onClick={() => setExpandedJourney(null)}
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
