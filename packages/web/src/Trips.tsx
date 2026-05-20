import {useEffect, useState} from 'react';
import axios from 'axios';
import {Config} from './config';
import {fetchAuthSession} from 'aws-amplify/auth';

interface Trip {
  sk: string;
  flightNumber: string;
  date: string;
  originAirport: string;
  destinationAirport: string;
  homeAddress: string;
  createdAt?: number;
}

export default function Trips({onBack, onEdit}: { onBack: () => void; onEdit: (trip: Trip) => void }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      const res = await axios.get(`${Config.API_URL}/trips`, {
        headers: {Authorization: `Bearer ${token}`}
      });

      const sortedTrips = res.data.sort((b: Trip, a: Trip) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateA - dateB;
      });
      setTrips(sortedTrips);
    } catch (err) {
      console.error(err);
      alert("Failed to load trips");
    } finally {
      setLoading(false);
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

  const isOldTrip = (dateStr: string) => {
    const tripDate = new Date(dateStr);
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    return tripDate < twoDaysAgo;
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

  return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">My Trips</h1>
          <button
              onClick={onBack}
              className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors"
          >
            + Add New
          </button>
        </div>

        {loading ? (
            <div className="text-center text-gray-500 py-12">Loading flights...</div>
        ) : trips.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No upcoming trips found.</p>
              <button
                  onClick={onBack}
                  className="text-green-700 hover:underline"
              >
                Track your first flight
              </button>
            </div>
        ) : (
            <div className="space-y-4">
              {trips.map((trip) => {
                const formatted = formatDate(trip.date);
                const old = isOldTrip(trip.date);
                return (
                    <div
                        key={trip.sk}
                        className={`bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700 ${old ? 'opacity-50 grayscale' : ''}`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h2 className="text-2xl font-bold text-green-700 dark:text-green-600 mb-1">
                            {trip.flightNumber}
                          </h2>
                          <p className="text-gray-600 dark:text-gray-400 text-lg mb-3">
                            {trip.originAirport} → {trip.destinationAirport}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-gray-900 dark:text-white">
                            {formatted.dayOfWeek}
                          </div>
                          <div className="text-gray-600 dark:text-gray-400">
                            {formatted.monthDay}
                          </div>
                          <div
                              className="text-lg font-semibold text-green-700 dark:text-green-600 mt-2">
                            {formatted.time}
                          </div>
                        </div>
                      </div>
                      
                      {/* Flight Route Map */}
                      <div className="mb-4 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                        <img
                          src={`https://maps.googleapis.com/maps/api/staticmap?size=600x200&maptype=roadmap&markers=color:green|label:A|${getAirportCity(trip.originAirport)}&markers=color:red|label:B|${getAirportCity(trip.destinationAirport)}&path=color:0x15803d|weight:3|${getAirportCity(trip.originAirport)}|${getAirportCity(trip.destinationAirport)}&key=${import.meta.env.VITE_GOOGLE_MAPS_KEY}`}
                          alt={`Flight route from ${trip.originAirport} to ${trip.destinationAirport}`}
                          className="w-full h-auto"
                          loading="lazy"
                        />
                      </div>
                      
                      <div className="flex flex-col">
                        <div className="text-sm text-gray-400 dark:text-gray-500">
                          <p>Leaving from</p>
                          <p className="font-bold text-gray-700 dark:text-gray-300 mt-1">{trip.homeAddress}</p>
                          <p className="mt-1">to</p>
                          <p className="font-bold text-gray-700 dark:text-gray-300 mt-1">{trip.originAirport} airport</p>
                        </div>
                        <div className="flex justify-end mt-4">
                          <button
                              onClick={() => onEdit(trip)}
                              disabled={old}
                              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                                old
                                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                                  : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-600 hover:bg-green-100 dark:hover:bg-green-900/50 border-green-200 dark:border-green-800'
                              }`}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                );
              })}
            </div>
        )}
      </div>
  );
}
