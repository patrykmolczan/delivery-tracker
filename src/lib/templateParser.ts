/**
 * templateParser.ts
 * Client-side Excel template parser using SheetJS.
 * Resolves country names from templates using a 6-layer strategy:
 *   1. Exact DB match (case-insensitive)
 *   2. ISO 2-letter code (US, GB, DE…)
 *   3. ISO 3-letter code (USA, GBR, DEU…)
 *   4. Alias map (common misspellings, alternate names)
 *   5. Levenshtein fuzzy match (distance ≤ 2 for short, ≤ 3 for long names)
 *   6. Unresolved → returned for manual user correction
 */
import * as XLSX from 'xlsx'

export interface DBCountry {
  id: number
  name: string
}

export interface ParsedCountry {
  rawName: string        // original value from file
  resolvedId: number | null
  resolvedName: string   // matched DB name, or rawName if unmatched
  jobCount: number
  confidence: 'exact' | 'iso2' | 'iso3' | 'alias' | 'fuzzy' | 'unmatched'
}

export interface TemplateParseResult {
  countries: ParsedCountry[]
  totalJobs: number
  unmatched: string[]    // raw names that could not be resolved
  parseWarnings: string[]
  locationWarnings: string[]  // location validation warnings per row
}

// ─── ISO 2-letter → canonical name ──────────────────────────────────────────
const ISO2: Record<string, string> = {
  AF:'Afghanistan', AL:'Albania', DZ:'Algeria', AR:'Argentina',
  AM:'Armenia', AU:'Australia', AT:'Austria', AZ:'Azerbaijan',
  BS:'Bahamas', BH:'Bahrain', BD:'Bangladesh', BB:'Barbados',
  BE:'Belgium', BO:'Bolivia', BA:'Bosnia', BR:'Brazil',
  BG:'Bulgaria', KH:'Cambodia', CM:'Cameroon', CA:'Canada',
  CV:'Cape Verde', CL:'Chile', CN:'China', CO:'Colombia',
  CR:'Costa Rica', HR:'Croatia', CY:'Cyprus', CZ:'Czech Republic',
  DK:'Denmark', DO:'Dominican Republic', EC:'Ecuador', EG:'Egypt',
  SV:'El Salvador', ET:'Ethiopia', FI:'Finland', FR:'France',
  GE:'Georgia', DE:'Germany', GH:'Ghana', GR:'Greece',
  GT:'Guatemala', GY:'Guyana', HN:'Honduras', HK:'Hong Kong',
  HU:'Hungary', IN:'India', ID:'Indonesia', IE:'Ireland',
  IL:'Israel', IT:'Italy', CI:'Ivory Coast', JM:'Jamaica',
  JP:'Japan', KZ:'Kazakhstan', KE:'Kenya', KR:'South Korea',
  LV:'Latvia', LB:'Lebanon', LY:'Libya', LT:'Lithuania',
  LU:'Luxembourg', MG:'Madagascar', MY:'Malaysia', MU:'Mauritius',
  MX:'Mexico', MD:'Moldova', MN:'Mongolia', MA:'Morocco',
  MZ:'Mozambique', MM:'Myanmar', NL:'Netherlands', NZ:'New Zealand',
  NI:'Nicaragua', NG:'Nigeria', MK:'North Macedonia', NO:'Norway',
  PK:'Pakistan', PA:'Panama', PG:'Papua New Guinea', PY:'Paraguay',
  PE:'Peru', PH:'Philippines', PL:'Poland', PT:'Portugal',
  PR:'Puerto Rico', RO:'Romania', SA:'Saudi Arabia', SN:'Senegal',
  RS:'Serbia', SG:'Singapore', SK:'Slovakia', SI:'Slovenia',
  ZA:'South Africa', ES:'Spain', LK:'Sri Lanka', SD:'Sudan',
  SE:'Sweden', CH:'Switzerland', TW:'Taiwan', TZ:'Tanzania',
  TH:'Thailand', TT:'Trinidad and Tobago', TN:'Tunisia', TR:'Turkey',
  AE:'UAE', GB:'United Kingdom', UK:'United Kingdom', US:'United States', UY:'Uruguay',
  UZ:'Uzbekistan', VE:'Venezuela', VN:'Vietnam', ZW:'Zimbabwe',
}

// ─── ISO 3-letter → canonical name ──────────────────────────────────────────
const ISO3: Record<string, string> = {
  USA:'United States', GBR:'United Kingdom', DEU:'Germany', FRA:'France',
  ITA:'Italy', ESP:'Spain', NLD:'Netherlands', AUS:'Australia',
  CAN:'Canada', BRA:'Brazil', IND:'India', CHN:'China',
  JPN:'Japan', KOR:'South Korea', MEX:'Mexico', ARG:'Argentina',
  ZAF:'South Africa', SGP:'Singapore', MYS:'Malaysia', THA:'Thailand',
  PHL:'Philippines', IDN:'Indonesia', VNM:'Vietnam', POL:'Poland',
  CZE:'Czech Republic', HUN:'Hungary', ROU:'Romania', SVK:'Slovakia',
  SVN:'Slovenia', HRV:'Croatia', SRB:'Serbia', BGR:'Bulgaria',
  TUR:'Turkey', EGY:'Egypt', SAU:'Saudi Arabia', ARE:'UAE',
  ISR:'Israel', PAK:'Pakistan', BGD:'Bangladesh', LKA:'Sri Lanka',
  MMR:'Myanmar', KHM:'Cambodia', MNG:'Mongolia', KAZ:'Kazakhstan',
  UZB:'Uzbekistan', AZE:'Azerbaijan', ARM:'Armenia', GEO:'Georgia',
  MDA:'Moldova', NOR:'Norway', SWE:'Sweden', DNK:'Denmark',
  FIN:'Finland', CHE:'Switzerland', AUT:'Austria', BEL:'Belgium',
  PRT:'Portugal', GRC:'Greece', CYP:'Cyprus', LUX:'Luxembourg',
  IRL:'Ireland', NZL:'New Zealand', ZWE:'Zimbabwe', KEN:'Kenya',
  GHA:'Ghana', NGA:'Nigeria', ETH:'Ethiopia', TZA:'Tanzania',
  MOZ:'Mozambique', CMR:'Cameroon', CIV:'Ivory Coast', SEN:'Senegal',
  MAR:'Morocco', TUN:'Tunisia', DZA:'Algeria', LBY:'Libya',
  SDN:'Sudan', MDG:'Madagascar', MUS:'Mauritius', CPV:'Cape Verde',
  BHS:'Bahamas', BRB:'Barbados', JAM:'Jamaica', TTO:'Trinidad and Tobago',
  PRI:'Puerto Rico', COL:'Colombia', CHL:'Chile', PER:'Peru',
  ECU:'Ecuador', BOL:'Bolivia', URY:'Uruguay', PRY:'Paraguay',
  VEN:'Venezuela', GUY:'Guyana', PAN:'Panama', CRI:'Costa Rica',
  GTM:'Guatemala', HND:'Honduras', SLV:'El Salvador', NIC:'Nicaragua',
  DOM:'Dominican Republic', HKG:'Hong Kong', TWN:'Taiwan',
  LBN:'Lebanon', BHR:'Bahrain', PNG:'Papua New Guinea', ALB:'Albania',
  BIH:'Bosnia', MKD:'North Macedonia', LVA:'Latvia', LTU:'Lithuania',
  LAT:'Latvia', ALG:'Algeria', MOR:'Morocco',
}

// ─── Alias map → canonical name (lowercase keys) ─────────────────────────────
const ALIASES: Record<string, string> = {
  'united states of america': 'United States',
  'united states': 'United States',
  'u.s.a.': 'United States',
  'u.s.': 'United States',
  'america': 'United States',
  'great britain': 'United Kingdom',
  'england': 'United Kingdom',
  'united kingdom': 'United Kingdom',
  'u.k.': 'United Kingdom',
  'britain': 'United Kingdom',
  'united arab emirates': 'UAE',
  'u.a.e.': 'UAE',
  'south korea': 'South Korea',
  'republic of korea': 'South Korea',
  'korea, republic of': 'South Korea',
  'north korea': 'Korea',
  'dprk': 'Korea',
  "democratic people's republic of korea": 'Korea',
  'viet nam': 'Vietnam',
  'phillipines': 'Philippines',
  'phillippines': 'Philippines',
  'philipines': 'Philippines',
  'columbia': 'Colombia',
  'czech': 'Czech Republic',
  'czechia': 'Czech Republic',
  "cote d'ivoire": 'Ivory Coast',
  "\u00e7\u00f4te d'ivoire": 'Ivory Coast',
  'trinidad': 'Trinidad and Tobago',
  'trinidad & tobago': 'Trinidad and Tobago',
  'trinidad tobago': 'Trinidad and Tobago',
  'macedonia': 'North Macedonia',
  'north macedonia': 'North Macedonia',
  'hong kong sar': 'Hong Kong',
  'hk': 'Hong Kong',
  'taiwan, province of china': 'Taiwan',
  'taiwan (province of china)': 'Taiwan',
  'russian federation': 'Russia',
  'ussr': 'Russia',
  'korea': 'South Korea',
  'netherlandslands': 'Netherlands',
  'the netherlands': 'Netherlands',
  'holland': 'Netherlands',
  'new zeland': 'New Zealand',
  'new zeeland': 'New Zealand',
  'singapur': 'Singapore',
  'singapour': 'Singapore',
  'switserland': 'Switzerland',
  'switerland': 'Switzerland',
  'swizterland': 'Switzerland',
  'swaziland': 'South Africa',
  'slovania': 'Slovenia',
  'slovinia': 'Slovenia',
  'austrialia': 'Australia',
  'autria': 'Austria',
  'belgum': 'Belgium',
  'belguim': 'Belgium',
  'brazile': 'Brazil',
  'bulgeria': 'Bulgaria',
  'camboida': 'Cambodia',
  'chilie': 'Chile',
  'denemark': 'Denmark',
  'egyp': 'Egypt',
  'ethopia': 'Ethiopia',
  'ethiopa': 'Ethiopia',
  'germnay': 'Germany',
  'germny': 'Germany',
  'ghanna': 'Ghana',
  'guana': 'Ghana',
  'guatamala': 'Guatemala',
  'hondurus': 'Honduras',
  'hungry': 'Hungary',
  'hunagry': 'Hungary',
  'indonisia': 'Indonesia',
  'indoneshia': 'Indonesia',
  'irseal': 'Israel',
  'isreal': 'Israel',
  'itlay': 'Italy',
  'jamica': 'Jamaica',
  'kasakhstan': 'Kazakhstan',
  'kazakhastan': 'Kazakhstan',
  'kenay': 'Kenya',
  'lativia': 'Latvia',
  'lebannon': 'Lebanon',
  'libia': 'Libya',
  'lituhania': 'Lithuania',
  'lithunia': 'Lithuania',
  'malasia': 'Malaysia',
  'malayasia': 'Malaysia',
  'marocco': 'Morocco',
  'morroco': 'Morocco',
  'morotcco': 'Morocco',
  'mexio': 'Mexico',
  'moldovia': 'Moldova',
  'mozanbique': 'Mozambique',
  'myanamar': 'Myanmar',
  'mynamar': 'Myanmar',
  'nigereia': 'Nigeria',
  'nigera': 'Nigeria',
  'noway': 'Norway',
  'pakstan': 'Pakistan',
  'philipins': 'Philippines',
  'philippins': 'Philippines',
  'polend': 'Poland',
  'portrugal': 'Portugal',
  'portugual': 'Portugal',
  'romainia': 'Romania',
  'romanina': 'Romania',
  'saudia arabia': 'Saudi Arabia',
  'saudi arabai': 'Saudi Arabia',
  'serbai': 'Serbia',
  'singpore': 'Singapore',
  'slovekia': 'Slovakia',
  'south afirca': 'South Africa',
  'spaain': 'Spain',
  'sweeden': 'Sweden',
  'swden': 'Sweden',
  'taiwain': 'Taiwan',
  'thiland': 'Thailand',
  'tailand': 'Thailand',
  'tunesia': 'Tunisia',
  'turky': 'Turkey',
  'ugana': 'Uganda',
  'ukranie': 'Ukraine',
  'uraguay': 'Uruguay',
  'vietname': 'Vietnam',
  'vietnan': 'Vietnam',
  'zimbawbe': 'Zimbabwe',
  'zimbabe': 'Zimbabwe',
}

// ─── Pure work-arrangement terms (no geographic meaning) ─────────────────────
// NOTE: Metro-area/region names (Bay Area, Greater London, etc.) are NOT here —
// they are resolved via KNOWN_REGIONS below.
const WORK_ARRANGEMENT_TERMS = new Set([
  'remote', 'hybrid', 'on-site', 'onsite', 'on site', 'wfh',
  'work from home', 'work-from-home', 'telecommute', 'telecommuting',
  'virtual', 'anywhere', 'flexible', 'distributed',
])

// ─── City-state countries (State/Province is not applicable) ─────────────────
const CITY_STATE_COUNTRIES = new Set([
  'singapore', 'hong kong', 'macau', 'macao', 'monaco', 'vatican',
  'city of vatican state', 'holy see',
])

function isCityStateCountry(country: string): boolean {
  return CITY_STATE_COUNTRIES.has(country.toLowerCase().trim())
}

// ─── Known global metro/regional areas → resolved {country, state} ───────────
// Used to accept region names in City or State columns when they can be
// unambiguously resolved to a Country + State/Province.
interface RegionDef { country: string; state: string }

const KNOWN_REGIONS: Record<string, RegionDef> = {
  // ── United States ──────────────────────────────────────────────────────────
  'bay area':                { country: 'United States', state: 'California' },
  'greater bay area':        { country: 'United States', state: 'California' },
  'silicon valley':          { country: 'United States', state: 'California' },
  'socal':                   { country: 'United States', state: 'California' },
  'so cal':                  { country: 'United States', state: 'California' },
  'southern california':     { country: 'United States', state: 'California' },
  'northern california':     { country: 'United States', state: 'California' },
  'norcal':                  { country: 'United States', state: 'California' },
  'greater los angeles':     { country: 'United States', state: 'California' },
  'los angeles metro':       { country: 'United States', state: 'California' },
  'la metro':                { country: 'United States', state: 'California' },
  'tri-state area':          { country: 'United States', state: 'New York' },
  'tri state area':          { country: 'United States', state: 'New York' },
  'greater new york':        { country: 'United States', state: 'New York' },
  'new york metro':          { country: 'United States', state: 'New York' },
  'nyc metro':               { country: 'United States', state: 'New York' },
  'chicagoland':             { country: 'United States', state: 'Illinois' },
  'greater chicago':         { country: 'United States', state: 'Illinois' },
  'chicago metro':           { country: 'United States', state: 'Illinois' },
  'dfw':                     { country: 'United States', state: 'Texas' },
  'dallas-fort worth':       { country: 'United States', state: 'Texas' },
  'dallas fort worth':       { country: 'United States', state: 'Texas' },
  'greater houston':         { country: 'United States', state: 'Texas' },
  'houston metro':           { country: 'United States', state: 'Texas' },
  'research triangle':       { country: 'United States', state: 'North Carolina' },
  'research triangle park':  { country: 'United States', state: 'North Carolina' },
  'rtp':                     { country: 'United States', state: 'North Carolina' },
  'dc metro':                { country: 'United States', state: 'Virginia' },
  'dmv':                     { country: 'United States', state: 'Virginia' },
  'greater washington':      { country: 'United States', state: 'Virginia' },
  'washington dc metro':     { country: 'United States', state: 'Virginia' },
  'greater boston':          { country: 'United States', state: 'Massachusetts' },
  'boston metro':            { country: 'United States', state: 'Massachusetts' },
  'greater seattle':         { country: 'United States', state: 'Washington' },
  'seattle metro':           { country: 'United States', state: 'Washington' },
  'puget sound':             { country: 'United States', state: 'Washington' },
  'greater miami':           { country: 'United States', state: 'Florida' },
  'miami metro':             { country: 'United States', state: 'Florida' },
  'south florida':           { country: 'United States', state: 'Florida' },
  'greater denver':          { country: 'United States', state: 'Colorado' },
  'denver metro':            { country: 'United States', state: 'Colorado' },
  'front range':             { country: 'United States', state: 'Colorado' },
  'greater phoenix':         { country: 'United States', state: 'Arizona' },
  'phoenix metro':           { country: 'United States', state: 'Arizona' },
  'greater atlanta':         { country: 'United States', state: 'Georgia' },
  'atlanta metro':           { country: 'United States', state: 'Georgia' },
  'twin cities':             { country: 'United States', state: 'Minnesota' },
  'greater minneapolis':     { country: 'United States', state: 'Minnesota' },
  'metro detroit':           { country: 'United States', state: 'Michigan' },
  'greater detroit':         { country: 'United States', state: 'Michigan' },
  'greater portland':        { country: 'United States', state: 'Oregon' },
  'portland metro':          { country: 'United States', state: 'Oregon' },
  'greater san diego':       { country: 'United States', state: 'California' },
  'san diego metro':         { country: 'United States', state: 'California' },
  // ── Canada ─────────────────────────────────────────────────────────────────
  'greater toronto area':    { country: 'Canada', state: 'Ontario' },
  'gta':                     { country: 'Canada', state: 'Ontario' },
  'greater toronto':         { country: 'Canada', state: 'Ontario' },
  'metro toronto':           { country: 'Canada', state: 'Ontario' },
  'greater vancouver':       { country: 'Canada', state: 'British Columbia' },
  'lower mainland':          { country: 'Canada', state: 'British Columbia' },
  'metro vancouver':         { country: 'Canada', state: 'British Columbia' },
  'greater montreal':        { country: 'Canada', state: 'Quebec' },
  'montreal metro':          { country: 'Canada', state: 'Quebec' },
  'greater calgary':         { country: 'Canada', state: 'Alberta' },
  'greater edmonton':        { country: 'Canada', state: 'Alberta' },
  'ottawa-gatineau':         { country: 'Canada', state: 'Ontario' },
  // ── UK & Ireland ───────────────────────────────────────────────────────────
  'greater london':          { country: 'United Kingdom', state: 'England' },
  'london metro':            { country: 'United Kingdom', state: 'England' },
  'greater manchester':      { country: 'United Kingdom', state: 'England' },
  'west midlands':           { country: 'United Kingdom', state: 'England' },
  'birmingham metro':        { country: 'United Kingdom', state: 'England' },
  'west yorkshire':          { country: 'United Kingdom', state: 'England' },
  'south yorkshire':         { country: 'United Kingdom', state: 'England' },
  'south east england':      { country: 'United Kingdom', state: 'England' },
  'home counties':           { country: 'United Kingdom', state: 'England' },
  'greater glasgow':         { country: 'United Kingdom', state: 'Scotland' },
  'scottish central belt':   { country: 'United Kingdom', state: 'Scotland' },
  'greater edinburgh':       { country: 'United Kingdom', state: 'Scotland' },
  'greater dublin':          { country: 'Ireland', state: 'Leinster' },
  // ── Germany ────────────────────────────────────────────────────────────────
  'rhine-ruhr':              { country: 'Germany', state: 'North Rhine-Westphalia' },
  'rhein-ruhr':              { country: 'Germany', state: 'North Rhine-Westphalia' },
  'ruhr area':               { country: 'Germany', state: 'North Rhine-Westphalia' },
  'ruhr':                    { country: 'Germany', state: 'North Rhine-Westphalia' },
  'greater berlin':          { country: 'Germany', state: 'Berlin' },
  'berlin metro':            { country: 'Germany', state: 'Berlin' },
  'greater munich':          { country: 'Germany', state: 'Bavaria' },
  'munich metro':            { country: 'Germany', state: 'Bavaria' },
  'greater hamburg':         { country: 'Germany', state: 'Hamburg' },
  'hamburg metro':           { country: 'Germany', state: 'Hamburg' },
  'rhine-main':              { country: 'Germany', state: 'Hesse' },
  'frankfurt metro':         { country: 'Germany', state: 'Hesse' },
  // ── France ─────────────────────────────────────────────────────────────────
  '\u00eele-de-france':      { country: 'France', state: '\u00cele-de-France' },
  'ile-de-france':           { country: 'France', state: '\u00cele-de-France' },
  'greater paris':           { country: 'France', state: '\u00cele-de-France' },
  'paris metro':             { country: 'France', state: '\u00cele-de-France' },
  // ── Netherlands ────────────────────────────────────────────────────────────
  'randstad':                { country: 'Netherlands', state: 'North Holland' },
  'greater amsterdam':       { country: 'Netherlands', state: 'North Holland' },
  // ── Belgium ────────────────────────────────────────────────────────────────
  'brussels metro':          { country: 'Belgium', state: 'Brussels' },
  'brussels capital':        { country: 'Belgium', state: 'Brussels' },
  // ── Switzerland ────────────────────────────────────────────────────────────
  'zurich metro':            { country: 'Switzerland', state: 'Zurich' },
  'greater zurich':          { country: 'Switzerland', state: 'Zurich' },
  // ── Austria ────────────────────────────────────────────────────────────────
  'vienna metro':            { country: 'Austria', state: 'Vienna' },
  'greater vienna':          { country: 'Austria', state: 'Vienna' },
  // ── Spain ──────────────────────────────────────────────────────────────────
  'greater madrid':          { country: 'Spain', state: 'Community of Madrid' },
  'madrid metro':            { country: 'Spain', state: 'Community of Madrid' },
  'greater barcelona':       { country: 'Spain', state: 'Catalonia' },
  'barcelona metro':         { country: 'Spain', state: 'Catalonia' },
  // ── Italy ──────────────────────────────────────────────────────────────────
  'greater milan':           { country: 'Italy', state: 'Lombardy' },
  'milan metro':             { country: 'Italy', state: 'Lombardy' },
  'greater rome':            { country: 'Italy', state: 'Lazio' },
  // ── Portugal ───────────────────────────────────────────────────────────────
  'greater lisbon':          { country: 'Portugal', state: 'Lisbon' },
  'lisbon metro':            { country: 'Portugal', state: 'Lisbon' },
  // ── Poland ─────────────────────────────────────────────────────────────────
  'greater warsaw':          { country: 'Poland', state: 'Masovian' },
  'warsaw metro':            { country: 'Poland', state: 'Masovian' },
  // ── Czech Republic ─────────────────────────────────────────────────────────
  'greater prague':          { country: 'Czech Republic', state: 'Prague' },
  'prague metro':            { country: 'Czech Republic', state: 'Prague' },
  // ── Hungary ────────────────────────────────────────────────────────────────
  'greater budapest':        { country: 'Hungary', state: 'Budapest' },
  // ── Romania ────────────────────────────────────────────────────────────────
  'greater bucharest':       { country: 'Romania', state: 'Ilfov' },
  // ── Greece ─────────────────────────────────────────────────────────────────
  'greater athens':          { country: 'Greece', state: 'Attica' },
  'athens metro':            { country: 'Greece', state: 'Attica' },
  // ── Turkey ─────────────────────────────────────────────────────────────────
  'greater istanbul':        { country: 'Turkey', state: 'Istanbul' },
  'istanbul metro':          { country: 'Turkey', state: 'Istanbul' },
  // ── Nordics ────────────────────────────────────────────────────────────────
  'greater stockholm':       { country: 'Sweden', state: 'Stockholm' },
  'stockholm metro':         { country: 'Sweden', state: 'Stockholm' },
  'greater oslo':            { country: 'Norway', state: 'Oslo' },
  'greater copenhagen':      { country: 'Denmark', state: 'Capital Region' },
  'copenhagen metro':        { country: 'Denmark', state: 'Capital Region' },
  'greater helsinki':        { country: 'Finland', state: 'Uusimaa' },
  // ── Australia ──────────────────────────────────────────────────────────────
  'greater sydney':          { country: 'Australia', state: 'New South Wales' },
  'sydney metro':            { country: 'Australia', state: 'New South Wales' },
  'greater melbourne':       { country: 'Australia', state: 'Victoria' },
  'melbourne metro':         { country: 'Australia', state: 'Victoria' },
  'greater brisbane':        { country: 'Australia', state: 'Queensland' },
  'brisbane metro':          { country: 'Australia', state: 'Queensland' },
  'greater perth':           { country: 'Australia', state: 'Western Australia' },
  'greater adelaide':        { country: 'Australia', state: 'South Australia' },
  // ── New Zealand ────────────────────────────────────────────────────────────
  'greater auckland':        { country: 'New Zealand', state: 'Auckland' },
  'auckland metro':          { country: 'New Zealand', state: 'Auckland' },
  // ── India ──────────────────────────────────────────────────────────────────
  'delhi ncr':               { country: 'India', state: 'Delhi' },
  'ncr':                     { country: 'India', state: 'Delhi' },
  'national capital region': { country: 'India', state: 'Delhi' },
  'greater mumbai':          { country: 'India', state: 'Maharashtra' },
  'mumbai metro':            { country: 'India', state: 'Maharashtra' },
  'mumbai metropolitan':     { country: 'India', state: 'Maharashtra' },
  'greater bangalore':       { country: 'India', state: 'Karnataka' },
  'bengaluru metro':         { country: 'India', state: 'Karnataka' },
  'bangalore metro':         { country: 'India', state: 'Karnataka' },
  'greater hyderabad':       { country: 'India', state: 'Telangana' },
  'hyderabad metro':         { country: 'India', state: 'Telangana' },
  'greater chennai':         { country: 'India', state: 'Tamil Nadu' },
  'chennai metro':           { country: 'India', state: 'Tamil Nadu' },
  'greater kolkata':         { country: 'India', state: 'West Bengal' },
  'greater pune':            { country: 'India', state: 'Maharashtra' },
  // ── China ──────────────────────────────────────────────────────────────────
  'greater beijing':         { country: 'China', state: 'Beijing' },
  'beijing metro':           { country: 'China', state: 'Beijing' },
  'greater shanghai':        { country: 'China', state: 'Shanghai' },
  'shanghai metro':          { country: 'China', state: 'Shanghai' },
  'pearl river delta':       { country: 'China', state: 'Guangdong' },
  'greater guangzhou':       { country: 'China', state: 'Guangdong' },
  'greater shenzhen':        { country: 'China', state: 'Guangdong' },
  // ── Japan ──────────────────────────────────────────────────────────────────
  'greater tokyo':           { country: 'Japan', state: 'Tokyo' },
  'tokyo metro':             { country: 'Japan', state: 'Tokyo' },
  'kanto':                   { country: 'Japan', state: 'Tokyo' },
  'keihanshin':              { country: 'Japan', state: 'Osaka' },
  'greater osaka':           { country: 'Japan', state: 'Osaka' },
  // ── South Korea ────────────────────────────────────────────────────────────
  'greater seoul':           { country: 'South Korea', state: 'Seoul' },
  'seoul metro':             { country: 'South Korea', state: 'Seoul' },
  'seoul capital area':      { country: 'South Korea', state: 'Seoul' },
  // ── Southeast Asia ─────────────────────────────────────────────────────────
  'greater jakarta':         { country: 'Indonesia', state: 'Jakarta' },
  'jabodetabek':             { country: 'Indonesia', state: 'Jakarta' },
  'metro manila':            { country: 'Philippines', state: 'Metro Manila' },
  'greater manila':          { country: 'Philippines', state: 'Metro Manila' },
  'klang valley':            { country: 'Malaysia', state: 'Selangor' },
  'greater kuala lumpur':    { country: 'Malaysia', state: 'Kuala Lumpur' },
  'greater bangkok':         { country: 'Thailand', state: 'Bangkok' },
  'bangkok metro':           { country: 'Thailand', state: 'Bangkok' },
  // ── Middle East ────────────────────────────────────────────────────────────
  'greater dubai':           { country: 'UAE', state: 'Dubai' },
  'dubai metro':             { country: 'UAE', state: 'Dubai' },
  'greater abu dhabi':       { country: 'UAE', state: 'Abu Dhabi' },
  'riyadh metro':            { country: 'Saudi Arabia', state: 'Riyadh' },
  'greater tel aviv':        { country: 'Israel', state: 'Tel Aviv' },
  'gush dan':                { country: 'Israel', state: 'Tel Aviv' },
  'tel aviv metro':          { country: 'Israel', state: 'Tel Aviv' },
  // ── Pakistan ───────────────────────────────────────────────────────────────
  'greater karachi':         { country: 'Pakistan', state: 'Sindh' },
  'greater lahore':          { country: 'Pakistan', state: 'Punjab' },
  // ── Bangladesh ─────────────────────────────────────────────────────────────
  'dhaka metro':             { country: 'Bangladesh', state: 'Dhaka' },
  // ── Africa ─────────────────────────────────────────────────────────────────
  'greater nairobi':         { country: 'Kenya', state: 'Nairobi' },
  'greater lagos':           { country: 'Nigeria', state: 'Lagos' },
  'greater accra':           { country: 'Ghana', state: 'Greater Accra' },
  'greater johannesburg':    { country: 'South Africa', state: 'Gauteng' },
  'cape town metro':         { country: 'South Africa', state: 'Western Cape' },
  'greater cape town':       { country: 'South Africa', state: 'Western Cape' },
  'greater cairo':           { country: 'Egypt', state: 'Cairo' },
  'greater casablanca':      { country: 'Morocco', state: 'Grand Casablanca-Settat' },
  // ── South America ──────────────────────────────────────────────────────────
  'greater sao paulo':       { country: 'Brazil', state: 'S\u00e3o Paulo' },
  'sao paulo metro':         { country: 'Brazil', state: 'S\u00e3o Paulo' },
  'greater rio de janeiro':  { country: 'Brazil', state: 'Rio de Janeiro' },
  'rio metro':               { country: 'Brazil', state: 'Rio de Janeiro' },
  'greater buenos aires':    { country: 'Argentina', state: 'Buenos Aires Province' },
  'bogota metro':            { country: 'Colombia', state: 'Bogot\u00e1 D.C.' },
  'greater bogota':          { country: 'Colombia', state: 'Bogot\u00e1 D.C.' },
  'lima metro':              { country: 'Peru', state: 'Lima' },
  'greater lima':            { country: 'Peru', state: 'Lima' },
  'greater santiago':        { country: 'Chile', state: 'Santiago Metropolitan' },
  'santiago metro':          { country: 'Chile', state: 'Santiago Metropolitan' },
  // ── Mexico ─────────────────────────────────────────────────────────────────
  'greater mexico city':     { country: 'Mexico', state: 'Mexico City' },
  'cdmx metro':              { country: 'Mexico', state: 'Mexico City' },
  'guadalajara metro':       { country: 'Mexico', state: 'Jalisco' },
  'monterrey metro':         { country: 'Mexico', state: 'Nuevo Le\u00f3n' },
}

// ─── Valid US state names & abbreviations (lowercase keys) ───────────────────
const US_STATES: Record<string, string> = {
  // Full names
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
  'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
  'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS',
  'missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV',
  'new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY',
  'north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
  'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI',
  'wyoming':'WY','district of columbia':'DC','washington d.c.':'DC',
  'washington dc':'DC','d.c.':'DC',
  // 2-letter abbreviations
  'al':'AL','ak':'AK','az':'AZ','ar':'AR','ca':'CA','co':'CO','ct':'CT',
  'de':'DE','fl':'FL','ga':'GA','hi':'HI','id':'ID','il':'IL','in':'IN',
  'ia':'IA','ks':'KS','ky':'KY','la':'LA','me':'ME','md':'MD','ma':'MA',
  'mi':'MI','mn':'MN','ms':'MS','mo':'MO','mt':'MT','ne':'NE','nv':'NV',
  'nh':'NH','nj':'NJ','nm':'NM','ny':'NY','nc':'NC','nd':'ND','oh':'OH',
  'ok':'OK','or':'OR','pa':'PA','ri':'RI','sc':'SC','sd':'SD','tn':'TN',
  'tx':'TX','ut':'UT','vt':'VT','va':'VA','wa':'WA','wv':'WV','wi':'WI',
  'wy':'WY','dc':'DC',
}

function isUSCountry(raw: string): boolean {
  const v = raw.trim().toUpperCase()
  return v === 'US' || v === 'USA' || v === 'UNITED STATES' || v === 'U.S.' || v === 'U.S.A.' || v === 'AMERICA'
}

// ─── Region resolution ───────────────────────────────────────────────────────
// Returns a RegionDef if the term is a known global region (hardcoded map),
// or if it appears elsewhere in the document with Country + State context.
function resolveRegion(
  term: string,
  docRegionMap: Map<string, RegionDef>
): RegionDef | null {
  const lower = term.toLowerCase().trim()
  if (KNOWN_REGIONS[lower]) return KNOWN_REGIONS[lower]
  if (docRegionMap.has(lower)) return docRegionMap.get(lower)!
  return null
}

// ─── Document-level location validation ──────────────────────────────────────
// Validates all location rows as a unit so that region names found anywhere in
// the document can provide context for other rows in the same file.
//
// Rules:
//   • Country is required (can be satisfied by resolving a region in City/State)
//   • State/Province is required unless the country is a city-state or the
//     City column resolves to a known region that provides the state
//   • City is optional (bonus)
//   • Work-arrangement terms (remote, hybrid, etc.) are always flagged
//   • Known region names (Bay Area, Greater London, etc.) are accepted when they
//     resolve to Country + State via hardcoded map or document context

interface LocationRowInput {
  rowNum: number
  city: string
  state: string
  country: string
}

function validateAllLocationRows(rows: LocationRowInput[]): string[] {
  // ── Phase 1: Build document context ─────────────────────────────────────
  // Collect (city_term → {country, state}) from rows that have full context,
  // so those terms can resolve ambiguous rows elsewhere in the document.
  const docRegionMap = new Map<string, RegionDef>()
  for (const row of rows) {
    const cityL  = row.city.trim().toLowerCase()
    const stateL = row.state.trim().toLowerCase()
    const countryT = row.country.trim()
    if (countryT && stateL && cityL && !WORK_ARRANGEMENT_TERMS.has(cityL)) {
      // This row fully defines a city within a country+state — record it
      docRegionMap.set(cityL, { country: countryT, state: row.state.trim() })
    }
    if (countryT && stateL && !WORK_ARRANGEMENT_TERMS.has(stateL)) {
      // Also record the state term itself (catches state-column region names)
      docRegionMap.set(stateL, { country: countryT, state: row.state.trim() })
    }
  }

  // ── Phase 2: Validate each row ───────────────────────────────────────────
  const warnings: string[] = []
  for (const row of rows) {
    warnings.push(...validateSingleRow(row, docRegionMap))
  }
  return warnings
}

function validateSingleRow(
  row: LocationRowInput,
  docRegionMap: Map<string, RegionDef>
): string[] {
  const warnings: string[] = []
  const cityL    = row.city.trim().toLowerCase()
  const stateL   = row.state.trim().toLowerCase()
  const countryT = row.country.trim()

  // Resolve any region terms present in city or state columns
  const cityRegion  = cityL  && !WORK_ARRANGEMENT_TERMS.has(cityL)  ? resolveRegion(cityL, docRegionMap)  : null
  const stateRegion = stateL && !WORK_ARRANGEMENT_TERMS.has(stateL) ? resolveRegion(stateL, docRegionMap) : null

  // ── 1. Work-arrangement terms ────────────────────────────────────────────
  if (cityL && WORK_ARRANGEMENT_TERMS.has(cityL)) {
    warnings.push(
      `Row ${row.rowNum}: City column contains "${row.city}" — this is a work-arrangement term, not a location. ` +
      `Please enter a real city name.`
    )
  }
  if (stateL && WORK_ARRANGEMENT_TERMS.has(stateL)) {
    warnings.push(
      `Row ${row.rowNum}: State/Province column contains "${row.state}" — this is a work-arrangement term, not a location. ` +
      `Please enter a valid state, province, or administrative region.`
    )
  }

  // ── 2. Country required ──────────────────────────────────────────────────
  // A row is ok if it has an explicit Country OR a city/state term that
  // resolves unambiguously to a country via hardcoded map / document context.
  const effectiveCountry = countryT || cityRegion?.country || stateRegion?.country || ''
  if (!effectiveCountry) {
    warnings.push(
      `Row ${row.rowNum}: Country is required — please enter a valid country name.`
    )
  }

  // ── 3. State / Province required ────────────────────────────────────────
  // Skip for city-state countries (Singapore, Hong Kong, etc.).
  // A region term in the City column that resolves to a state satisfies this.
  if (!WORK_ARRANGEMENT_TERMS.has(stateL)) {
    const effectiveState = stateL || cityRegion?.state || stateRegion?.state || ''
    if (!effectiveState && !isCityStateCountry(effectiveCountry)) {
      warnings.push(
        `Row ${row.rowNum}: State/Province is required — please enter a valid state, province, or administrative region.`
      )
    }
  }

  // ── 4. US state validation ───────────────────────────────────────────────
  // Only run when the effective country is USA and the state column has a value
  // that is not a known region (which would have already resolved it above).
  if (stateL && !WORK_ARRANGEMENT_TERMS.has(stateL) && !stateRegion) {
    if (isUSCountry(effectiveCountry) && !US_STATES[stateL]) {
      warnings.push(
        `Row ${row.rowNum}: State "${row.state}" is not a recognised US state name or abbreviation.`
      )
    }
  }

  return warnings
}

// ─── Levenshtein distance ────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

// ─── Main resolver ───────────────────────────────────────────────────────────
function resolveCountry(
  raw: string,
  dbCountries: DBCountry[]
): { id: number | null; name: string; confidence: ParsedCountry['confidence'] } {
  if (!raw || !raw.trim()) return { id: null, name: raw, confidence: 'unmatched' }

  const trimmed = raw.trim()
  const upper = trimmed.toUpperCase()
  const lower = trimmed.toLowerCase()

  // For short codes (2–3 chars), ISO lookups take priority over exact DB match
  // so "US" → "United States" (id:72) not "US" (id:68), avoiding false duplicates

  // 1a. ISO 2-letter code (checked FIRST for 2-char inputs)
  if (upper.length === 2 && ISO2[upper]) {
    const canonical = ISO2[upper]
    const match = dbCountries.find(c => c.name.toLowerCase() === canonical.toLowerCase())
    if (match) return { id: match.id, name: match.name, confidence: 'iso2' }
  }

  // 1b. ISO 3-letter code (checked FIRST for 3-char inputs)
  if (upper.length === 3 && ISO3[upper]) {
    const canonical = ISO3[upper]
    const match = dbCountries.find(c => c.name.toLowerCase() === canonical.toLowerCase())
    if (match) return { id: match.id, name: match.name, confidence: 'iso3' }
  }

  // 2. Exact DB match (case-insensitive) — used for longer inputs and codes not in ISO maps
  const exact = dbCountries.find(c => c.name.toLowerCase() === lower)
  if (exact) return { id: exact.id, name: exact.name, confidence: 'exact' }

  // 4. Alias map
  if (ALIASES[lower]) {
    const canonical = ALIASES[lower]
    const match = dbCountries.find(c => c.name.toLowerCase() === canonical.toLowerCase())
    if (match) return { id: match.id, name: match.name, confidence: 'alias' }
    // Alias points to a name not in DB — try exact on canonical anyway
    return { id: null, name: canonical, confidence: 'alias' }
  }

  // 5. Fuzzy Levenshtein match
  const maxDist = lower.length <= 5 ? 1 : lower.length <= 10 ? 2 : 3
  let bestMatch: DBCountry | null = null
  let bestDist = Infinity
  for (const c of dbCountries) {
    const dist = levenshtein(lower, c.name.toLowerCase())
    if (dist < bestDist) {
      bestDist = dist
      bestMatch = c
    }
  }
  if (bestMatch && bestDist <= maxDist) {
    return { id: bestMatch.id, name: bestMatch.name, confidence: 'fuzzy' }
  }

  // 6. Unresolved
  return { id: null, name: trimmed, confidence: 'unmatched' }
}

// ─── Template-specific parsers ────────────────────────────────────────────────

/**
 * Parse "Pay Intel (Rate Card)" — sheet: "Rate Request"
 * Country col header: "Country *"  (col index ~7)
 * Job Title col header: "Job Title*" (col index ~3)
 * Data starts row 2 (0-indexed row 1 = headers)
 */
function parseRateCard(
  wb: XLSX.WorkBook,
  dbCountries: DBCountry[]
): TemplateParseResult {
  const ws = wb.Sheets['Rate Request']
  if (!ws) {
    return { countries: [], totalJobs: 0, unmatched: [], parseWarnings: ['Sheet "Rate Request" not found in file.'], locationWarnings: [] }
  }

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (rows.length < 2) {
    return { countries: [], totalJobs: 0, unmatched: [], parseWarnings: ['No data rows found.'], locationWarnings: [] }
  }

  // Find column indices from header row
  const headerRow = (rows[0] as string[]).map(h => String(h).trim().toLowerCase())
  const countryColIdx  = headerRow.findIndex(h => h.includes('country'))
  const jobTitleColIdx = headerRow.findIndex(h => h.includes('job title'))
  const stateColIdx    = headerRow.findIndex(h => h === 'state' || h.includes('state/province'))
  const cityColIdx     = headerRow.findIndex(h => h === 'city' || h.includes('city'))

  if (countryColIdx === -1) {
    return { countries: [], totalJobs: 0, unmatched: [], parseWarnings: ['Could not find "Country" column in Rate Request sheet.'], locationWarnings: [] }
  }

  const countryCounts: Record<string, number> = {}
  let totalJobs = 0

  // ── Collect all data rows for document-level location validation ──────────
  const locationRows: LocationRowInput[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const jobTitle = jobTitleColIdx !== -1 ? String(row[jobTitleColIdx] ?? '').trim() : 'x'
    if (!jobTitle) continue  // skip empty rows

    const rawCountry = String(row[countryColIdx] ?? '').trim()
    const rawCity    = cityColIdx  !== -1 ? String(row[cityColIdx]  ?? '').trim() : ''
    const rawState   = stateColIdx !== -1 ? String(row[stateColIdx] ?? '').trim() : ''

    // Always collect for location validation (even rows with empty country)
    locationRows.push({ rowNum: i + 1, city: rawCity, state: rawState, country: rawCountry })

    // Country counting — preserve existing behaviour (only rows with country)
    if (!rawCountry) continue
    countryCounts[rawCountry] = (countryCounts[rawCountry] ?? 0) + 1
    totalJobs++
  }

  // Run document-level validation (all rows scanned together)
  const locationWarnings = validateAllLocationRows(locationRows)

  const result = buildResult(countryCounts, totalJobs, dbCountries)
  result.locationWarnings = locationWarnings
  return result
}

/**
 * Parse "Pay Intel (Right Sourcing)" — sheet: "Rate Request"
 * Country col header: "Country"  (col index ~9)
 * Job Title col header: "Job Title" (col index ~5)
 */
function parseRightSourcing(
  wb: XLSX.WorkBook,
  dbCountries: DBCountry[]
): TemplateParseResult {
  // Same structure as Rate Card, same sheet — reuse
  return parseRateCard(wb, dbCountries)
}

/**
 * Parse "Magnit VMS" — sheet: "Wand template SEND"
 * Headers on row index 1 (row 2 in Excel), data from row index 2
 * Job Title col header: "Job Title"
 * No country column — just count total jobs
 */
function parseMagnitVMS(
  wb: XLSX.WorkBook,
  dbCountries: DBCountry[]
): TemplateParseResult {
  // Try common sheet name variants
  const sheetName = wb.SheetNames.find(n =>
    n.toLowerCase().includes('wand') || n.toLowerCase().includes('template')
  ) ?? wb.SheetNames[0]

  const ws = wb.Sheets[sheetName]
  if (!ws) {
    return { countries: [], totalJobs: 0, unmatched: [], parseWarnings: [`Sheet not found. Available: ${wb.SheetNames.join(', ')}`], locationWarnings: [] }
  }

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Find header row (row 0 or 1)
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    const r = rows[i] as string[]
    if (r.some(c => String(c).toLowerCase().includes('job title'))) {
      headerRowIdx = i
      break
    }
  }

  const headerRow = (rows[headerRowIdx] as string[]).map(h => String(h).trim().toLowerCase())
  const jobTitleColIdx = headerRow.findIndex(h => h.includes('job title'))
  const countryColIdx  = headerRow.findIndex(h => h.includes('country'))

  let totalJobs = 0
  const countryCounts: Record<string, number> = {}

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const jobTitle = jobTitleColIdx !== -1 ? String(row[jobTitleColIdx] ?? '').trim() : String(row[0] ?? '').trim()
    if (!jobTitle) continue
    totalJobs++

    if (countryColIdx !== -1) {
      const rawCountry = String(row[countryColIdx] ?? '').trim()
      if (rawCountry) {
        countryCounts[rawCountry] = (countryCounts[rawCountry] ?? 0) + 1
      }
    }
  }

  if (Object.keys(countryCounts).length === 0 && totalJobs > 0) {
    // No country column — return total only
    return {
      countries: [],
      totalJobs,
      unmatched: [],
      parseWarnings: [`Found ${totalJobs} job title(s). No Country column found — please add countries manually.`],
      locationWarnings: [],
    }
  }

  return buildResult(countryCounts, totalJobs, dbCountries)
}

// ─── Build result from raw country counts ────────────────────────────────────
function buildResult(
  countryCounts: Record<string, number>,
  totalJobs: number,
  dbCountries: DBCountry[]
): TemplateParseResult {
  // Resolve all raw names, then deduplicate by resolved key (id or lower-cased name)
  // so that "US" + "United States" both resolve to "United States" and get merged
  const mergeMap = new Map<string, ParsedCountry>()

  for (const [rawName, jobCount] of Object.entries(countryCounts)) {
    const resolved = resolveCountry(rawName, dbCountries)
    // Use id as dedup key when available, otherwise normalised resolved name
    const dedupeKey = resolved.id != null
      ? `id:${resolved.id}`
      : `name:${resolved.name.toLowerCase()}`

    const existing = mergeMap.get(dedupeKey)
    if (existing) {
      // Merge: sum job counts; prefer the higher-confidence resolution
      const confidenceRank = { exact: 5, iso2: 4, iso3: 4, alias: 3, fuzzy: 2, unmatched: 1 }
      existing.jobCount += jobCount
      if (confidenceRank[resolved.confidence] > confidenceRank[existing.confidence]) {
        existing.rawName = rawName
        existing.confidence = resolved.confidence
      }
    } else {
      mergeMap.set(dedupeKey, {
        rawName,
        resolvedId: resolved.id,
        resolvedName: resolved.name,
        jobCount,
        confidence: resolved.confidence,
      })
    }
  }

  const countries = Array.from(mergeMap.values())
  const unmatched: string[] = []
  for (const c of countries) {
    if (c.confidence === 'unmatched') unmatched.push(c.rawName)
  }

  // Sort: matched first, then unmatched; within each group sort by jobCount desc
  countries.sort((a, b) => {
    if (a.confidence === 'unmatched' && b.confidence !== 'unmatched') return 1
    if (a.confidence !== 'unmatched' && b.confidence === 'unmatched') return -1
    return b.jobCount - a.jobCount
  })

  return { countries, totalJobs, unmatched, parseWarnings: [], locationWarnings: [] }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function parseTemplateFile(
  file: File,
  projectType: string,
  dbCountries: DBCountry[]
): Promise<TemplateParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })

        const lower = projectType.toLowerCase()
        let result: TemplateParseResult

        if (lower.includes('right sourcing') || lower.includes('rightsourcing')) {
          result = parseRightSourcing(wb, dbCountries)
        } else if (lower.includes('rate card') || lower.includes('ratecard') || lower.includes('pay intel')) {
          result = parseRateCard(wb, dbCountries)
        } else if (lower.includes('magnit') || lower.includes('vms')) {
          result = parseMagnitVMS(wb, dbCountries)
        } else {
          // Unknown type — try Rate Card first, fallback to any sheet
          result = parseRateCard(wb, dbCountries)
          if (result.totalJobs === 0) {
            result = parseMagnitVMS(wb, dbCountries)
          }
        }

        resolve(result)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error(`Failed to read file: ${reader.error?.message ?? reader.error?.code ?? 'unknown FileReader error'}`))
    reader.readAsArrayBuffer(file)
  })
}
