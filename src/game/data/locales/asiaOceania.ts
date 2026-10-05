// Locale profiles for Asia and Oceania (see data/locales.ts for field meanings).
//
// Patterns may use {place} {honoree} {city} {n}. Place words lean on names a local would
// recognize (districts, rivers, the generic words schools and streets are really named with),
// and honorees are the heroes, writers and founders that schools and streets actually carry.
import type { LocaleProfile } from '../locales'

export const ASIA_OCEANIA_LOCALES: Record<string, LocaleProfile> = {
  // Afghanistan: Kabul neighborhoods, Dari/Pashto school and street conventions, the Kankor.
  af: {
    countryId: 'af',
    placeWords: [
      'Shahr-e Naw', 'Wazir Akbar Khan', 'Khair Khana', 'Karte Parwan', 'Karte Seh', 'Macroyan',
      'Kote Sangi', 'Paghman', 'Darulaman', 'Dasht-e Barchi', 'Arghandab', 'Injil', 'Balkh', 'Panjshir',
    ],
    honorees: [
      'Malalai', 'Rabia Balkhi', 'Khushal Khan Khattak', 'Ahmad Shah Baba', 'Mirwais Khan Hotak',
      'Ghazi Amanullah Khan', 'Sayed Jamaluddin Afghani', 'Khwaja Abdullah Ansari', 'Abdul Rahman Jami',
    ],
    schoolNames: {
      primary: ['{place} Primary School', '{honoree} Primary School', '{city} Primary School No. {n}'],
      middle: ['{place} Middle School', '{honoree} Middle School'],
      high: ['{honoree} High School', '{place} High School', 'Lycée {honoree}'],
    },
    universityNames: ['{city} University', '{honoree} University', '{city} Polytechnic University'],
    streetNames: ['Jada-e {honoree}', '{place} Road', '{honoree} Watt'],
    terms: {
      primary: 'primary school',
      middle: 'middle school',
      high: 'high school',
      university: 'university',
      finalExam: 'the Kankor',
      schoolDance: 'the graduation party',
      licenseOffice: 'the traffic department',
      emergencyNumber: '119',
    },
    getaways: ['Bamyan', 'Paghman', 'the Band-e Amir lakes', 'the Panjshir Valley', 'Qargha Lake', 'Mazar-i-Sharif', 'Istalif'],
    holidays: ['Eid al-Fitr', 'Eid al-Adha', 'Nowruz', 'Ramadan', 'Independence Day', 'Mawlid'],
    foods: [
      'Kabuli pulao', 'mantu', 'ashak', 'bolani', 'chapli kebab', 'shorwa', 'shor nakhod',
      'qorma with naan', 'sheer yakh', 'fried fish with jalebi', 'firni',
    ],
    drinks: ['green tea', 'sheer chai', 'doogh'],
    sports: ['cricket', 'soccer', 'buzkashi', 'volleyball', 'wrestling'],
    transport: ['a Corolla taxi', 'a minibus', 'a rickshaw', 'the Millie Bus'],
    climate: 'arid',
    snow: true,
    landmarks: [
      'the Blue Mosque in Mazar-i-Sharif', 'the Band-e Amir lakes', 'the Darul Aman Palace', 'the Babur Gardens',
      'the Herat Citadel', 'the Minaret of Jam', 'the Friday Mosque of Herat', 'the Bamyan cliffs',
    ],
    hangouts: ['the bazaar', 'a teahouse', 'Chicken Street', 'the Babur Gardens', 'a kebab stall', 'Qargha Lake'],
    dateSpots: ['a family restaurant', 'the Babur Gardens', 'an ice cream shop', 'the kite-flying hill', 'Qargha Lake'],
  },

  // Bangladesh: Dhaka's Roads and Avenues, government primaries, "college" for classes 11-12.
  bd: {
    countryId: 'bd',
    placeWords: [
      'Dhanmondi', 'Gulshan', 'Uttara', 'Mirpur', 'Mohammadpur', 'Banani', 'Motijheel', 'Lalbagh',
      'Tejgaon', 'Shantinagar', 'Agrabad', 'Nasirabad', 'Zindabazar', 'Ramna', 'Buriganga', 'Padma',
    ],
    honorees: [
      'Kazi Nazrul Islam', 'Begum Rokeya', 'Rabindranath Tagore', 'Sher-e-Bangla', 'Shaheed Titumir',
      'Jagadish Chandra Bose', 'Jibanananda Das', 'Pritilata Waddedar', 'Lalon Shah', 'Shaheed Suhrawardy',
    ],
    schoolNames: {
      primary: ['{place} Government Primary School', '{place} Model School', '{place} Ideal School'],
      middle: ['{place} High School', '{place} Pilot High School', '{honoree} High School'],
      high: ['{city} College', 'Government {honoree} College', '{place} Model College'],
    },
    universityNames: ['University of {city}', '{city} University of Engineering and Technology', '{honoree} University'],
    streetNames: ['{honoree} Road', '{place} Road', 'Road {n}, {place}'],
    terms: {
      primary: 'primary school',
      middle: 'high school',
      high: 'college',
      university: 'university',
      finalExam: 'the HSC exams',
      schoolDance: 'Rag Day',
      licenseOffice: 'the BRTA office',
      emergencyNumber: '999',
    },
    getaways: [
      "Cox's Bazar", 'Sylhet', "Saint Martin's Island", 'Bandarban', 'Sajek Valley', 'the Sundarbans', 'Kuakata', 'Srimangal',
    ],
    holidays: ['Eid ul-Fitr', 'Eid ul-Adha', 'Pohela Boishakh', 'Ramadan', 'Durga Puja', 'Victory Day', 'Ekushey February'],
    foods: [
      'kacchi biryani', 'ilish curry', 'bhorta and rice', 'fuchka', 'chotpoti', 'khichuri', 'beef tehari',
      'pitha', 'mishti doi', 'panta bhat', 'jhalmuri', 'haleem',
    ],
    drinks: ['milk tea', 'borhani', 'lassi', 'sugarcane juice'],
    sports: ['cricket', 'soccer', 'kabaddi', 'badminton', 'carrom'],
    transport: ['a rickshaw', 'a CNG', 'a packed local bus', 'the launch', 'the metro rail'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'the Sundarbans', 'Lalbagh Fort', 'Ahsan Manzil', 'the National Parliament House', 'the Shaheed Minar',
      "Cox's Bazar beach", 'the Sixty Dome Mosque', 'Paharpur',
    ],
    hangouts: ['a tong tea stall', 'Hatirjheel', 'Dhanmondi Lake', 'a fuchka stand', 'the shopping mall', 'the rooftop'],
    dateSpots: ['Dhanmondi Lake', 'Hatirjheel', 'a fuchka stand', 'a rooftop restaurant', 'the cinema', 'Ramna Park'],
  },

  // China: numbered and "experimental" schools, the gaokao, Zhongshan Road in every city.
  cn: {
    countryId: 'cn',
    placeWords: [
      'Chaoyang', 'Haidian', 'Xicheng', 'Pudong', 'Xuhui', "Jing'an", 'Tianhe', 'Futian',
      'Nanshan', 'Wuchang', 'Jinjiang', 'Yuzhong', 'Xihu', 'Gulou', 'Hongkou', 'Huangpu',
    ],
    honorees: [
      'Lu Xun', 'Sun Yat-sen', 'Cai Yuanpei', 'Tao Xingzhi', 'Zhan Tianyou', 'Soong Ching-ling',
      'Lin Zexu', 'Zheng He', 'Hua Luogeng',
    ],
    schoolNames: {
      primary: ['{place} Experimental Primary School', '{place} No. {n} Primary School', '{place} Road Primary School'],
      middle: ['{city} No. {n} Middle School', '{place} Foreign Languages School', '{honoree} Middle School'],
      high: ['{city} No. {n} High School', '{city} Experimental High School', 'High School Affiliated to {city} Normal University'],
    },
    universityNames: [
      '{city} University', '{city} Normal University', '{city} University of Technology', '{city} University of Science and Technology',
    ],
    streetNames: ['{place} Road', 'Zhongshan Road', 'Renmin Road', 'Jiefang Road'],
    terms: {
      primary: 'primary school',
      middle: 'junior high',
      high: 'senior high',
      university: 'university',
      finalExam: 'the gaokao',
      schoolDance: 'the graduation banquet',
      licenseOffice: 'the driving school',
      emergencyNumber: '120',
    },
    getaways: ['Sanya', 'Lijiang', 'Dali', 'Guilin', 'Hangzhou', 'Xiamen', 'Jiuzhaigou', 'Qingdao'],
    holidays: [
      'Chinese New Year', 'the Mid-Autumn Festival', 'National Day', 'the Dragon Boat Festival', 'the Lantern Festival',
      'Qingming', 'Qixi', "Singles' Day",
    ],
    foods: [
      'dumplings', 'hot pot', 'jianbing', 'xiaolongbao', 'beef noodles', 'mapo tofu', 'Peking duck',
      'baozi', 'malatang', 'kung pao chicken', 'congee', 'lamb skewers',
    ],
    drinks: ['green tea', 'baijiu', 'milk tea', 'a glass of hot water'],
    sports: ['basketball', 'table tennis', 'badminton', 'soccer', 'volleyball'],
    transport: ['the subway', 'a shared bike', 'an electric scooter', 'the bus', 'the high-speed train'],
    climate: 'temperate',
    snow: true,
    landmarks: [
      'the Great Wall', 'the Forbidden City', 'the Bund', 'the Terracotta Army', 'West Lake',
      'the Summer Palace', 'the Li River', 'the Potala Palace',
    ],
    hangouts: ['a KTV', 'an internet café', 'the mall', 'a hot pot restaurant', 'the square', 'a night market'],
    dateSpots: ['a bubble tea shop', 'a KTV', 'the cinema', 'a hot pot restaurant', 'the riverside promenade', 'an escape room'],
  },

  // Hong Kong: Tung Wah and Po Leung Kuk schools, the DSE, grad din, cha chaan tengs.
  hk: {
    countryId: 'hk',
    placeWords: [
      'Wan Chai', 'Sham Shui Po', 'Kwun Tong', 'Tai Koo', 'Happy Valley', 'Kowloon Tong', 'Wong Tai Sin',
      'Sai Ying Pun', 'Shek Kip Mei', 'Ma On Shan', 'Tin Shui Wai', 'Aberdeen', 'North Point', 'Lai Chi Kok',
      'Yau Ma Tei', 'Diamond Hill',
    ],
    honorees: [
      'Sir Ellis Kadoorie', 'Sir Robert Ho Tung', 'Tang Shiu Kin', 'Sun Yat-sen', 'Wong Fut Nam',
      'Lady Ho Tung', 'Ho Fung', 'Kwok Tak Seng',
    ],
    schoolNames: {
      primary: ['{place} Government Primary School', 'TWGHs {honoree} Primary School', '{place} Catholic Primary School'],
      middle: ['{place} Government Secondary School', 'TWGHs {honoree} College', '{place} Methodist College'],
      high: ['Po Leung Kuk {honoree} College', '{place} Catholic Secondary School', '{honoree} Memorial College'],
    },
    universityNames: [
      'University of Hong Kong', 'Chinese University of Hong Kong', 'Hong Kong Polytechnic University',
      'City University of Hong Kong', 'Hong Kong Baptist University',
    ],
    streetNames: ['{place} Road', '{place} Street', '{honoree} Road'],
    terms: {
      primary: 'primary school',
      middle: 'secondary school',
      high: 'secondary school',
      university: 'university',
      finalExam: 'the DSE',
      schoolDance: 'grad din',
      licenseOffice: 'the Transport Department',
      emergencyNumber: '999',
    },
    getaways: ['Macau', 'Cheung Chau', 'Lamma Island', 'Sai Kung', 'Lantau', 'Taipei', 'Tokyo'],
    holidays: [
      'Chinese New Year', 'the Mid-Autumn Festival', 'Christmas', 'the Dragon Boat Festival', 'Ching Ming',
      'Easter', 'Chung Yeung',
    ],
    foods: [
      'dim sum', 'char siu rice', 'egg tarts', 'pineapple buns', 'wonton noodles', 'curry fish balls',
      'cart noodles', 'claypot rice', 'Hong Kong-style French toast', 'siu mai', 'egg waffles',
    ],
    drinks: ['milk tea', 'yuenyeung', 'iced lemon tea'],
    sports: ['soccer', 'basketball', 'badminton', 'table tennis', 'dragon boat racing'],
    transport: ['the MTR', 'a minibus', 'the tram', 'the Star Ferry', 'a red taxi'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'Victoria Peak', 'the Big Buddha', 'Victoria Harbour', 'Wong Tai Sin Temple', 'the Avenue of Stars',
      'Ocean Park', 'the Clock Tower in Tsim Sha Tsui', 'Lion Rock',
    ],
    hangouts: ['a cha chaan teng', 'the mall', 'Lan Kwai Fong', 'a karaoke box', "the Ladies' Market", 'the Temple Street Night Market'],
    dateSpots: ['Victoria Peak', 'a cha chaan teng', 'the Tsim Sha Tsui promenade', 'a karaoke box', 'a dessert shop', 'the cinema'],
  },

  // India: Kendriya Vidyalayas and public schools, MG Road, board exams, the farewell, the RTO.
  in: {
    countryId: 'in',
    placeWords: [
      'Bandra', 'Andheri', 'Koramangala', 'Jayanagar', 'Malleswaram', 'Saket', 'Lajpat Nagar', 'Karol Bagh',
      'Salt Lake', 'Ballygunge', 'Adyar', 'Mylapore', 'Banjara Hills', 'Kothrud', 'Malabar Hill', 'Rajouri Garden',
    ],
    honorees: [
      'Mahatma Gandhi', 'Rabindranath Tagore', 'Swami Vivekananda', 'Sarojini Naidu', 'Netaji Subhas Chandra Bose',
      'Sardar Patel', 'Rani Lakshmibai', 'Dr. A.P.J. Abdul Kalam', 'Dr. B.R. Ambedkar', 'Savitribai Phule',
    ],
    schoolNames: {
      primary: ['Government Primary School, {place}', '{place} Public School', 'Kendriya Vidyalaya No. {n}, {city}'],
      middle: ['{place} Public School', 'Kendriya Vidyalaya No. {n}, {city}', '{honoree} Vidyalaya', "St. Xavier's School, {city}"],
      high: ['{honoree} Senior Secondary School', 'Government Senior Secondary School, {place}', '{city} Public School', "St. Xavier's High School, {city}"],
    },
    universityNames: ['University of {city}', '{city} University', '{honoree} University'],
    streetNames: ['{honoree} Road', '{honoree} Marg', '{place} Main Road', 'Station Road'],
    terms: {
      primary: 'primary school',
      middle: 'middle school',
      high: 'senior secondary',
      university: 'college',
      finalExam: 'the board exams',
      schoolDance: 'the farewell party',
      licenseOffice: 'the RTO',
      emergencyNumber: '112',
    },
    getaways: ['Goa', 'Manali', 'Shimla', 'Udaipur', 'the Kerala backwaters', 'Ooty', 'Darjeeling', 'the Andamans'],
    holidays: ['Diwali', 'Holi', 'Eid', 'Navratri', 'Durga Puja', 'Ganesh Chaturthi', 'Christmas', 'Raksha Bandhan'],
    foods: [
      'butter chicken', 'biryani', 'masala dosa', 'pani puri', 'chole bhature', 'vada pav', 'dal and rice',
      'paneer tikka', 'samosas', 'aloo paratha', 'idli sambar',
    ],
    drinks: ['masala chai', 'filter coffee', 'lassi', 'nimbu pani'],
    sports: ['cricket', 'kabaddi', 'badminton', 'soccer', 'field hockey'],
    transport: ['an auto-rickshaw', 'the local train', 'the metro', 'a crowded bus', 'a cycle-rickshaw'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'the Taj Mahal', 'the Gateway of India', 'India Gate', 'the Red Fort', 'the Golden Temple',
      'the Qutub Minar', 'Marine Drive', 'the ghats of Varanasi',
    ],
    hangouts: ['a chai stall', 'the mall', 'a chaat stall', 'Marine Drive', 'the college canteen', 'a cyber café'],
    dateSpots: ['a coffee shop', 'the multiplex', 'Marine Drive', 'Lodhi Garden', 'a rooftop café', 'Juhu Beach'],
  },

  // Indonesia: SD/SMP/SMA Negeri numbering, Jalan Sudirman, the UTBK, ojeks and angkots.
  id: {
    countryId: 'id',
    placeWords: [
      'Menteng', 'Kebayoran', 'Cempaka Putih', 'Tebet', 'Kemang', 'Dago', 'Kuta', 'Sanur', 'Malioboro',
      'Kotagede', 'Gubeng', 'Cikini', 'Rawamangun', 'Pondok Indah', 'Kelapa Gading', 'Ciliwung',
    ],
    honorees: [
      'Kartini', 'Diponegoro', 'Sudirman', 'Hasanuddin', 'Ki Hajar Dewantara', 'Cut Nyak Dhien',
      'Pattimura', 'Imam Bonjol', 'Gajah Mada', 'Ahmad Yani',
    ],
    schoolNames: {
      primary: ['SD Negeri {n} {place}', 'SD Muhammadiyah {n} {city}', 'SD Negeri {n} {city}'],
      middle: ['SMP Negeri {n} {city}', 'SMP Islam {honoree}', 'MTs Negeri {n} {city}'],
      high: ['SMA Negeri {n} {city}', 'SMK Negeri {n} {city}', 'MA Negeri {n} {city}'],
    },
    universityNames: ['Universitas {honoree}', 'Universitas Negeri {city}', 'Universitas Islam Negeri {city}', 'Institut Teknologi {city}'],
    streetNames: ['Jalan {honoree}', 'Jalan {place} Raya', 'Jalan {place}'],
    terms: {
      primary: 'elementary school',
      middle: 'junior high',
      high: 'senior high',
      university: 'university',
      finalExam: 'the UTBK',
      schoolDance: 'prom night',
      licenseOffice: 'the Satpas SIM office',
      emergencyNumber: '112',
    },
    getaways: ['Bali', 'Lombok', 'Yogyakarta', 'Puncak', 'Labuan Bajo', 'Lake Toba', 'Bromo', 'Raja Ampat'],
    holidays: ['Lebaran', 'Ramadan', 'Idul Adha', 'Christmas', 'Independence Day', 'Imlek', 'Nyepi'],
    foods: [
      'nasi goreng', 'satay', 'rendang', 'bakso', 'gado-gado', 'martabak', 'soto ayam', 'nasi uduk',
      'gudeg', 'mie ayam', 'pecel lele', 'nasi padang',
    ],
    drinks: ['es teh manis', 'kopi susu', 'kopi tubruk'],
    sports: ['soccer', 'badminton', 'volleyball', 'futsal', 'pencak silat'],
    transport: ['an ojek', 'an angkot', 'the TransJakarta bus', 'the KRL commuter line', 'a bajaj'],
    climate: 'tropical',
    snow: false,
    landmarks: ['Borobudur', 'Prambanan', 'Monas', 'Mount Bromo', 'Tanah Lot', 'Lake Toba', 'Kota Tua', 'Komodo Island'],
    hangouts: ['the mall', 'a warung', 'the alun-alun', 'a warkop', 'an angkringan'],
    dateSpots: ['the mall', 'a coffee shop', 'Malioboro', 'a seafood warung by the beach', 'the cinema', 'an angkringan'],
  },

  // Japan: municipal schools named after neighborhoods, chome addresses, the Common Test.
  jp: {
    countryId: 'jp',
    placeWords: [
      'Sakuragaoka', 'Midorigaoka', 'Hikarigaoka', 'Aoba', 'Higashi', 'Minami', 'Kita', 'Nishi', 'Chuo',
      'Fujimi', 'Wakaba', 'Asahi', 'Honcho', 'Yamate', 'Matsubara', 'Kawabata',
    ],
    honorees: [
      'Fukuzawa Yukichi', 'Natsume Soseki', 'Noguchi Hideyo', 'Sakamoto Ryoma', 'Tsuda Umeko',
      'Miyazawa Kenji', 'Higuchi Ichiyo', 'Okuma Shigenobu',
    ],
    schoolNames: {
      primary: ['{city} Municipal {place} Elementary School', '{place} Elementary School', '{place} Daiichi Elementary School'],
      middle: ['{city} Municipal {place} Junior High School', '{place} Junior High School', '{place} Daini Junior High School'],
      high: ['Prefectural {place} High School', '{place} Gakuen High School', '{place} Technical High School'],
    },
    universityNames: ['{city} University', '{city} Municipal University', '{city} Gakuin University', '{city} University of Foreign Studies'],
    streetNames: ['{place}-dori', '{place} {n}-chome', '{place} Shotengai'],
    terms: {
      primary: 'elementary school',
      middle: 'junior high',
      high: 'high school',
      university: 'university',
      finalExam: 'the Common Test',
      schoolDance: 'the culture festival',
      licenseOffice: 'the driving school',
      emergencyNumber: '119',
    },
    getaways: ['Okinawa', 'Hakone', 'Kyoto', 'Hokkaido', 'Atami', 'Karuizawa', 'Nikko', 'Kusatsu Onsen'],
    holidays: [
      'New Year', 'Golden Week', 'Obon', 'Christmas Eve', "Valentine's Day", 'Tanabata', 'Coming of Age Day', 'the summer festival',
    ],
    foods: [
      'ramen', 'sushi', 'curry rice', 'takoyaki', 'okonomiyaki', 'onigiri', 'tonkatsu', 'gyoza',
      'udon', 'konbini fried chicken', 'yakitori', 'natto',
    ],
    drinks: ['green tea', 'sake', 'highballs', 'canned coffee'],
    sports: ['baseball', 'soccer', 'sumo', 'tennis', 'volleyball'],
    transport: ['the train', 'the subway', 'the Shinkansen', 'a mamachari', 'the bus'],
    climate: 'temperate',
    snow: true,
    landmarks: [
      'Mount Fuji', 'Tokyo Tower', 'the Fushimi Inari Shrine', 'Kinkaku-ji', 'Itsukushima Shrine',
      'Osaka Castle', 'the Shibuya Scramble', 'Nara Park',
    ],
    hangouts: ['a konbini', 'a karaoke box', 'a game center', 'a family restaurant', 'an izakaya', 'a manga café'],
    dateSpots: ['a karaoke box', 'an aquarium', 'a family restaurant', 'a summer fireworks festival', 'a café', 'the Ferris wheel'],
  },

  // Kazakhstan: "School No. 12 named after Abai", the UNT, New Year and Nauryz, marshrutkas.
  kz: {
    countryId: 'kz',
    placeWords: [
      'Medeu', 'Bostandyk', 'Almaly', 'Samal', 'Orbita', 'Koktem', 'Kok-Tobe', 'Esil', 'Saryarka',
      'Zhetysu', 'Alatau', 'Shanyrak', 'Aksai', 'Nauryzbay',
    ],
    honorees: [
      'Abai', 'Al-Farabi', 'Mukhtar Auezov', 'Shokan Ualikhanov', 'Ybyrai Altynsarin', 'Kurmangazy',
      'Abylai Khan', 'Zhambyl', 'Magzhan Zhumabayev',
    ],
    schoolNames: {
      primary: ['School No. {n}', 'School No. {n} named after {honoree}', '{city} School No. {n}'],
      middle: ['School-Gymnasium No. {n}', 'School No. {n} named after {honoree}'],
      high: ['Lyceum No. {n}', 'School-Gymnasium No. {n} named after {honoree}', '{city} Kazakh-Turkish Lyceum'],
    },
    universityNames: ['{honoree} Kazakh National University', '{city} State University', '{city} Technical University'],
    streetNames: ['{honoree} Street', '{honoree} Avenue', '{place} Street'],
    terms: {
      primary: 'primary school',
      middle: 'middle school',
      high: 'senior school',
      university: 'university',
      finalExam: 'the UNT',
      schoolDance: 'the graduation ball',
      licenseOffice: 'the Public Service Center',
      emergencyNumber: '112',
    },
    getaways: ['Burabay', 'Lake Kapchagay', 'Lake Issyk-Kul', 'Lake Alakol', 'the Charyn Canyon', 'Shymbulak', 'the Kolsai Lakes'],
    holidays: ['New Year', 'Nauryz', "Women's Day", 'Kurban Ait', 'Oraza Ait', 'Independence Day'],
    foods: ['beshbarmak', 'baursak', 'plov', 'manty', 'lagman', 'kazy', 'samsa', 'shashlik', 'kurt', 'Olivier salad'],
    drinks: ['tea with milk', 'kumis', 'shubat', 'vodka'],
    sports: ['soccer', 'boxing', 'ice hockey', 'wrestling', 'kokpar'],
    transport: ['a marshrutka', 'the bus', 'an unofficial taxi', 'the overnight train'],
    climate: 'continental',
    snow: true,
    landmarks: [
      'the Baiterek Tower', 'the Medeu ice rink', 'Kok-Tobe', 'the Charyn Canyon', 'Big Almaty Lake',
      'the Mausoleum of Khoja Ahmed Yasawi', 'Khan Shatyr', 'the Baikonur Cosmodrome',
    ],
    hangouts: ['the mall', 'the Arbat', 'a karaoke bar', 'a hookah lounge', 'the Green Bazaar', 'the park'],
    dateSpots: ['Kok-Tobe', 'a coffee shop', 'the Arbat', 'the Medeu ice rink', 'a hookah lounge', 'the cinema'],
  },

  // Malaysia: SK/SJK(C)/SMK schools, the SPM, the JPJ, mamak stalls and pasar malam.
  my: {
    countryId: 'my',
    placeWords: [
      'Bangsar', 'Cheras', 'Ampang', 'Kepong', 'Setapak', 'Damansara', 'Subang', 'Bukit Bintang',
      'Kampung Baru', 'Puchong', 'Klang', 'Gombak', 'Bukit Jalil', 'Seri Kembangan', 'Tanjung Bungah', 'Sentul',
    ],
    honorees: [
      'Tunku Abdul Rahman', 'Tun Razak', 'Tun Hussein Onn', 'Tun Dr Ismail', 'Hang Tuah', 'Tun Fatimah',
      'P. Ramlee', "Za'ba", 'Sultan Idris',
    ],
    schoolNames: {
      primary: ['SK {place}', 'SJK(C) {place}', 'SJK(T) {place}', 'SK {place} {n}'],
      middle: ['SMK {place}', 'SMK {place} {n}', 'SMK {honoree}'],
      high: ['SMK {honoree}', 'SMK {place}', 'MRSM {city}'],
    },
    universityNames: ['Universiti {honoree}', 'UiTM {city}', 'Universiti Malaya'],
    streetNames: ['Jalan {honoree}', 'Jalan {place}', 'Lorong {place} {n}'],
    terms: {
      primary: 'primary school',
      middle: 'secondary school',
      high: 'upper secondary',
      university: 'uni',
      finalExam: 'the SPM',
      schoolDance: 'the Form Five prom night',
      licenseOffice: 'the JPJ office',
      emergencyNumber: '999',
    },
    getaways: ['Langkawi', 'Penang', 'Cameron Highlands', 'Genting Highlands', 'Redang', 'Malacca', 'Kota Kinabalu', 'Port Dickson'],
    holidays: [
      'Hari Raya Aidilfitri', 'Chinese New Year', 'Deepavali', 'Christmas', 'Hari Raya Haji', 'Merdeka Day', 'Thaipusam', 'Gawai',
    ],
    foods: [
      'nasi lemak', 'roti canai', 'char kway teow', 'satay', 'laksa', 'Hainanese chicken rice',
      'mee goreng mamak', 'rendang', 'nasi kandar', 'cendol', 'apam balik',
    ],
    drinks: ['teh tarik', 'kopi O', 'sirap bandung'],
    sports: ['badminton', 'soccer', 'sepak takraw', 'futsal', 'field hockey'],
    transport: ['the LRT', 'the MRT', 'the KTM Komuter', 'a kapcai motorbike', 'the bus'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'the Petronas Twin Towers', 'KL Tower', 'the Batu Caves', 'Mount Kinabalu', 'Penang Hill',
      'A Famosa', 'the Putra Mosque', 'the Cameron Highlands tea fields',
    ],
    hangouts: ['a mamak stall', 'the mall', 'the pasar malam', 'a kopitiam', 'Jalan Alor', 'the futsal court'],
    dateSpots: ['a mamak stall', 'the mall', 'the pasar malam', 'a cendol stall', 'the cinema', 'KLCC Park'],
  },

  // Mongolia: numbered schools, Peace Avenue, Tsagaan Sar and Naadam, buuz and airag.
  mn: {
    countryId: 'mn',
    placeWords: [
      'Bayanzürkh', 'Bayangol', 'Chingeltei', 'Khan-Uul', 'Songinokhairkhan', 'Zaisan', 'Tuul', 'Bogd Khan',
      'Selbe', 'Yarmag', 'Nalaikh', 'Orkhon', 'Khentii', 'Khövsgöl',
    ],
    honorees: ['Chinggis Khaan', 'Sükhbaatar', 'Zanabazar', 'Natsagdorj', 'Mandukhai Khatan', 'Khubilai Khaan'],
    schoolNames: {
      primary: ['{city} School No. {n}', '{place} Primary School'],
      middle: ['{city} Secondary School No. {n}', '{place} Complex School'],
      high: ['{city} Secondary School No. {n}', '{honoree} Lyceum', '{place} High School'],
    },
    universityNames: [
      'National University of Mongolia', 'Mongolian University of Science and Technology', '{city} State University', '{honoree} University',
    ],
    streetNames: ['{honoree} Avenue', '{place} Street', 'Peace Avenue'],
    terms: {
      primary: 'primary school',
      middle: 'secondary school',
      high: 'high school',
      university: 'university',
      finalExam: 'the General Entrance Exam',
      schoolDance: 'the graduation party',
      licenseOffice: 'the driving school',
      emergencyNumber: '103',
    },
    getaways: ['Lake Khövsgöl', 'Terelj', 'the Gobi Desert', 'Kharkhorin', 'the Orkhon Valley', 'Khustai National Park'],
    holidays: ['Tsagaan Sar', 'Naadam', 'New Year', "Women's Day", 'Independence Day'],
    foods: ['buuz', 'khuushuur', 'tsuivan', 'khorkhog', 'boodog', 'bansh', 'aaruul', 'mutton soup'],
    drinks: ['suutei tsai', 'airag', 'vodka'],
    sports: ['wrestling', 'basketball', 'horse racing', 'archery', 'judo'],
    transport: ['the bus', 'a minibus', 'a horse', 'a Russian van'],
    climate: 'cold',
    snow: true,
    landmarks: [
      'the Chinggis Khaan Equestrian Statue', 'Gandan Monastery', 'Sükhbaatar Square', 'the Zaisan Memorial',
      'Erdene Zuu Monastery', 'the Flaming Cliffs', 'Lake Khövsgöl',
    ],
    hangouts: ['a guanz', 'Sükhbaatar Square', 'a karaoke bar', 'the State Department Store', 'a pool hall'],
    dateSpots: ['Zaisan Hill', 'a karaoke bar', 'the cinema', 'a coffee shop', 'the ice-skating rink', 'a guanz'],
  },

  // Nepal: "Shree" government schools and English boarding schools, the SEE, Dashain and Tihar.
  np: {
    countryId: 'np',
    placeWords: [
      'Thamel', 'Baneshwor', 'Baluwatar', 'Kirtipur', 'Boudha', 'Lazimpat', 'Jawalakhel', 'Koteshwor',
      'Chabahil', 'Maharajgunj', 'Kalanki', 'Bagmati', 'Phewa', 'Annapurna', 'Gandaki',
    ],
    honorees: [
      'Bhanubhakta', 'Laxmi Prasad Devkota', 'Araniko', 'Tenzing Norgay', 'Bhimsen Thapa',
      'Gautam Buddha', 'Prithvi Narayan', 'Motiram Bhatta',
    ],
    schoolNames: {
      primary: ['Shree {place} Primary School', '{place} English Boarding School'],
      middle: ['Shree {honoree} Secondary School', '{place} English Boarding School', 'Shree {place} Secondary School'],
      high: ['{honoree} Higher Secondary School', 'Shree {place} Secondary School', '{place} Model College'],
    },
    universityNames: ['Tribhuvan University', '{city} University', '{honoree} Campus'],
    streetNames: ['{honoree} Marg', '{place} Marg', '{place} Tole'],
    terms: {
      primary: 'primary school',
      middle: 'secondary school',
      high: 'plus two',
      university: 'university',
      finalExam: 'the SEE',
      schoolDance: 'the farewell program',
      licenseOffice: 'the Transport Management Office',
      emergencyNumber: '102',
    },
    getaways: ['Pokhara', 'Nagarkot', 'Chitwan', 'Lumbini', 'Bandipur', 'Dhulikhel', 'Mustang'],
    holidays: ['Dashain', 'Tihar', 'Holi', 'Teej', 'Nepali New Year', 'Buddha Jayanti', 'Chhath'],
    foods: ['dal bhat', 'momos', 'sel roti', 'chow mein', 'thukpa', 'samay baji', 'yomari', 'chatpate', 'sekuwa', 'gundruk'],
    drinks: ['milk tea', 'raksi', 'tongba'],
    sports: ['cricket', 'soccer', 'volleyball', 'basketball'],
    transport: ['a microbus', 'a Safa Tempo', 'a crowded bus', 'a motorbike'],
    climate: 'temperate',
    snow: false,
    landmarks: [
      'Mount Everest', 'Swayambhunath', 'Boudhanath Stupa', 'Pashupatinath Temple', 'Patan Durbar Square',
      'Phewa Lake', 'Dharahara Tower', 'Lumbini',
    ],
    hangouts: ['a momo shop', 'a chiya pasal', 'Basantapur Durbar Square', 'a dohori bar', 'Thamel'],
    dateSpots: ['a momo shop', 'a rooftop café in Thamel', 'the Garden of Dreams', 'a boat on Phewa Lake', 'a dohori bar', 'the cinema hall'],
  },

  // Pakistan: government schools, matric exams, Rescue 1122, chai dhabas and Food Street.
  pk: {
    countryId: 'pk',
    placeWords: [
      'Gulberg', 'Model Town', 'Johar Town', 'Clifton', 'Gulshan-e-Iqbal', 'Saddar', 'Nazimabad',
      'Satellite Town', 'Hayatabad', 'Anarkali', 'Cantt', 'Margalla', 'Ravi', 'Defence',
    ],
    honorees: [
      'Quaid-e-Azam', 'Allama Iqbal', 'Liaquat Ali Khan', 'Sir Syed', 'Fatima Jinnah', 'Abdul Sattar Edhi',
      'Faiz Ahmed Faiz', 'Shah Abdul Latif', 'Khushal Khan Khattak',
    ],
    schoolNames: {
      primary: ['Government Primary School No. {n}, {place}', '{place} Grammar School', '{honoree} Public School'],
      middle: ['Government Middle School, {place}', '{place} Grammar School', '{honoree} Public School'],
      high: ['Government High School No. {n}, {city}', '{honoree} Public School', 'Cadet College {city}'],
    },
    universityNames: ['University of {city}', '{honoree} University', 'Government College University {city}'],
    streetNames: ['{honoree} Road', '{place} Main Boulevard', 'Street {n}, {place}'],
    terms: {
      primary: 'primary school',
      middle: 'middle school',
      high: 'high school',
      university: 'university',
      finalExam: 'the matric exams',
      schoolDance: 'the farewell party',
      licenseOffice: 'the traffic police licensing office',
      emergencyNumber: '1122',
    },
    getaways: ['Murree', 'Swat', 'Hunza', 'Naran', 'Skardu', 'Nathia Gali'],
    holidays: ['Eid ul-Fitr', 'Eid ul-Adha', 'Ramadan', 'Independence Day', 'Shab-e-Barat', 'Pakistan Day'],
    foods: [
      'biryani', 'nihari', 'haleem', 'chapli kebab', 'karahi', 'seekh kebab', 'halwa puri',
      'gol gappay', 'samosas', 'saag with makki ki roti', 'paye',
    ],
    drinks: ['doodh patti', 'lassi', 'sugarcane juice'],
    sports: ['cricket', 'field hockey', 'squash', 'soccer', 'kabaddi'],
    transport: ['a rickshaw', 'a chingchi', 'the Metro Bus', 'a packed wagon', 'a motorcycle'],
    climate: 'arid',
    snow: false,
    landmarks: [
      'the Badshahi Mosque', 'the Faisal Mosque', 'Minar-e-Pakistan', 'the Lahore Fort', 'the Mazar-e-Quaid',
      'the Wagah border', 'K2', 'Mohenjo-daro',
    ],
    hangouts: ['a chai dhaba', 'the mall', 'Food Street', 'Sea View', 'a gaming zone', 'the neighborhood cricket ground'],
    dateSpots: ['a coffee shop', 'Sea View', 'Food Street', 'the cinema', 'an ice cream parlor', 'Daman-e-Koh'],
  },

  // Philippines: elementary/national high schools named after heroes, the JS Prom, the LTO, jeepneys.
  ph: {
    countryId: 'ph',
    placeWords: [
      'Sampaloc', 'Tondo', 'Malate', 'Ermita', 'Cubao', 'Diliman', 'Marikina', 'Paco', 'Novaliches',
      'Fairview', 'Sta. Mesa', 'Lahug', 'Banilad', 'Poblacion', 'San Roque', 'Bagong Silang',
    ],
    honorees: [
      'José Rizal', 'Andrés Bonifacio', 'Apolinario Mabini', 'Melchora Aquino', 'Gabriela Silang',
      'Lapu-Lapu', 'Juan Luna', 'Marcelo H. del Pilar', 'Francisco Balagtas', 'Emilio Jacinto',
    ],
    schoolNames: {
      primary: ['{honoree} Elementary School', '{place} Elementary School', '{place} Central School'],
      middle: ['{place} National High School', '{honoree} High School'],
      high: ['{place} National High School', '{city} Science High School', '{honoree} Senior High School'],
    },
    universityNames: ['University of {city}', 'Pamantasan ng Lungsod ng {city}', '{honoree} University'],
    streetNames: ['{honoree} Street', '{honoree} Avenue', '{place} Road'],
    terms: {
      primary: 'elementary school',
      middle: 'junior high school',
      high: 'senior high school',
      university: 'college',
      finalExam: 'the UPCAT',
      schoolDance: 'the JS Prom',
      licenseOffice: 'the LTO',
      emergencyNumber: '911',
    },
    getaways: ['Boracay', 'Palawan', 'Baguio', 'Tagaytay', 'Siargao', 'Bohol', 'La Union', 'Batangas'],
    holidays: ['Christmas', 'Holy Week', "New Year's Eve", 'Undas', 'the town fiesta', 'Independence Day'],
    foods: [
      'adobo', 'sinigang', 'lechon', 'pancit', 'sisig', 'halo-halo', 'lumpia', 'balut', 'tapsilog',
      'kare-kare', 'spaghetti with hot dogs', 'street fishballs',
    ],
    drinks: ['buko juice', 'tuba', 'kapeng barako', 'a bucket of beer'],
    sports: ['basketball', 'volleyball', 'boxing', 'billiards', 'badminton'],
    transport: ['a jeepney', 'a tricycle', 'the MRT', 'a habal-habal', 'a bangka'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'the Chocolate Hills', 'Intramuros', 'Rizal Park', 'Mayon Volcano', 'Taal Volcano',
      'the Banaue Rice Terraces', "Magellan's Cross", 'Manila Bay',
    ],
    hangouts: ['the mall', 'a sari-sari store', 'the basketball court', 'a videoke bar', 'the plaza', 'a milk tea shop'],
    dateSpots: ['the mall', 'a milk tea shop', 'the seawall', 'Manila Bay', 'a fast-food joint', 'Intramuros'],
  },

  // Singapore: neighborhood primaries, JCs, HDB avenue numbers, the A-Levels, hawker centres.
  sg: {
    countryId: 'sg',
    placeWords: [
      'Bishan', 'Toa Payoh', 'Tampines', 'Bedok', 'Jurong', 'Yishun', 'Clementi', 'Pasir Ris', 'Serangoon',
      'Hougang', 'Bukit Panjang', 'Queenstown', 'Kallang', 'Marine Parade', 'Woodlands', 'Ang Mo Kio',
    ],
    honorees: [
      'Raffles', 'Tan Tock Seng', 'Lim Bo Seng', 'Yusof Ishak', 'Tan Kah Kee', 'Lee Kong Chian',
      'Eu Tong Sen', 'Sang Nila Utama',
    ],
    schoolNames: {
      primary: ['{place} Primary School', '{place} North Primary School', '{place} West Primary School'],
      middle: ['{place} Secondary School', '{place} View Secondary School'],
      high: ['{place} Junior College', '{place} Secondary School', '{honoree} Institution'],
    },
    universityNames: [
      'National University of Singapore', 'Nanyang Technological University', 'Singapore Management University', 'Ngee Ann Polytechnic',
    ],
    streetNames: ['{place} Avenue {n}', '{place} Street {n}', '{honoree} Road'],
    terms: {
      primary: 'primary school',
      middle: 'secondary school',
      high: 'junior college',
      university: 'uni',
      finalExam: 'the A-Levels',
      schoolDance: 'prom night',
      licenseOffice: 'the driving centre',
      emergencyNumber: '995',
    },
    getaways: ['Sentosa', 'Bali', 'Bintan', 'Johor Bahru', 'Phuket', 'Pulau Ubin', 'Desaru'],
    holidays: [
      'Chinese New Year', 'Hari Raya Puasa', 'Deepavali', 'Christmas', 'National Day', 'Vesak Day',
      'the Mid-Autumn Festival', 'Hari Raya Haji',
    ],
    foods: [
      'chicken rice', 'chilli crab', 'laksa', 'char kway teow', 'kaya toast', 'nasi lemak', 'roti prata',
      'bak chor mee', 'satay', 'carrot cake', 'Hokkien mee',
    ],
    drinks: ['kopi', 'teh tarik', 'bubble tea', 'sugarcane juice'],
    sports: ['soccer', 'badminton', 'basketball', 'swimming', 'table tennis'],
    transport: ['the MRT', 'the bus', 'the LRT', 'a taxi'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'Marina Bay Sands', 'the Merlion', 'Gardens by the Bay', 'Sentosa', 'the Singapore Zoo', 'Jewel Changi',
      'the Botanic Gardens', 'Chinatown',
    ],
    hangouts: ['a hawker centre', 'the void deck', 'a kopitiam', 'Orchard Road', 'East Coast Park', 'the mall'],
    dateSpots: ['a hawker centre', 'East Coast Park', 'Gardens by the Bay', 'a bubble tea shop', 'the cinema', 'Marina Bay'],
  },

  // South Korea: schools named after neighborhoods, roads named after pen names, the Suneung.
  kr: {
    countryId: 'kr',
    placeWords: [
      'Gangnam', 'Mapo', 'Jamsil', 'Sinchon', 'Yeouido', 'Seocho', 'Bundang', 'Haeundae', 'Seomyeon',
      'Suseong', 'Mokdong', 'Ilsan', 'Jungang', 'Namsan', 'Hwarang', 'Hangang',
    ],
    honorees: ['Sejong', 'Chungmu', 'Toegye', 'Yulgok', 'Dosan', 'Eulji', 'Baekbeom'],
    schoolNames: {
      primary: ['{place} Elementary School', '{city} Elementary School'],
      middle: ['{place} Middle School', '{honoree} Middle School'],
      high: ['{place} High School', '{city} Science High School', '{place} Foreign Language High School', '{city} Arts High School'],
    },
    universityNames: ['{city} National University', '{city} University', '{city} National University of Education'],
    streetNames: ['{honoree}-ro', '{honoree}-daero', '{place}-ro'],
    terms: {
      primary: 'elementary school',
      middle: 'middle school',
      high: 'high school',
      university: 'university',
      finalExam: 'the Suneung',
      schoolDance: 'the school festival',
      licenseOffice: "the driver's license test center",
      emergencyNumber: '119',
    },
    getaways: ['Jeju Island', 'Busan', 'Gangneung', 'Gyeongju', 'Sokcho', 'Yeosu', 'Gapyeong', 'Nami Island'],
    holidays: ['Chuseok', 'Seollal', 'Christmas', "Buddha's Birthday", "Children's Day", "Parents' Day", 'White Day'],
    foods: [
      'kimchi stew', 'tteokbokki', 'Korean fried chicken', 'samgyeopsal', 'bibimbap', 'jajangmyeon',
      'kimbap', 'ramyeon', 'bulgogi', 'naengmyeon', 'budae jjigae',
    ],
    drinks: ['soju', 'makgeolli', 'somaek', 'an iced Americano'],
    sports: ['baseball', 'soccer', 'basketball', 'golf', 'taekwondo'],
    transport: ['the subway', 'the bus', 'the KTX', 'a taxi', 'an electric scooter'],
    climate: 'continental',
    snow: true,
    landmarks: [
      'Gyeongbokgung Palace', 'N Seoul Tower', 'Bukchon Hanok Village', 'Haeundae Beach', 'Hallasan',
      'the DMZ', 'Bulguksa Temple', 'Gamcheon Culture Village',
    ],
    hangouts: ['a PC bang', 'a noraebang', 'a convenience store', 'the Han River park', 'a pojangmacha', 'a café'],
    dateSpots: ['a noraebang', 'the Han River park', 'a themed café', 'N Seoul Tower', 'a pojangmacha', 'the cinema'],
  },

  // Taiwan: municipal schools, Zhongshan Road, the GSAT, night markets and scooters.
  tw: {
    countryId: 'tw',
    placeWords: [
      "Da'an", 'Xinyi', 'Fuxing', 'Minsheng', 'Heping', 'Guangfu', "Ren'ai", 'Zhongxiao', 'Jianguo',
      'Chenggong', 'Minquan', 'Zhonghua', 'Datong', 'Sanmin', 'Wenhua', 'Guangming',
    ],
    honorees: ['Sun Yat-sen', 'Koxinga', 'Confucius', 'Lai Ho', 'Chiang Wei-shui', 'George Leslie Mackay', 'Lin Hsien-tang'],
    schoolNames: {
      primary: ['{place} Elementary School', '{city} Municipal {place} Elementary School'],
      middle: ['{place} Junior High School', '{city} Municipal {place} Junior High School'],
      high: ['{place} Senior High School', 'National {city} Senior High School', '{place} Vocational High School'],
    },
    universityNames: ['National Taiwan University', 'National {city} University', '{city} Medical University'],
    streetNames: ['{place} Road', '{place} Street', 'Zhongshan Road'],
    terms: {
      primary: 'elementary school',
      middle: 'junior high',
      high: 'senior high',
      university: 'university',
      finalExam: 'the GSAT',
      schoolDance: 'the graduation trip',
      licenseOffice: 'the Motor Vehicles Office',
      emergencyNumber: '119',
    },
    getaways: ['Kenting', 'Hualien', 'Sun Moon Lake', 'Alishan', 'Jiufen', 'Penghu', 'Taitung', 'Green Island'],
    holidays: [
      'Lunar New Year', 'the Mid-Autumn Festival', 'the Dragon Boat Festival', 'Tomb Sweeping Day', 'Ghost Month',
      'the Lantern Festival', 'Double Tenth', 'Christmas',
    ],
    foods: [
      'beef noodle soup', 'braised pork rice', 'xiaolongbao', 'stinky tofu', 'oyster omelet', 'popcorn chicken',
      'scallion pancakes', 'gua bao', 'pineapple cake', 'hot pot', 'a fried chicken cutlet',
    ],
    drinks: ['bubble tea', 'oolong tea', 'kaoliang', 'papaya milk'],
    sports: ['baseball', 'basketball', 'badminton', 'table tennis', 'volleyball'],
    transport: ['a scooter', 'the MRT', 'the High Speed Rail', 'a city bike', 'the bus'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'Taipei 101', 'Shilin Night Market', 'Sun Moon Lake', 'Taroko Gorge', 'Jiufen Old Street', 'Alishan',
      'the National Palace Museum', 'Elephant Mountain',
    ],
    hangouts: ['the night market', 'a convenience store', 'a KTV', 'Ximending', 'a bubble tea shop', 'the temple courtyard'],
    dateSpots: ['the night market', 'Elephant Mountain', 'a bubble tea shop', 'a KTV', 'Tamsui Old Street', 'the cinema'],
  },

  // Thailand: temple and Wittayalai schools, Sukhumvit sois, the TCAS, Songkran, tuk-tuks.
  th: {
    countryId: 'th',
    placeWords: [
      'Sukhumvit', 'Silom', 'Thonburi', 'Ladprao', 'Bang Kapi', 'Chatuchak', 'Bang Na', 'Ratchada', 'Ari',
      'Nimman', 'Patong', 'Chao Phraya', 'Rangsit', 'Don Mueang', 'Bang Sue', 'Huai Khwang',
    ],
    honorees: [
      'Chulalongkorn', 'Mahidol', 'Naresuan', 'Ramkhamhaeng', 'King Taksin', 'Suriyothai', 'Thao Suranari', 'Sunthorn Phu',
    ],
    schoolNames: {
      primary: ['Anuban {city} School', 'Wat {place} School', '{place} Municipal School {n}'],
      middle: ['{place} Wittaya School', '{honoree} School'],
      high: ['{place} Wittayalai School', '{city} Wittayakhom School', '{honoree} Wittayalai School'],
    },
    universityNames: ['{honoree} University', '{city} University', '{city} Rajabhat University'],
    streetNames: ['{place} Soi {n}', '{place} Road', '{honoree} Road'],
    terms: {
      primary: 'primary school',
      middle: 'junior high',
      high: 'high school',
      university: 'university',
      finalExam: 'the TCAS',
      schoolDance: 'the farewell party',
      licenseOffice: 'the Land Transport Office',
      emergencyNumber: '191',
    },
    getaways: ['Phuket', 'Chiang Mai', 'Hua Hin', 'Koh Samui', 'Krabi', 'Pai', 'Koh Chang', 'Pattaya'],
    holidays: ['Songkran', 'Loy Krathong', 'New Year', 'Chinese New Year', 'Makha Bucha', "Mother's Day"],
    foods: [
      'pad thai', 'som tam', 'tom yum', 'green curry', 'mango sticky rice', 'khao man gai', 'moo ping',
      'pad kra pao', 'boat noodles', 'khao soi', 'larb', 'massaman curry',
    ],
    drinks: ['Thai iced tea', 'iced coffee', 'lao khao', 'coconut water'],
    sports: ['soccer', 'Muay Thai', 'volleyball', 'sepak takraw', 'badminton'],
    transport: ['a tuk-tuk', 'a motorbike taxi', 'the BTS Skytrain', 'a songthaew', 'a canal boat'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'the Grand Palace', 'Wat Arun', 'Wat Phra That Doi Suthep', 'the floating market', 'Ayutthaya',
      'the Phi Phi Islands', 'the White Temple', 'the Bridge on the River Kwai',
    ],
    hangouts: ['the night market', 'a mookata restaurant', 'the mall', 'Siam Square', 'a street food stall', 'Khao San Road'],
    dateSpots: ['a mookata restaurant', 'the night market', 'Siam Square', 'a riverside bar', 'the cinema', 'a café'],
  },

  // Vietnam: schools named after Le Quy Don and Chu Van An, alleys off Le Loi Street, Tet.
  vn: {
    countryId: 'vn',
    placeWords: [
      'Hoan Kiem', 'Ba Dinh', 'Dong Da', 'Cau Giay', 'Tay Ho', 'Thu Duc', 'Binh Thanh', 'Phu Nhuan',
      'Go Vap', 'Tan Binh', 'Cholon', 'Thao Dien', 'Hai Chau', 'Son Tra', 'Ninh Kieu',
    ],
    honorees: [
      'Tran Hung Dao', 'Le Loi', 'Nguyen Du', 'Hai Ba Trung', 'Le Quy Don', 'Chu Van An', 'Nguyen Trai',
      'Ly Thuong Kiet', 'Ba Trieu', 'Quang Trung',
    ],
    schoolNames: {
      primary: ['{honoree} Primary School', '{place} Primary School'],
      middle: ['{honoree} Secondary School', '{place} Secondary School'],
      high: ['{honoree} High School', '{honoree} High School for the Gifted', '{place} High School'],
    },
    universityNames: [
      '{city} University', '{city} University of Technology', '{city} University of Economics',
      '{city} University of Medicine and Pharmacy',
    ],
    streetNames: ['{honoree} Street', '{honoree} Boulevard', 'Alley {n}, {honoree} Street'],
    terms: {
      primary: 'primary school',
      middle: 'secondary school',
      high: 'high school',
      university: 'university',
      finalExam: 'the national graduation exam',
      schoolDance: 'the farewell party',
      licenseOffice: 'the driving test center',
      emergencyNumber: '115',
    },
    getaways: ['Da Lat', 'Phu Quoc', 'Ha Long Bay', 'Sapa', 'Nha Trang', 'Hoi An', 'Vung Tau', 'Mui Ne'],
    holidays: ['Tet', 'the Mid-Autumn Festival', 'Christmas', 'Reunification Day', 'National Day', "Women's Day"],
    foods: [
      'pho', 'banh mi', 'bun cha', 'com tam', 'banh xeo', 'spring rolls', 'bun bo Hue', 'hot vit lon',
      'banh cuon', 'xoi', 'cao lau',
    ],
    drinks: ['ca phe sua da', 'bia hoi', 'tra da'],
    sports: ['soccer', 'badminton', 'volleyball', 'pickleball', 'shuttlecock kicking'],
    transport: ['a xe om', 'a motorbike', 'a cyclo', 'the sleeper bus', 'the metro'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'Ha Long Bay', 'Hoan Kiem Lake', 'the Golden Bridge', 'the Cu Chi Tunnels', 'the Imperial City of Hue',
      'Ben Thanh Market', 'the Temple of Literature', 'Fansipan',
    ],
    hangouts: ['a sidewalk café', 'a bia hoi corner', 'Bui Vien Street', 'the night market', 'a plastic-stool tea stall'],
    dateSpots: ['a sidewalk café', 'Hoan Kiem Lake', 'a rooftop bar', 'the night market', 'a coffee shop', 'the cinema'],
  },

  // Australia: public/state schools and secondary colleges, the HSC, the formal, the servo.
  au: {
    countryId: 'au',
    placeWords: [
      'Bondi', 'Parramatta', 'Fitzroy', 'St Kilda', 'Fortitude Valley', 'Fremantle', 'Glenelg', 'Manly',
      'Newtown', 'Brunswick', 'Toowong', 'Cottesloe', 'Hawthorn', 'Penrith', 'Yarra', 'Blacktown',
    ],
    honorees: [
      'Macquarie', 'Flinders', 'La Trobe', 'Deakin', 'Curtin', 'Monash', 'Griffith', 'Edith Cowan',
      'Henry Lawson', 'Caroline Chisholm',
    ],
    schoolNames: {
      primary: ['{place} Public School', '{place} Primary School', '{place} State School'],
      middle: ['{place} High School', '{place} Secondary College'],
      high: ['{place} High School', '{place} Secondary College', '{place} State High School', '{honoree} College'],
    },
    universityNames: ['University of {city}', '{honoree} University', '{city} Institute of Technology'],
    streetNames: ['{honoree} Street', '{place} Road', '{place} Parade', '{honoree} Crescent'],
    terms: {
      primary: 'primary school',
      middle: 'high school',
      high: 'high school',
      university: 'uni',
      finalExam: 'the HSC',
      schoolDance: 'the Year 12 formal',
      licenseOffice: 'the licensing centre',
      emergencyNumber: '000',
    },
    getaways: ['the Gold Coast', 'Byron Bay', 'Bali', 'the Whitsundays', 'Noosa', 'Tasmania', 'the Blue Mountains', 'Margaret River'],
    holidays: ['Christmas', 'Easter', "New Year's Eve", 'Australia Day', 'ANZAC Day', 'Melbourne Cup Day'],
    foods: [
      'a meat pie', 'a sausage sizzle', 'a chicken parmy', 'fish and chips', 'lamingtons', 'pavlova',
      'smashed avo on toast', 'a bacon and egg roll', 'barbecued prawns', 'fairy bread',
    ],
    drinks: ['a flat white', 'a cold stubby', 'goon'],
    sports: ['Aussie rules football', 'cricket', 'rugby league', 'soccer', 'netball'],
    transport: ['the train', 'the tram', 'the bus', 'the ferry', "a mate's ute"],
    climate: 'temperate',
    snow: false,
    landmarks: [
      'the Sydney Opera House', 'the Harbour Bridge', 'Uluru', 'the Great Barrier Reef', 'the Twelve Apostles',
      'Bondi Beach', 'the Big Banana', 'Kakadu',
    ],
    hangouts: ['the beach', 'the local pub', 'the servo', 'the shopping centre', 'the skate park', 'the RSL club'],
    dateSpots: ['the beach', 'a footy match', 'a café', 'the cinema', 'a pub trivia night', 'the botanic gardens'],
  },

  // New Zealand: intermediates and colleges, NCEA, the school ball, the dairy, Matariki.
  nz: {
    countryId: 'nz',
    placeWords: [
      'Ponsonby', 'Parnell', 'Remuera', 'Mount Eden', 'Grey Lynn', 'Ōtāhuhu', 'Manurewa', 'Te Aro',
      'Karori', 'Riccarton', 'Sumner', 'Takapuna', 'Māngere', 'Papatoetoe', 'Waitematā', 'Tawa',
    ],
    honorees: [
      'Edmund Hillary', 'Kate Sheppard', 'Āpirana Ngata', 'Ernest Rutherford', 'Katherine Mansfield',
      'Te Puea Hērangi', 'Whina Cooper', 'Janet Frame',
    ],
    schoolNames: {
      primary: ['{place} School', '{place} Primary School', '{place} Normal School', 'Te Kura Kaupapa Māori o {place}'],
      middle: ['{place} Intermediate', '{place} Intermediate School'],
      high: ['{place} College', '{place} Grammar School', '{place} High School'],
    },
    universityNames: ['University of {city}', 'Massey University', 'Victoria University of Wellington', '{city} Institute of Technology'],
    streetNames: ['{place} Road', '{honoree} Street', '{place} Terrace', '{honoree} Place'],
    terms: {
      primary: 'primary school',
      middle: 'intermediate',
      high: 'high school',
      university: 'uni',
      finalExam: 'NCEA Level 3',
      schoolDance: 'the school ball',
      licenseOffice: 'the AA centre',
      emergencyNumber: '111',
    },
    getaways: ['Queenstown', 'Rotorua', 'Waiheke Island', 'the Coromandel', 'the Bay of Islands', 'Wanaka', 'Taupō', 'Raglan'],
    holidays: ['Christmas', 'Easter', 'Matariki', 'Waitangi Day', 'ANZAC Day', 'Guy Fawkes Night', "New Year's Eve"],
    foods: [
      'a mince and cheese pie', 'fish and chips', 'a hāngī', 'pavlova', 'hokey pokey ice cream', 'kūmara chips',
      'a sausage sizzle', 'whitebait fritters', 'lolly cake', 'a boil-up', 'cheese rolls',
    ],
    drinks: ['a flat white', 'a cold beer', 'cheap cider'],
    sports: ['rugby', 'netball', 'cricket', 'rugby league', 'soccer'],
    transport: ['the bus', 'the ferry', 'the train', "a mate's car"],
    climate: 'temperate',
    snow: false,
    landmarks: [
      'the Sky Tower', 'Milford Sound', 'Hobbiton', 'Aoraki', 'the Waitomo Glowworm Caves', 'Cape Reinga',
      'Te Papa', 'Rangitoto Island',
    ],
    hangouts: ['the beach', 'the dairy', 'the skate park', 'the local pub', 'the mall', "a mate's garage"],
    dateSpots: ['the beach', 'a fish and chip shop', 'the top of Mount Eden', 'the cinema', 'a café', 'the Wellington waterfront'],
  },

  // Papua New Guinea: Port Moresby suburbs, national high schools, PMVs, kai bars and buai.
  pg: {
    countryId: 'pg',
    placeWords: [
      'Boroko', 'Gordons', 'Waigani', 'Hohola', 'Gerehu', 'Tokarara', 'Koki', 'Hanuabada', 'Konedobu',
      'Badili', 'Six Mile', 'Eriku', 'Taraka', 'Kagamuga', 'Sepik', 'Markham',
    ],
    honorees: [
      'Sir Michael Somare', 'Sir John Guise', 'Sir Albert Maori Kiki', 'Sir Ignatius Kilage', 'Sir Paulias Matane',
      'Don Bosco', 'De La Salle',
    ],
    schoolNames: {
      primary: ['{place} Primary School', '{honoree} Primary School', '{place} Elementary School'],
      middle: ['{place} High School', '{honoree} Secondary School'],
      high: ['{place} Secondary School', '{city} National High School', '{honoree} Secondary School'],
    },
    universityNames: [
      'University of Papua New Guinea', 'Papua New Guinea University of Technology', 'Divine Word University', 'University of Goroka',
    ],
    streetNames: ['{place} Road', '{honoree} Drive', '{place} Street'],
    terms: {
      primary: 'primary school',
      middle: 'high school',
      high: 'secondary school',
      university: 'university',
      finalExam: 'the Grade 12 national exams',
      schoolDance: 'the Grade 12 graduation',
      licenseOffice: 'the Road Traffic Authority',
      emergencyNumber: '111',
    },
    getaways: ['Madang', 'Kokopo', 'Alotau', 'Kavieng', 'Loloata Island', 'the Trobriand Islands', 'Tufi', 'Rabaul'],
    holidays: ['Christmas', 'Easter', 'Independence Day', 'the Hiri Moale Festival', 'the Goroka Show', 'the Mount Hagen Show'],
    foods: [
      'kaukau', 'sago', 'mumu pork', 'tinned fish and rice', 'lamb flaps', 'aibika in coconut milk',
      'kai bar chicken', 'flour balls', 'fresh pineapple',
    ],
    drinks: ['Highlands coffee', 'kulau', 'a cold beer'],
    sports: ['rugby league', 'soccer', 'netball', 'cricket', 'basketball'],
    transport: ['a PMV', 'a banana boat', 'a light plane', 'the back of a truck'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'the Kokoda Track', 'Mount Wilhelm', 'the Sepik River', 'Parliament House', 'Varirata National Park',
      'Ela Beach', 'Tavurvur volcano', 'the Bomana War Cemetery',
    ],
    hangouts: ['the market', 'Ela Beach', 'a kai bar', 'a buai stall', 'the church youth group', 'the rugby field'],
    dateSpots: ['Ela Beach', 'a kai bar', 'the church youth fellowship', 'the waterfront', 'a rugby league match'],
  },

  // Samoa: village primaries and "colleges", the SSLC, White Sunday, painted buses and the umu.
  ws: {
    countryId: 'ws',
    placeWords: [
      'Vailima', "Moto'otua", 'Matautu', 'Faleata', 'Vaiala', 'Lotopa', 'Malifa', 'Sogi', 'Falealili',
      'Lalomanu', 'Leulumoega', 'Saleimoa', 'Tanugamanono', 'Falelatai',
    ],
    honorees: [
      'Robert Louis Stevenson', 'Malietoa Tanumafili II', 'Tupua Tamasese Lealofi', "Fiamē Mata'afa",
      "Lauaki Namulau'ulu", 'Olaf Nelson',
    ],
    schoolNames: {
      primary: ['{place} Primary School', '{place} District School'],
      middle: ['{place} College', '{place} Secondary School'],
      high: ['{place} College', '{honoree} College', 'Samoa College'],
    },
    universityNames: ['National University of Samoa', 'University of the South Pacific'],
    streetNames: ['{place} Street', '{place} Road', 'Beach Road'],
    terms: {
      primary: 'primary school',
      middle: 'secondary school',
      high: 'college',
      university: 'university',
      finalExam: 'the SSLC exams',
      schoolDance: 'the end-of-year prize-giving',
      licenseOffice: 'the Land Transport Authority',
      emergencyNumber: '911',
    },
    getaways: ["Savai'i", 'Lalomanu Beach', 'Manono Island', 'To Sua Ocean Trench', 'Namua Island', 'Pago Pago'],
    holidays: ['White Sunday', 'Christmas', 'Independence Day', 'Easter', 'the Teuila Festival', "New Year's Day"],
    foods: ['palusami', 'oka', 'sapasui', 'koko alaisa', 'pani popo', 'panikeke', 'pisupo', 'taro from the umu', "fa'ausi"],
    drinks: ['koko Samoa', "'ava", 'fresh niu'],
    sports: ['rugby', 'rugby league', 'netball', 'kirikiti', 'volleyball'],
    transport: ['a painted wooden bus', 'a taxi', "the ferry to Savai'i", 'the back of a pickup'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'To Sua Ocean Trench', 'the Robert Louis Stevenson Museum', 'the Alofaaga Blowholes', 'Piula Cave Pool',
      'the Papaseea Sliding Rocks', 'the Immaculate Conception Cathedral', 'Mount Vaea',
    ],
    hangouts: ['the Fugalei market', 'the church youth group', 'the beach', 'the Apia seawall', 'the village rugby field'],
    dateSpots: ['the Apia seawall', 'a beach fale', 'the church youth night', 'a fiafia night', 'the market food stalls'],
  },
}
