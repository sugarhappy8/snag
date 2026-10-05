// Locale profiles for Africa and the Middle East (see data/locales.ts for field meanings).
//
// Conventions: placeWords and honorees are bare names (they get dropped into school and street
// patterns); foods have no leading article ('a spoonful of {food}'); transport, hangouts and
// date spots carry their own article ('a ride on a matatu', 'hung out at the souk').
// Emergency numbers are the ambulance / general line people actually dial.
import type { LocaleProfile } from '../locales'

export const AFRICA_MIDDLE_EAST_LOCALES: Record<string, LocaleProfile> = {
  // ----- Africa -----

  // Algeria: French-style school system (CEM, lycée, the bac), Algiers and Oran neighborhoods.
  dz: {
    countryId: 'dz',
    placeWords: [
      'Bab El Oued', 'Hydra', 'El Biar', 'Kouba', 'Belcourt', 'Bab Ezzouar', 'Hussein Dey', 'Ben Aknoun',
      'Chéraga', 'Sidi El Houari', 'Es Senia', 'Rhumel', 'Seybouse', 'Djurdjura', 'Aurès', 'Mitidja',
    ],
    honorees: [
      'Emir Abdelkader', 'Abdelhamid Ben Badis', "Larbi Ben M'hidi", 'Didouche Mourad', 'Hassiba Ben Bouali',
      "Lalla Fatma N'Soumer", 'Mohamed Dib', 'Kateb Yacine', 'Moufdi Zakaria', 'Mouloud Mammeri',
    ],
    schoolNames: {
      primary: ['École primaire {honoree}', 'École primaire {place} {n}'],
      middle: ['CEM {honoree}', 'CEM {place}'],
      high: ['Lycée {honoree}', 'Lycée {place}'],
    },
    universityNames: ['University of {city}', 'Université {honoree}'],
    streetNames: ['Rue {honoree}', 'Boulevard {honoree}', 'Avenue {honoree}'],
    terms: {
      primary: 'primary school',
      middle: 'middle school',
      high: 'lycée',
      university: 'university',
      finalExam: 'the bac',
      schoolDance: 'the bac results party',
      licenseOffice: 'the auto-école',
      emergencyNumber: '14',
    },
    getaways: ['Tipaza', 'Béjaïa', 'Jijel', 'Taghit', 'Djanet', 'Tikjda', 'Hammamet', 'Istanbul'],
    holidays: ['Eid al-Fitr', 'Eid al-Adha', 'Ramadan', 'Mawlid', 'Yennayer', 'Independence Day', 'Ashura'],
    foods: [
      'couscous', 'chakhchoukha', 'rechta', 'chorba frik', 'mhajeb', 'garantita', 'bourek', 'tajine zitoune',
      'merguez', 'makroud', 'dolma', 'kalb el louz',
    ],
    drinks: ['mint tea', 'café au lait', 'lben'],
    sports: ['football', 'handball', 'boxing', 'athletics', 'volleyball'],
    transport: ['the bus', 'the metro', 'the tramway', 'a shared taxi', 'a clandestin taxi'],
    climate: 'mediterranean',
    snow: false,
    landmarks: [
      'the Maqam Echahid', 'the Casbah of Algiers', 'the Great Mosque of Algiers', "the Notre-Dame d'Afrique basilica",
      "the Sidi M'Cid bridge", 'the Roman ruins of Timgad', 'the Santa Cruz fort', "the Tassili n'Ajjer",
    ],
    hangouts: ['the neighborhood café', 'the Sablettes', 'the beach', 'the hammam', 'the stadium'],
    dateSpots: ['an ice cream parlor', 'the Sablettes', "the Jardin d'Essai", 'a pizzeria', 'the seafront promenade'],
  },

  // Angola: Portuguese-speaking, kizomba and candongueiros, Luanda's Ilha and Marginal.
  ao: {
    countryId: 'ao',
    placeWords: [
      'Maianga', 'Ingombota', 'Alvalade', 'Miramar', 'Cazenga', 'Viana', 'Talatona', 'Kilamba', 'Rangel',
      'Sambizanga', 'Cacuaco', 'Samba', 'Kwanza', 'Catumbela', 'Tundavala',
    ],
    honorees: [
      'Rainha Ginga', 'Mandume ya Ndemufayo', 'Ngola Kiluanje', 'Ekuikui II', 'Kimpa Vita', 'Deolinda Rodrigues',
      'Hoji ya Henda', 'António Jacinto', 'Viriato da Cruz',
    ],
    schoolNames: {
      primary: ['Escola Primária {honoree}', 'Escola Primária {place} nº {n}'],
      middle: ['Escola do I Ciclo {honoree}', 'Complexo Escolar {place}'],
      high: ['Liceu {honoree}', 'Escola do II Ciclo {place}', 'Instituto Médio {honoree}'],
    },
    universityNames: ['Agostinho Neto University', 'Universidade {honoree}', 'Universidade Católica de Angola'],
    streetNames: ['Rua {honoree}', 'Avenida {honoree}', 'Largo {honoree}'],
    terms: {
      primary: 'primary school',
      middle: 'junior secondary',
      high: 'senior secondary',
      university: 'university',
      finalExam: 'the university entrance exams',
      schoolDance: "the finalists' party",
      licenseOffice: 'the escola de condução',
      emergencyNumber: '112',
    },
    getaways: ['Mussulo', 'Cabo Ledo', 'Benguela', 'Lubango', 'Namibe', 'Baía Azul', 'the Kalandula Falls', 'Lisbon'],
    holidays: ['Christmas', "New Year's Eve", 'Carnival', 'Easter', 'Independence Day', 'Peace Day'],
    foods: [
      'funge', 'muamba de galinha', 'calulu', 'mufete', 'kizaca', 'feijão de óleo de palma', 'chikuanga',
      'cocada amarela', 'roasted jinguba',
    ],
    drinks: ['kissangua', 'a cold beer', 'mukua juice'],
    sports: ['football', 'basketball', 'handball', 'athletics'],
    transport: ['a candongueiro', 'a kupapata', 'the bus', 'a taxi'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'the Fortaleza de São Miguel', 'the Kalandula Falls', 'the Tundavala Gap', 'the Iron Palace',
      'the Black Rocks of Pungo Andongo', 'Kissama National Park', 'the Luanda Marginal',
    ],
    hangouts: ['the Marginal', 'the Ilha', 'the beach', 'a kizomba club', 'the market', "a friend's quintal"],
    dateSpots: ['the Marginal', 'a beach bar on the Ilha', 'a kizomba club', 'an ice cream shop', 'the cinema'],
  },

  // Djibouti: French-style schools, Somali and Afar food, the Gulf of Tadjourah.
  dj: {
    countryId: 'dj',
    placeWords: [
      'Balbala', 'Boulaos', 'Gabode', 'Haramous', 'Héron', 'Ambouli', 'Arhiba', 'Einguela', 'Salines',
      'Quartier 7', 'Plateau du Serpent', 'Goda', 'Moucha', 'Hayableh',
    ],
    honorees: ['Mahmoud Harbi', 'Ahmed Dini', 'Elmi Boodhari', 'Abdi Sinimo', 'Ras Makonnen', 'Ibn Khaldoun', 'Ibn Sina'],
    schoolNames: {
      primary: ['École {place} {n}', 'École primaire {place}'],
      middle: ['Collège {place}', 'CEM {place} {n}'],
      high: ['Lycée {place}', 'Lycée {honoree}', "Lycée d'État de Djibouti"],
    },
    universityNames: ['University of Djibouti', 'Université de Djibouti'],
    streetNames: ['Avenue {honoree}', 'Boulevard {honoree}', 'Rue {honoree}'],
    terms: {
      primary: 'primary school',
      middle: 'collège',
      high: 'lycée',
      university: 'university',
      finalExam: 'the bac',
      schoolDance: 'the bac party',
      licenseOffice: 'the auto-école',
      emergencyNumber: '18',
    },
    getaways: ['Moucha Island', 'Tadjourah', 'Arta Plage', 'Lake Assal', 'Lake Abbé', 'the Day Forest', 'Dubai', 'Addis Ababa'],
    holidays: ['Ramadan', 'Eid al-Fitr', 'Eid al-Adha', 'Independence Day', 'Mawlid', "Isra and Mi'raj"],
    foods: [
      'skoudehkaris', 'lahoh', 'sambusas', 'fah-fah', 'poisson yéménite', 'xalwo', 'bariis iskukaris', 'goat stew',
    ],
    drinks: ['spiced tea', 'camel milk', 'fresh mango juice'],
    sports: ['football', 'athletics', 'basketball', 'volleyball'],
    transport: ['a minibus', 'a taxi', 'the bus', 'a dhow'],
    climate: 'arid',
    snow: false,
    landmarks: [
      'Lake Assal', 'Lake Abbé', 'the Day Forest', 'the Ghoubbet', 'the Hamoudi Mosque', 'the Place Menelik',
      'the Goda Mountains', 'Moucha Island',
    ],
    hangouts: ['the Place Menelik', 'the beach at Héron', 'the central market', 'a juice bar', 'a Yemeni café'],
    dateSpots: ['a juice bar', 'the seafront at Héron', 'a Yemeni restaurant', 'Arta Plage', 'an ice cream shop'],
  },

  // DR Congo: Kinshasa communes, the Exetat, rumba, and minibuses nicknamed "esprit de mort".
  cd: {
    countryId: 'cd',
    placeWords: [
      'Gombe', 'Lingwala', 'Kintambo', 'Bandal', 'Matonge', 'Kalamu', 'Limete', 'Masina', 'Ngaliema', 'Ndjili',
      'Binza', 'Kampemba', 'Kivu', 'Lualaba', 'Kasaï',
    ],
    honorees: [
      'Patrice Lumumba', 'Simon Kimbangu', 'Joseph Kasa-Vubu', 'Kimpa Vita', 'Cardinal Malula',
      'Bienheureuse Anuarite', 'Isidore Bakanja', 'Monseigneur Munzihirwa',
    ],
    schoolNames: {
      primary: ['École Primaire {place} {n}', 'École Primaire {honoree}', 'Complexe Scolaire {place}'],
      middle: ['Collège {honoree}', 'Complexe Scolaire {honoree}'],
      high: ['Institut {place}', 'Lycée {honoree}', 'Institut Technique {place}'],
    },
    universityNames: [
      'University of {city}', 'Université {honoree}', 'Université Protestante au Congo', 'Université Catholique du Congo',
    ],
    streetNames: ['Avenue {honoree}', 'Boulevard {honoree}', 'Avenue {place}'],
    terms: {
      primary: 'primary school',
      middle: 'secondary school',
      high: 'humanités',
      university: 'university',
      finalExam: 'the Exetat',
      schoolDance: "the finalists' party",
      licenseOffice: 'the auto-école',
      emergencyNumber: '112',
    },
    getaways: ['Lake Kivu', 'Bukavu', 'Goma', 'Muanda', 'Kisantu', 'the Zongo Falls', 'Brazzaville', 'Kigali'],
    holidays: ['Christmas', "New Year's Day", 'Easter', 'Independence Day', "Parents' Day", 'Heroes Day'],
    foods: [
      'fufu', 'pondu', 'moambe chicken', 'liboké', 'chikwangue', 'makayabu', 'mikate', 'ntaba', 'makemba',
      'grilled tilapia',
    ],
    drinks: ['tangawisi', 'palm wine', 'a big bottle of beer'],
    sports: ['football', 'basketball', 'boxing', 'volleyball'],
    transport: ['a taxi-bus', 'a wewa', 'an esprit de mort', 'a Transco bus', 'a pirogue'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'the Congo River', 'Virunga National Park', 'Mount Nyiragongo', 'the Lola ya Bonobo sanctuary',
      'the Boulevard du 30 Juin', 'the Échangeur de Limete', 'the Zongo Falls', 'Lake Kivu',
    ],
    hangouts: ['a nganda', 'Matonge', 'Rond-Point Victoire', 'the market', 'the riverbank', 'a rumba club'],
    dateSpots: ['a nganda', 'a rumba club', 'the riverbank', 'a terrace bar in Gombe', 'an ice cream shop'],
  },

  // Egypt: preparatory school, the Thanaweya Amma, microbuses and ahwas.
  eg: {
    countryId: 'eg',
    placeWords: [
      'Zamalek', 'Maadi', 'Heliopolis', 'Dokki', 'Mohandessin', 'Nasr City', 'Garden City', 'Shubra', 'Abbasiya',
      'Manial', 'Imbaba', 'Helwan', 'Smouha', 'Sidi Gaber', 'Roushdy',
    ],
    honorees: [
      'Taha Hussein', 'Naguib Mahfouz', 'Ahmed Shawqi', 'Umm Kulthum', 'Ahmed Orabi', 'Mostafa Kamel', 'Talaat Harb',
      'Saad Zaghloul', 'Mohamed Farid', 'Huda Shaarawi',
    ],
    schoolNames: {
      primary: ['{honoree} Primary School', '{place} Experimental Language School', '{place} Official Language School'],
      middle: ['{honoree} Preparatory School', '{place} Preparatory School'],
      high: ['{honoree} Secondary School', '{place} Secondary School'],
    },
    universityNames: ['{city} University', 'Cairo University', 'Ain Shams University', 'Al-Azhar University'],
    streetNames: ['{honoree} Street', '{place} Street', '{honoree} Square'],
    terms: {
      primary: 'primary school',
      middle: 'preparatory school',
      high: 'secondary school',
      university: 'university',
      finalExam: 'the Thanaweya Amma',
      schoolDance: 'the graduation party',
      licenseOffice: 'the traffic department',
      emergencyNumber: '123',
    },
    getaways: ['Sharm El Sheikh', 'Hurghada', 'Dahab', 'Ain Sokhna', 'the North Coast', 'Siwa', 'Luxor', 'Marsa Alam'],
    holidays: ['Ramadan', 'Eid al-Fitr', 'Eid al-Adha', 'Sham el-Nessim', 'Coptic Christmas', 'Coptic Easter', 'Mawlid'],
    foods: [
      'koshari', 'ful medames', "ta'meya", 'molokhia', 'mahshi', 'fatta', 'hawawshi', 'feteer meshaltet', 'om ali',
      'basbousa', 'liver sandwiches', 'shawarma',
    ],
    drinks: ['sugarcane juice', 'tea with mint', 'sahlab', 'karkadeh'],
    sports: ['football', 'squash', 'handball', 'basketball', 'swimming'],
    transport: ['a microbus', 'the metro', 'a tuk-tuk', 'a taxi', 'a felucca'],
    climate: 'arid',
    snow: false,
    landmarks: [
      'the Pyramids of Giza', 'the Sphinx', 'Karnak Temple', 'Abu Simbel', 'the Grand Egyptian Museum',
      'Khan el-Khalili', 'the Citadel of Saladin', 'the Valley of the Kings',
    ],
    hangouts: ['an ahwa', 'the Corniche', 'the mall', 'Khan el-Khalili', 'downtown Cairo'],
    dateSpots: ['the Corniche', 'Al-Azhar Park', 'a juice shop', 'the Cairo Tower', 'a Nile-side café'],
  },

  // Ethiopia: Addis neighborhoods, the matric exam, bajajs, buna and its own calendar of feasts.
  et: {
    countryId: 'et',
    placeWords: [
      'Bole', 'Piassa', 'Kazanchis', 'Merkato', 'Sarbet', 'Arat Kilo', 'Sidist Kilo', 'Megenagna', 'Lideta', 'Kolfe',
      'Entoto', 'Yeka', 'Gullele', 'Abay', 'Tana',
    ],
    honorees: [
      'Menelik II', 'Empress Taytu', 'Abebe Bikila', 'Emperor Tewodros', 'Yohannes IV', 'Ras Alula', 'Abune Petros',
      'Tsegaye Gabre-Medhin', 'Zera Yacob',
    ],
    schoolNames: {
      primary: ['{place} Primary School', '{honoree} Primary School'],
      middle: ['{place} Middle School', '{honoree} Middle School'],
      high: ['{honoree} Secondary School', '{place} Secondary and Preparatory School', '{place} Preparatory School'],
    },
    universityNames: ['{city} University', 'Addis Ababa University', 'Haramaya University'],
    streetNames: ['{place} Road', '{honoree} Avenue', '{honoree} Street'],
    terms: {
      primary: 'primary school',
      middle: 'middle school',
      high: 'secondary school',
      university: 'university',
      finalExam: 'the matric exam',
      schoolDance: 'the graduation party',
      licenseOffice: 'the licensing authority',
      emergencyNumber: '907',
    },
    getaways: ['Lalibela', 'Bahir Dar', 'Lake Langano', 'Hawassa', 'Gondar', 'Bishoftu', 'the Simien Mountains', 'Axum'],
    holidays: ['Meskel', 'Timkat', 'Genna', 'Enkutatash', 'Fasika', 'Eid al-Fitr', 'Eid al-Adha', 'Irreecha'],
    foods: [
      'injera with doro wat', 'tibs', 'kitfo', 'shiro', 'firfir', 'beyaynetu', 'misir wat', 'dulet', 'genfo',
      'ambasha', 'kolo',
    ],
    drinks: ['buna', 'tej', 'a macchiato', 'tella'],
    sports: ['football', 'long-distance running', 'cycling', 'basketball'],
    transport: ['a minibus taxi', 'a bajaj', 'the light rail', 'an Anbessa bus'],
    climate: 'temperate',
    snow: false,
    landmarks: [
      'the rock-hewn churches of Lalibela', 'the Simien Mountains', 'Fasil Ghebbi', 'the obelisks of Axum',
      'the Blue Nile Falls', 'the Danakil Depression', 'Entoto Park', 'Unity Park',
    ],
    hangouts: ['Merkato', 'a coffee house', 'a pastry shop', 'Meskel Square', 'a juice house'],
    dateSpots: ['a pastry shop', 'a juice house', 'Entoto Park', 'an azmari bet', 'Unity Park'],
  },

  // Kenya: CBC junior school, the KCSE, matatus, boda bodas and nyama choma.
  ke: {
    countryId: 'ke',
    placeWords: [
      'Westlands', 'Kilimani', 'Karen', 'Lavington', 'Eastleigh', 'Kileleshwa', 'Parklands', 'Langata', 'Kasarani',
      'Embakasi', 'Ngong', 'Nyali', 'Milimani', 'Kisauni', 'Kibera', 'Rongai',
    ],
    honorees: [
      'Dedan Kimathi', 'Tom Mboya', 'Wangari Maathai', 'Mekatilili wa Menza', 'Koitalel Samoei', 'Ronald Ngala',
      'Pio Gama Pinto',
    ],
    schoolNames: {
      primary: ['{place} Primary School', '{place} Academy', '{honoree} Primary School'],
      middle: ['{place} Junior School', '{place} Comprehensive School'],
      high: ['{place} High School', '{place} Secondary School', '{honoree} High School'],
    },
    universityNames: ['University of {city}', '{honoree} University', 'Kenyatta University', 'Strathmore University'],
    streetNames: ['{honoree} Street', '{place} Road', '{honoree} Avenue', '{honoree} Road'],
    terms: {
      primary: 'primary school',
      middle: 'junior school',
      high: 'high school',
      university: 'university',
      finalExam: 'the KCSE',
      schoolDance: 'the funkies',
      licenseOffice: 'the NTSA test centre',
      emergencyNumber: '999',
    },
    getaways: ['Mombasa', 'Diani', 'Naivasha', 'the Maasai Mara', 'Lamu', 'Malindi', 'Watamu', 'Zanzibar'],
    holidays: ['Christmas', 'Easter', "New Year's Eve", 'Madaraka Day', 'Jamhuri Day', 'Mashujaa Day', 'Eid al-Fitr'],
    foods: [
      'ugali and sukuma wiki', 'nyama choma', 'chapati', 'pilau', 'githeri', 'mandazi', 'mutura', 'samosas',
      'chips mwitu', 'smokies with kachumbari', 'mukimo',
    ],
    drinks: ['chai', 'a cold beer', 'mursik'],
    sports: ['football', 'rugby sevens', 'athletics', 'volleyball'],
    transport: ['a matatu', 'a boda boda', 'a tuk-tuk', 'the SGR train'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'the Maasai Mara', 'Mount Kenya', 'Nairobi National Park', 'Fort Jesus', 'Lake Nakuru', "Hell's Gate",
      'the KICC', 'the Giraffe Centre',
    ],
    hangouts: ['the mall', 'a nyama choma joint', 'Uhuru Park', 'the CBD', 'a club in Westlands'],
    dateSpots: ['a nyama choma joint', 'Karura Forest', 'Uhuru Park', 'a rooftop lounge in Westlands', 'the Nairobi Arboretum'],
  },

  // Morocco: collège and lycée qualifiant, the bac, petits taxis, mint tea and Friday couscous.
  ma: {
    countryId: 'ma',
    placeWords: [
      'Maârif', 'Gauthier', 'Anfa', 'Hay Hassani', 'Ain Diab', 'Bourgogne', 'Gueliz', 'Hivernage', 'Agdal', 'Hay Riad',
      'Souissi', 'Malabata', 'Talborjt', 'Bouregreg', 'Oum Er-Rbia',
    ],
    honorees: [
      'Mohammed V', 'Ibn Battuta', 'Ibn Khaldoun', 'Ibn Rushd', 'Ibn Tofail', 'Ibn Zohr', 'Abdelkrim El Khattabi',
      'Allal El Fassi', 'Fatima al-Fihri', 'Youssef Ibn Tachfine',
    ],
    schoolNames: {
      primary: ['École {honoree}', 'École primaire {place}', 'Groupe Scolaire {place}'],
      middle: ['Collège {honoree}', 'Collège {place}'],
      high: ['Lycée {honoree}', 'Lycée Qualifiant {honoree}', 'Lycée {place}'],
    },
    universityNames: ['Université {honoree}', 'Université Cadi Ayyad', 'Al Akhawayn University'],
    streetNames: ['Rue {honoree}', 'Avenue {honoree}', 'Boulevard {honoree}'],
    terms: {
      primary: 'primary school',
      middle: 'collège',
      high: 'lycée',
      university: 'university',
      finalExam: 'the bac',
      schoolDance: 'the end-of-year gala',
      licenseOffice: 'the NARSA test center',
      emergencyNumber: '15',
    },
    getaways: ['Marrakesh', 'Essaouira', 'Chefchaouen', 'Agadir', 'Merzouga', 'Ifrane', 'Dakhla', 'Taghazout'],
    holidays: ['Ramadan', 'Eid al-Fitr', 'Eid al-Adha', 'Mawlid', 'Throne Day', 'Ashura', 'Yennayer'],
    foods: [
      'tagine', 'Friday couscous', 'harira', 'pastilla', 'msemen', 'rfissa', 'tanjia', 'baghrir', 'babbouche',
      'chebakia', 'sfenj',
    ],
    drinks: ['mint tea', 'a nous-nous', 'avocado juice'],
    sports: ['football', 'athletics', 'boxing', 'tennis', 'surfing'],
    transport: ['a petit taxi', 'a grand taxi', 'the tramway', 'the Al Boraq train', 'the bus'],
    climate: 'mediterranean',
    snow: false,
    landmarks: [
      'the Hassan II Mosque', 'Jemaa el-Fnaa', 'the Majorelle Garden', 'the Chouara tannery',
      'the blue streets of Chefchaouen', 'the Kasbah of the Udayas', 'the Erg Chebbi dunes', 'the Hassan Tower',
    ],
    hangouts: ['a café terrace', 'the medina', 'the Corniche', 'the hammam', 'the souk'],
    dateSpots: ['the Corniche', 'a café terrace', 'an ice cream shop', 'the Arab League Park', 'a rooftop in the medina'],
  },

  // Nigeria: JSS/SSS, WAEC, send-forth parties, danfos, kekes and suya spots.
  ng: {
    countryId: 'ng',
    placeWords: [
      'Ikeja', 'Surulere', 'Yaba', 'Lekki', 'Ikoyi', 'Ajah', 'Gbagada', 'Festac', 'Agege', 'Wuse', 'Garki', 'Maitama',
      'Bodija', 'Rumuola', 'Independence Layout',
    ],
    honorees: [
      'Herbert Macaulay', 'Obafemi Awolowo', 'Nnamdi Azikiwe', 'Ahmadu Bello', 'Tafawa Balewa',
      'Funmilayo Ransome-Kuti', 'Queen Amina', 'Moremi', 'Chinua Achebe', 'Margaret Ekpo',
    ],
    schoolNames: {
      primary: ['{place} Primary School', '{honoree} Nursery and Primary School', 'LGEA Primary School, {place}'],
      middle: ['Government Junior Secondary School, {place}', '{place} Junior Grammar School'],
      high: [
        'Federal Government College, {city}', '{place} Grammar School', '{honoree} Memorial College',
        'Government Senior Secondary School, {place}',
      ],
    },
    universityNames: ['University of {city}', '{honoree} University', 'Covenant University'],
    streetNames: ['{honoree} Street', '{honoree} Way', '{place} Road', '{honoree} Close'],
    terms: {
      primary: 'primary school',
      middle: 'junior secondary school',
      high: 'senior secondary school',
      university: 'university',
      finalExam: 'WAEC',
      schoolDance: 'the send-forth party',
      licenseOffice: 'the FRSC office',
      emergencyNumber: '112',
    },
    getaways: ['Obudu', 'Calabar', 'Dubai', 'Accra', 'Jos', 'Badagry', 'Tarkwa Bay'],
    holidays: ['Christmas', 'Sallah', 'Easter', 'Ramadan', 'Independence Day', "New Year's Eve", 'Democracy Day'],
    foods: [
      'jollof rice', 'pounded yam and egusi', 'suya', 'pepper soup', 'puff-puff', 'moi moi', 'amala and ewedu', 'dodo',
      'akara', 'ofada rice', 'chin chin', 'tuwo shinkafa',
    ],
    drinks: ['zobo', 'palm wine', 'a Chapman', 'kunu'],
    sports: ['football', 'basketball', 'athletics', 'boxing', 'table tennis'],
    transport: ['a danfo', 'a keke', 'an okada', 'the BRT bus'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'Zuma Rock', 'Olumo Rock', 'the National Theatre', 'Yankari Game Reserve', 'the Lekki Conservation Centre',
      'the Osun-Osogbo Sacred Grove', 'the Erin Ijesha Waterfalls', 'the Obudu Cattle Ranch',
    ],
    hangouts: ['a buka', 'a suya spot', 'the mall', 'an owambe', 'Freedom Park'],
    dateSpots: ['a suya spot', 'Freedom Park', 'a lounge on the Island', 'the cinema at the mall', 'Elegushi Beach'],
  },

  // South Africa: matric and the matric dance, varsity, minibus taxis, braais and shisa nyamas.
  za: {
    countryId: 'za',
    placeWords: [
      'Sandton', 'Rosebank', 'Braamfontein', 'Melville', 'Sea Point', 'Rondebosch', 'Umhlanga', 'Glenwood', 'Hatfield',
      'Orlando', 'Diepkloof', 'Khayelitsha', 'Mitchells Plain', 'Constantia', 'Westville',
    ],
    honorees: [
      'Nelson Mandela', 'Walter Sisulu', 'Oliver Tambo', 'Steve Biko', 'Albert Luthuli', 'Desmond Tutu',
      'Lilian Ngoyi', 'Charlotte Maxeke', 'Robert Sobukwe', 'Helen Joseph',
    ],
    schoolNames: {
      primary: ['{place} Primary School', 'Laerskool {place}'],
      middle: ['{place} Prep', '{place} Senior Primary School'],
      high: ['{place} High School', 'Hoërskool {place}', '{honoree} Secondary School'],
    },
    universityNames: ['University of {city}', 'Wits University', 'Stellenbosch University', '{honoree} University'],
    streetNames: ['{honoree} Drive', '{place} Road', '{honoree} Street', '{place} Main Road'],
    terms: {
      primary: 'primary school',
      middle: 'senior primary',
      high: 'high school',
      university: 'varsity',
      finalExam: 'the matric exams',
      schoolDance: 'the matric dance',
      licenseOffice: 'the licensing department',
      emergencyNumber: '10177',
    },
    getaways: ['the Garden Route', 'Cape Town', 'the Drakensberg', 'Durban', 'Mauritius', 'Knysna', 'Sun City', 'the Kruger'],
    holidays: ['Christmas', 'Easter', "New Year's Eve", 'Heritage Day', 'Freedom Day', 'Youth Day', 'Diwali', 'Eid'],
    foods: [
      'boerewors', 'bunny chow', 'pap and wors', 'bobotie', 'biltong', 'vetkoek', 'koeksisters', 'chakalaka',
      'malva pudding', 'potjiekos',
    ],
    drinks: ['rooibos tea', 'umqombothi', 'a cold beer'],
    sports: ['soccer', 'rugby', 'cricket', 'netball'],
    transport: ['a minibus taxi', 'the Gautrain', 'the train', 'the bus'],
    climate: 'temperate',
    snow: false,
    landmarks: [
      'Table Mountain', 'Robben Island', 'the Kruger National Park', 'the Apartheid Museum', 'Cape Point',
      'the Union Buildings', 'the Cradle of Humankind', 'Vilakazi Street',
    ],
    hangouts: ['a shisa nyama', 'the mall', 'a braai', 'the beachfront', 'Long Street'],
    dateSpots: ['the V&A Waterfront', 'a shisa nyama', 'the beachfront', 'Maboneng', 'a coffee shop in Melville'],
  },

  // Tunisia: collège, lycée pilote, the bac, louages, brik and lablabi.
  tn: {
    countryId: 'tn',
    placeWords: [
      'El Menzah', 'Ennasr', 'El Manar', 'Lafayette', 'Bab Souika', 'Bab Saadoun', 'Le Bardo', 'La Goulette',
      'Le Kram', 'La Marsa', 'Carthage', 'Sidi Bou Saïd', 'Mutuelleville', 'Medjerda',
    ],
    honorees: [
      'Farhat Hached', 'Aboul-Qacem Echebbi', 'Tahar Haddad', 'Ibn Khaldoun', 'Hannibal', 'Kheireddine Pacha',
      'Ali Belhouane', 'Hédi Chaker', 'Tahar Ben Achour', 'Elissa',
    ],
    schoolNames: {
      primary: ['École Primaire {honoree}', 'École Primaire {place}'],
      middle: ['Collège {honoree}', 'Collège {place}'],
      high: ['Lycée {honoree}', 'Lycée Secondaire {place}', 'Lycée Pilote {city}'],
    },
    universityNames: ['University of {city}', 'Université Tunis El Manar', 'Université de Carthage'],
    streetNames: ['Rue {honoree}', 'Avenue {honoree}', 'Avenue Habib Bourguiba'],
    terms: {
      primary: 'primary school',
      middle: 'collège',
      high: 'lycée',
      university: 'university',
      finalExam: 'the bac',
      schoolDance: 'the end-of-year party',
      licenseOffice: 'the ATTT test center',
      emergencyNumber: '190',
    },
    getaways: ['Hammamet', 'Djerba', 'Sousse', 'Tabarka', 'Sidi Bou Saïd', 'Tozeur', 'Mahdia', 'the Kerkennah Islands'],
    holidays: ['Ramadan', 'Eid al-Fitr', 'Eid al-Adha', 'Mawlid', 'Independence Day', "New Year's Eve"],
    foods: [
      'couscous', 'brik', 'lablabi', 'ojja', 'kafteji', 'fricassé', 'Tunisian chapati', 'mloukhia', 'makroudh',
      'bambalouni', 'mechouia salad',
    ],
    drinks: ['mint tea with pine nuts', 'a capucin', 'lagmi', 'citronnade'],
    sports: ['football', 'handball', 'volleyball', 'tennis', 'swimming'],
    transport: ['a louage', 'the metro', 'the TGM train', 'a yellow taxi'],
    climate: 'mediterranean',
    snow: false,
    landmarks: [
      'the ruins of Carthage', 'the Bardo Museum', 'the El Jem amphitheatre', 'Sidi Bou Saïd',
      'the Great Mosque of Kairouan', 'the Medina of Tunis', 'Chott el Djerid', 'Ksar Ouled Soltane',
    ],
    hangouts: ['a café in the medina', 'La Marsa beach', 'Avenue Habib Bourguiba', 'the souk', 'a chicha café'],
    dateSpots: ['Sidi Bou Saïd', 'a café in La Marsa', 'the Belvédère Park', 'a fish restaurant in La Goulette', 'an ice cream shop'],
  },

  // Uganda: O-level and A-level, UNEB, boda bodas, rolexes and matoke.
  ug: {
    countryId: 'ug',
    placeWords: [
      'Kololo', 'Nakasero', 'Ntinda', 'Kansanga', 'Makindye', 'Bugolobi', 'Wandegeya', 'Kireka', 'Muyenga',
      'Kabalagala', 'Mengo', 'Rubaga', 'Nsambya', 'Naguru', 'Bukoto', 'Namugongo',
    ],
    honorees: [
      'Janani Luwum', 'Benedicto Kiwanuka', 'Kabalega', 'St. Charles Lwanga', 'St. Kizito', 'Apolo Kagwa', 'Kintu',
      'Philly Lutaaya',
    ],
    schoolNames: {
      primary: ['{place} Primary School', '{honoree} Primary School', '{place} Junior School'],
      middle: ['{place} Secondary School', '{honoree} Secondary School'],
      high: ['{place} High School', '{place} College', '{honoree} College'],
    },
    universityNames: ['Makerere University', '{city} University', 'Uganda Christian University', 'Kyambogo University'],
    streetNames: ['{honoree} Road', '{place} Road', '{honoree} Street'],
    terms: {
      primary: 'primary school',
      middle: 'O-level',
      high: 'A-level',
      university: 'university',
      finalExam: 'the UNEB exams',
      schoolDance: 'the send-off party',
      licenseOffice: 'the driving permit office',
      emergencyNumber: '999',
    },
    getaways: ['Entebbe', 'Jinja', 'the Ssese Islands', 'Lake Bunyonyi', 'Fort Portal', 'Murchison Falls', 'Zanzibar'],
    holidays: ['Christmas', 'Easter', "Martyrs' Day", 'Independence Day', "New Year's Eve", 'Eid al-Fitr', 'Heroes Day'],
    foods: [
      'matoke', 'rolex', 'luwombo', 'posho and beans', 'groundnut sauce', 'muchomo', 'katogo', 'gonja', 'nsenene',
      'kikomando',
    ],
    drinks: ['milky African tea', 'tonto', 'a cold beer', 'bushera'],
    sports: ['football', 'netball', 'boxing', 'rugby', 'athletics'],
    transport: ['a boda boda', 'a taxi', 'a special hire', 'the bus'],
    climate: 'tropical',
    snow: false,
    landmarks: [
      'the source of the Nile', 'Murchison Falls', 'Bwindi Impenetrable Forest', 'the Kasubi Tombs',
      'the Namugongo Martyrs Shrine', 'Lake Victoria', 'the Rwenzori Mountains', 'Queen Elizabeth National Park',
    ],
    hangouts: ['Kabalagala', 'a rolex stand', 'the taxi park', 'Owino market', 'a bar in Kololo'],
    dateSpots: ['the Entebbe Botanical Gardens', 'a rooftop bar in Kololo', 'a beach on Lake Victoria', 'a rolex stand', 'the cinema'],
  },

  // Zimbabwe: O-level/A-level, ZIMSEC, the VID, kombis and sadza.
  zw: {
    countryId: 'zw',
    placeWords: [
      'Avondale', 'Borrowdale', 'Mbare', 'Highfield', 'Mabelreign', 'Greendale', 'Belvedere', 'Mount Pleasant',
      'Glen View', 'Kuwadzana', 'Hillside', 'Makokoba', 'Entumbane', 'Nkulumane',
    ],
    honorees: [
      'Mbuya Nehanda', 'Sekuru Kaguvi', 'Joshua Nkomo', 'Herbert Chitepo', 'Josiah Tongogara', 'Leopold Takawira',
      'Jason Moyo', 'Lookout Masuku', 'Samora Machel', 'Julius Nyerere',
    ],
    schoolNames: {
      primary: ['{place} Primary School', '{honoree} Primary School'],
      middle: ['{place} Secondary School', '{place} High School'],
      high: ['{place} High School', '{honoree} High School', '{place} College'],
    },
    universityNames: ['University of Zimbabwe', 'Midlands State University', 'Great Zimbabwe University', 'Africa University'],
    streetNames: ['{honoree} Avenue', '{honoree} Street', '{place} Road', '{honoree} Way'],
    terms: {
      primary: 'primary school',
      middle: 'O-level',
      high: 'A-level',
      university: 'university',
      finalExam: 'the ZIMSEC exams',
      schoolDance: 'the school social',
      licenseOffice: 'the VID',
      emergencyNumber: '999',
    },
    getaways: ['Victoria Falls', 'Nyanga', 'Kariba', 'the Matopos', 'the Vumba', 'Beira', 'Durban'],
    holidays: ['Christmas', 'Easter', 'Independence Day', "Heroes' Day", "New Year's Eve", 'Unity Day'],
    foods: [
      'sadza and beef stew', 'sadza with muriwo', 'madora', 'maputi', 'roadrunner chicken', 'dovi', 'kapenta',
      'boerewors', 'mazhanje',
    ],
    drinks: ['maheu', 'very sweet tea', 'opaque beer'],
    sports: ['football', 'cricket', 'rugby', 'netball'],
    transport: ['a kombi', 'a mushikashika', 'a ZUPCO bus', 'a scotch cart'],
    climate: 'temperate',
    snow: false,
    landmarks: [
      'Victoria Falls', 'Great Zimbabwe', 'the Matopos', 'Lake Kariba', 'Mana Pools', 'Hwange National Park',
      'the Balancing Rocks', 'Domboshava',
    ],
    hangouts: ['the shops', 'a braai', 'Mbare Musika', 'a shebeen', 'the Avondale flea market'],
    dateSpots: ['the Harare Gardens', 'a braai', 'Domboshava', "Sam Levy's Village", 'Lake Chivero'],
  },

  // ----- Middle East -----

  // Georgia: numbered public schools, the Unified National Exams, marshrutkas and supras.
  ge: {
    countryId: 'ge',
    placeWords: [
      'Vake', 'Saburtalo', 'Vera', 'Sololaki', 'Mtatsminda', 'Didube', 'Gldani', 'Isani', 'Avlabari', 'Ortachala',
      'Nadzaladevi', 'Varketili', 'Dighomi', 'Mtkvari', 'Rioni',
    ],
    honorees: [
      'Shota Rustaveli', 'Ilia Chavchavadze', 'Akaki Tsereteli', 'Queen Tamar', 'David Aghmashenebeli',
      'Vazha-Pshavela', 'Niko Pirosmani', 'Galaktion Tabidze', 'Ivane Javakhishvili', 'Iakob Gogebashvili',
    ],
    schoolNames: {
      primary: ['{city} Public School No. {n}', '{honoree} School'],
      middle: ['{city} Public School No. {n}', '{honoree} School'],
      high: ['{city} Public School No. {n}', '{honoree} Lyceum', '{city} Physics and Mathematics School'],
    },
    universityNames: ['{city} State University', 'Tbilisi State University', 'Ilia State University', 'Georgian Technical University'],
    streetNames: ['{honoree} Avenue', '{honoree} Street', '{place} Street'],
    terms: {
      primary: 'primary school',
      middle: 'middle school',
      high: 'high school',
      university: 'university',
      finalExam: 'the Unified National Exams',
      schoolDance: 'the graduation ball',
      licenseOffice: 'the Service Agency',
      emergencyNumber: '112',
    },
    getaways: ['Batumi', 'Kazbegi', 'Sighnaghi', 'Gudauri', 'Borjomi', 'Mestia', 'Kakheti', 'Kobuleti'],
    holidays: [
      "New Year's Eve", 'Orthodox Christmas', 'Orthodox Easter', 'Tbilisoba', 'Independence Day', 'Giorgoba',
      'Mariamoba', 'Rtveli',
    ],
    foods: [
      'khachapuri', 'khinkali', 'mtsvadi', 'lobio', 'badrijani', 'churchkhela', 'pkhali', 'chakapuli', 'satsivi',
      'mchadi', 'Adjarian khachapuri',
    ],
    drinks: ['qvevri wine', 'chacha', 'tarragon lemonade'],
    sports: ['football', 'rugby', 'wrestling', 'basketball', 'judo'],
    transport: ['a marshrutka', 'the metro', 'the bus', 'the cable car'],
    climate: 'temperate',
    snow: true,
    landmarks: [
      'Narikala Fortress', 'the Gergeti Trinity Church', 'Svetitskhoveli Cathedral', 'the Bridge of Peace',
      'Uplistsikhe', 'the Vardzia cave monastery', 'the Mother of Georgia statue', 'the Ali and Nino statue',
    ],
    hangouts: ['the Dry Bridge market', 'Rustaveli Avenue', 'a supra', 'the sulfur baths', 'Mtatsminda Park'],
    dateSpots: ['Mtatsminda Park', 'a wine bar in Old Tbilisi', 'the Batumi Boulevard', 'Turtle Lake', 'the sulfur baths'],
  },

  // Iran: dabestan and dabirestan, the Konkur, Nowruz and Yalda, tahdig fights at dinner.
  ir: {
    countryId: 'ir',
    placeWords: [
      'Tajrish', 'Niavaran', 'Saadat Abad', 'Vanak', 'Narmak', 'Tehranpars', 'Shahrak-e Gharb', 'Darband', 'Shemiran',
      'Jolfa', 'Chaharbagh', 'Eram', 'Alborz', 'Damavand', 'Zayandeh Rud',
    ],
    honorees: [
      'Ferdowsi', 'Hafez', 'Saadi', 'Khayyam', 'Ibn Sina', 'Rumi', 'Amir Kabir', 'Parvin Etesami', 'Razi', 'Kharazmi',
    ],
    schoolNames: {
      primary: ['Dabestan-e {honoree}', '{honoree} Primary School'],
      middle: ['{honoree} Middle School', '{place} Middle School'],
      high: ['Dabirestan-e {honoree}', '{honoree} High School', '{city} NODET High School'],
    },
    universityNames: [
      'University of {city}', '{city} University of Medical Sciences', 'Sharif University of Technology', '{honoree} University',
    ],
    streetNames: ['{honoree} Street', '{honoree} Avenue', '{place} Boulevard', 'Valiasr Street'],
    terms: {
      primary: 'primary school',
      middle: 'middle school',
      high: 'high school',
      university: 'university',
      finalExam: 'the Konkur',
      schoolDance: 'the graduation ceremony',
      licenseOffice: 'the traffic police test center',
      emergencyNumber: '115',
    },
    getaways: ['Kish Island', 'Ramsar', 'Shiraz', 'Isfahan', 'Qeshm', 'Yazd', 'Mashhad', 'Istanbul'],
    holidays: ['Nowruz', 'Yalda Night', 'Chaharshanbe Suri', 'Sizdah Bedar', 'Ramadan', 'Eid al-Fitr', 'Eid al-Adha'],
    foods: [
      'chelo kabab', 'ghormeh sabzi', 'tahdig', 'fesenjan', 'ash reshteh', 'zereshk polo', 'kashk-e bademjan', 'dizi',
      'kuku sabzi', 'sholeh zard', 'saffron ice cream', 'faloodeh',
    ],
    drinks: ['black tea with a sugar cube', 'doogh', 'sharbat'],
    sports: ['football', 'wrestling', 'volleyball', 'futsal', 'weightlifting'],
    transport: ['the metro', 'a shared taxi', 'a motorcycle taxi', 'the BRT bus'],
    climate: 'arid',
    snow: true,
    landmarks: [
      'Persepolis', 'Naqsh-e Jahan Square', 'the Azadi Tower', 'the Si-o-se-pol bridge', 'the Tomb of Hafez',
      'the Pink Mosque', 'Mount Damavand', 'the Golestan Palace',
    ],
    hangouts: ['a coffee shop', 'Tajrish Bazaar', 'Darband', 'the mall', 'a traditional teahouse', 'the Grand Bazaar'],
    dateSpots: ['Darband', 'the Tabiat Bridge', 'a traditional teahouse', 'Eram Garden', 'a café on Valiasr Street'],
  },

  // Iraq: intermediate and preparatory school, the ministerial exams, masgouf by the Tigris.
  iq: {
    countryId: 'iq',
    placeWords: [
      'Karrada', 'Mansour', 'Adhamiyah', 'Kadhimiya', 'Jadriya', 'Zayouna', 'Yarmouk', 'Bab al-Sharqi', 'Ashar',
      'Ankawa', 'Dijla', 'Furat', 'Babil', 'Sumer',
    ],
    honorees: [
      'Al-Mutanabbi', 'Abu Nuwas', 'Harun al-Rashid', 'Ibn al-Haytham', 'Al-Kindi', 'Badr Shakir al-Sayyab',
      'Al-Jawahiri', 'Nazik al-Malaika', 'Hammurabi', 'Ibn Sina',
    ],
    schoolNames: {
      primary: ['{honoree} Primary School', '{place} Primary School'],
      middle: ['{honoree} Intermediate School', '{place} Intermediate School'],
      high: ['{honoree} Preparatory School', '{place} Preparatory School', "{city} Distinguished Students' School"],
    },
    universityNames: ['University of {city}', 'Al-Mustansiriya University', 'University of Technology'],
    streetNames: ['{honoree} Street', '{place} Street', '{place} Road'],
    terms: {
      primary: 'primary school',
      middle: 'intermediate school',
      high: 'preparatory school',
      university: 'university',
      finalExam: 'the ministerial exams',
      schoolDance: 'the graduation party',
      licenseOffice: 'the traffic directorate',
      emergencyNumber: '122',
    },
    getaways: ['Shaqlawa', 'Erbil', 'Sulaymaniyah', 'Duhok', 'Gali Ali Beg', 'Istanbul', 'Beirut'],
    holidays: ['Ramadan', 'Eid al-Fitr', 'Eid al-Adha', 'Nowruz', 'Ashura', 'Mawlid', 'Christmas'],
    foods: [
      'masgouf', 'dolma', 'kubba', 'tashreeb', 'Iraqi biryani', 'kahi with geymar', 'quzi', 'tepsi baytinjan',
      'kleicha', 'samoon', 'falafel',
    ],
    drinks: ['chai in an istikan', 'laban', 'noomi basra tea'],
    sports: ['football', 'futsal', 'volleyball', 'basketball', 'weightlifting'],
    transport: ['a minibus', 'a tuk-tuk', 'a taxi', 'a boat across the Tigris'],
    climate: 'arid',
    snow: false,
    landmarks: [
      'the Ziggurat of Ur', 'the ruins of Babylon', 'the Erbil Citadel', 'Al-Mutanabbi Street', 'the Imam Ali Shrine',
      'the Monument of Liberty', 'the Mesopotamian Marshes', 'the ruins of Hatra',
    ],
    hangouts: ['Abu Nuwas Street', 'a shisha café', 'Al-Mutanabbi Street', 'the Shabandar Café', 'the mall', 'Zawraa Park'],
    dateSpots: [
      'Zawraa Park', 'a riverside restaurant on Abu Nuwas Street', 'an ice cream shop in Karrada', 'the Erbil Citadel',
      'a café in Ankawa',
    ],
  },

  // Israel: the bagrut, sheruts, the shuk and the beach; couples who want a civil wedding fly to Cyprus.
  il: {
    countryId: 'il',
    placeWords: [
      'Rehavia', 'Talbiya', 'Katamon', 'Ein Kerem', 'Florentin', 'Neve Tzedek', 'Ramat Aviv', 'Jaffa', 'Hadar',
      'Carmel', 'Bat Galim', 'Ahuza', 'Kiryat Hayovel', 'Yarkon',
    ],
    honorees: [
      'Herzl', 'Bialik', "Ahad Ha'am", 'Ben-Yehuda', 'Rachel', 'Agnon', 'Henrietta Szold', 'Janusz Korczak',
      'Hannah Szenes', 'Yehuda Halevi',
    ],
    schoolNames: {
      primary: ['{honoree} Elementary School', '{place} Elementary School'],
      middle: ['{honoree} Middle School', '{place} Middle School'],
      high: ['{honoree} High School', '{place} High School', '{city} Comprehensive High School'],
    },
    universityNames: ['Tel Aviv University', 'Hebrew University of Jerusalem', 'Ben-Gurion University', 'University of Haifa'],
    streetNames: ['{honoree} Street', '{honoree} Boulevard', '{place} Street'],
    terms: {
      primary: 'elementary school',
      middle: 'middle school',
      high: 'high school',
      university: 'university',
      finalExam: 'the bagrut exams',
      schoolDance: 'the graduation party',
      licenseOffice: 'the licensing office',
      emergencyNumber: '101',
    },
    getaways: ['Eilat', 'the Galilee', 'the Dead Sea', 'Cyprus', 'Mitzpe Ramon', 'the Golan', 'Rosh Pina', 'Tiberias'],
    holidays: ['Passover', 'Rosh Hashanah', 'Hanukkah', 'Purim', 'Sukkot', 'Yom Kippur', 'Independence Day', 'Eid al-Fitr'],
    foods: [
      'falafel', 'shakshuka', 'hummus', 'sabich', 'shawarma in laffa', 'schnitzel', 'jachnun', 'bourekas', 'malabi',
      'Israeli salad', 'challah',
    ],
    drinks: ['Turkish coffee', 'an iced coffee', 'arak', 'limonana'],
    sports: ['football', 'basketball', 'matkot', 'tennis'],
    transport: ['a sherut', 'the bus', 'the light rail', 'an electric scooter', 'the train'],
    climate: 'mediterranean',
    snow: false,
    landmarks: [
      'Masada', 'the Dead Sea', "the Bahá'í Gardens", 'Old Jaffa', 'the Sea of Galilee', 'the Ramon Crater',
      'the Old City of Jerusalem', 'Rosh HaNikra',
    ],
    hangouts: ['the beach', 'the shuk', 'Rothschild Boulevard', 'the neighborhood kiosk', 'the tayelet'],
    dateSpots: ['the beach at sunset', 'a hummus place', 'the Tel Aviv Port', 'a bar in Florentin', 'the First Station'],
  },

  // Jordan: the Tawjihi (and the fireworks when results drop), servees taxis, mansaf.
  jo: {
    countryId: 'jo',
    placeWords: [
      'Abdoun', 'Weibdeh', 'Sweifieh', 'Shmeisani', 'Khalda', 'Dabouq', "Tla' al-Ali", 'Jubeiha', 'Abdali', 'Marka',
      'Hashmi', 'Um Uthaina', 'Jabal Amman', 'Jabal al-Hussein',
    ],
    honorees: [
      'Al-Sharif Hussein bin Ali', 'King Abdullah I', 'King Talal', 'Arar', 'Salah al-Din', 'Khalid ibn al-Walid',
      'Abu Ubaidah', 'Ibn Sina', 'Ibn Khaldun',
    ],
    schoolNames: {
      primary: ['{honoree} Basic School', '{place} Basic School'],
      middle: ['{honoree} Basic School', '{place} Model School'],
      high: ['{honoree} Secondary School', '{place} Comprehensive Secondary School', '{place} International School'],
    },
    universityNames: ['University of Jordan', 'Yarmouk University', '{city} University', 'Jordan University of Science and Technology'],
    streetNames: ['{honoree} Street', '{place} Street', 'Rainbow Street'],
    terms: {
      primary: 'primary school',
      middle: 'middle school',
      high: 'secondary school',
      university: 'university',
      finalExam: 'the Tawjihi',
      schoolDance: 'the Tawjihi results party',
      licenseOffice: 'the licensing department',
      emergencyNumber: '911',
    },
    getaways: ['Aqaba', 'the Dead Sea', 'Wadi Rum', 'Petra', 'Ajloun', "Ma'in Hot Springs", 'Dana', 'Sharm El Sheikh'],
    holidays: ['Ramadan', 'Eid al-Fitr', 'Eid al-Adha', 'Independence Day', 'Mawlid', 'Christmas', 'Easter'],
    foods: [
      'mansaf', 'maqluba', 'falafel', 'hummus', 'kunafa', 'shawarma', 'musakhan', 'zarb', 'galayet bandora',
      'mujaddara', "ka'ak",
    ],
    drinks: ['Arabic coffee', 'sage tea', 'lemon with mint', 'tamarind juice'],
    sports: ['football', 'basketball', 'taekwondo', 'volleyball'],
    transport: ['a servees taxi', 'a yellow taxi', 'the BRT bus', 'the bus'],
    climate: 'mediterranean',
    snow: true,
    landmarks: [
      'Petra', 'Wadi Rum', 'the Dead Sea', 'the Amman Citadel', 'the Roman Theatre', 'Jerash', 'Mount Nebo',
      'the Baptism Site',
    ],
    hangouts: ['Rainbow Street', 'a shisha café', 'the mall', 'downtown Amman', 'a kunafa shop'],
    dateSpots: ['Rainbow Street', 'a rooftop café in Weibdeh', 'a kunafa shop', 'the Abdali Boulevard', 'a café in Jabal Amman'],
  },

  // Kuwait: intermediate school, diwaniyas, malls, and water-balloon wars on National Day.
  kw: {
    countryId: 'kw',
    placeWords: [
      'Salmiya', 'Hawalli', 'Jabriya', 'Rumaithiya', 'Mishref', 'Bayan', 'Surra', 'Shuwaikh', 'Sharq', 'Mirqab',
      'Qurtuba', 'Kaifan', 'Shamiya', 'Adailiya', 'Fintas', 'Abu Halifa',
    ],
    honorees: [
      'Abdullah Al-Salem', 'Mubarak Al-Kabeer', 'Ahmad Al-Jaber', 'Fahad Al-Ahmad', 'Fahad Al-Askar',
      'Khalid ibn al-Walid', 'Ibn Khaldun', 'Al-Khansaa',
    ],
    schoolNames: {
      primary: ['{honoree} Primary School', '{place} Primary School', '{place} Bilingual School'],
      middle: ['{honoree} Intermediate School', '{place} Intermediate School'],
      high: ['{honoree} Secondary School', '{place} Secondary School'],
    },
    universityNames: [
      'Kuwait University', 'Gulf University for Science and Technology', 'American University of Kuwait',
      'Australian College of Kuwait',
    ],
    streetNames: ['{honoree} Street', '{place} Street', 'Gulf Road'],
    terms: {
      primary: 'primary school',
      middle: 'intermediate school',
      high: 'secondary school',
      university: 'university',
      finalExam: 'the twelfth-grade finals',
      schoolDance: 'the graduation ceremony',
      licenseOffice: 'the traffic department',
      emergencyNumber: '112',
    },
    getaways: ['Failaka Island', 'Khiran', 'Dubai', 'London', 'Salalah', 'Istanbul', 'Bahrain'],
    holidays: ['Ramadan', 'Eid al-Fitr', 'Eid al-Adha', 'National Day', 'Liberation Day', 'Gergean'],
    foods: [
      'machboos', 'mutabbaq zubaidi', 'harees', 'jireesh', 'gabout', 'murabyan', 'balaleet', 'shawarma', 'luqaimat',
      'dates',
    ],
    drinks: ['Arabic coffee with dates', 'karak tea', 'laban'],
    sports: ['football', 'handball', 'basketball', 'padel'],
    transport: ['a taxi', 'the bus', 'a big SUV'],
    climate: 'arid',
    snow: false,
    landmarks: [
      'the Kuwait Towers', 'the Liberation Tower', 'the Grand Mosque', 'Souq Al-Mubarakiya',
      'the Sheikh Jaber Al-Ahmad Cultural Centre', 'the Sheikh Jaber Causeway', 'Failaka Island', 'the Red Fort',
    ],
    hangouts: ['the mall', 'a diwaniya', 'Souq Al-Mubarakiya', 'Marina Crescent', 'a café on Gulf Road'],
    dateSpots: ['Marina Crescent', 'Al Shaheed Park', 'a café on Gulf Road', 'the Kuwait Towers', 'the mall food court'],
  },

  // Lebanon: Frères and public schools, the official exams, Van No. 4, manakish and arak.
  lb: {
    countryId: 'lb',
    placeWords: [
      'Achrafieh', 'Hamra', 'Gemmayzeh', 'Mar Mikhael', 'Verdun', 'Ras Beirut', 'Badaro', 'Sin el Fil', 'Dbayeh',
      'Kaslik', 'Bourj Hammoud', 'Ain el Mreisseh', 'Raouche', 'Litani', 'Chouf',
    ],
    honorees: [
      'Gibran Khalil Gibran', 'Mikhail Naimy', 'Ameen Rihani', 'Emir Fakhreddine', 'Riad Al Solh',
      'Bechara El Khoury', 'Abdel Kader', 'Imam Al-Ouzai', 'Saint Maroun',
    ],
    schoolNames: {
      primary: ['{place} Public School', 'Collège des Frères {place}', '{place} Evangelical School'],
      middle: ['{place} Intermediate Public School', 'Collège des Frères {place}'],
      high: ['{place} Official Secondary School', 'Lycée {honoree}', '{honoree} High School'],
    },
    universityNames: [
      'American University of Beirut', 'Lebanese University', 'Saint Joseph University', 'Lebanese American University',
    ],
    streetNames: ['Rue {honoree}', '{honoree} Street', '{place} Street'],
    terms: {
      primary: 'primary school',
      middle: 'intermediate school',
      high: 'secondary school',
      university: 'university',
      finalExam: 'the official exams',
      schoolDance: 'the graduation gala',
      licenseOffice: 'the Nafaa',
      emergencyNumber: '140',
    },
    getaways: ['Byblos', 'Batroun', 'the Cedars', 'Faraya', 'Cyprus', 'Tyre', 'Ehden', 'Broummana'],
    holidays: ['Christmas', 'Easter', 'Ramadan', 'Eid al-Fitr', 'Eid al-Adha', 'Independence Day', "Saint Barbara's Day"],
    foods: [
      'manakish', 'tabbouleh', 'kibbeh', 'hummus', 'shawarma', 'fattoush', 'falafel', 'kafta', 'knefeh', 'mjaddara',
      'chicken taouk',
    ],
    drinks: ['arak', 'Lebanese coffee', 'jallab', 'local wine'],
    sports: ['football', 'basketball', 'skiing'],
    transport: ['a servees', 'Van No. 4', 'a scooter', 'a taxi'],
    climate: 'mediterranean',
    snow: false,
    landmarks: [
      "Pigeons' Rock", 'the Jeita Grotto', 'Baalbek', 'the Cedars of God', 'Our Lady of Lebanon in Harissa',
      'the Byblos Citadel', 'the Beirut Corniche', 'the Mohammad Al-Amin Mosque',
    ],
    hangouts: ['Mar Mikhael', 'the Corniche', 'Hamra Street', 'a pub in Gemmayzeh', 'a beach club', 'a nargileh café'],
    dateSpots: ['the Corniche', 'a bar in Mar Mikhael', 'Zaitunay Bay', 'a rooftop in Achrafieh', 'the Sanayeh garden'],
  },

  // Qatar: preparatory school, karak stands, Souq Waqif and the Inland Sea.
  qa: {
    countryId: 'qa',
    placeWords: [
      'Al Sadd', 'Msheireb', 'Al Waab', 'Al Gharafa', 'Madinat Khalifa', 'Al Duhail', 'Al Hilal', 'Al Mansoura',
      'Najma', 'Bin Mahmoud', 'Al Messila', 'Al Aziziya', 'Onaiza', 'West Bay', 'Al Dafna',
    ],
    honorees: [
      'Sheikh Jassim', 'Abdullah bin Jassim', 'Omar bin Al Khattab', 'Khalid bin Al Waleed', 'Abu Bakr Al Siddiq',
      'Aisha bint Abi Bakr', 'Al Khansaa', 'Ibn Khaldoun',
    ],
    schoolNames: {
      primary: ['{honoree} Primary School', '{place} Primary School'],
      middle: ['{honoree} Preparatory School', '{place} Preparatory School'],
      high: ['{honoree} Secondary School', '{place} Secondary School', '{place} International School'],
    },
    universityNames: ['Qatar University', 'Lusail University', 'University of Doha for Science and Technology'],
    streetNames: ['{honoree} Street', '{place} Street', 'C Ring Road'],
    terms: {
      primary: 'primary school',
      middle: 'preparatory school',
      high: 'secondary school',
      university: 'university',
      finalExam: 'the secondary certificate exams',
      schoolDance: 'the graduation ceremony',
      licenseOffice: 'the traffic department',
      emergencyNumber: '999',
    },
    getaways: ['the Inland Sea', 'Banana Island', 'Zekreet', 'Dubai', 'Salalah', 'London', 'the Maldives', 'Istanbul'],
    holidays: ['Ramadan', 'Eid al-Fitr', 'Eid al-Adha', 'National Day', 'Garangao', 'National Sport Day'],
    foods: [
      'machboos', 'harees', 'thareed', 'balaleet', 'luqaimat', 'madrouba', 'saloona', 'mandi', 'shawarma', 'dates',
    ],
    drinks: ['karak tea', 'Arabic coffee', 'laban', 'fresh mango juice'],
    sports: ['football', 'handball', 'padel', 'basketball'],
    transport: ['the Doha Metro', 'a taxi', 'the Lusail Tram', 'a big SUV'],
    climate: 'arid',
    snow: false,
    landmarks: [
      'Souq Waqif', 'the Museum of Islamic Art', 'the National Museum of Qatar', 'Katara Cultural Village', 'the Pearl',
      'Lusail Stadium', 'the Inland Sea', 'the Doha Corniche',
    ],
    hangouts: ['Souq Waqif', 'the mall', 'Katara', 'the Corniche', 'a majlis', 'a karak stand'],
    dateSpots: ['Souq Waqif', 'Katara Beach', 'the Pearl', 'a café in Msheireb', 'MIA Park'],
  },

  // Saudi Arabia: numbered public schools, the Qudurat, the Boulevard, desert camps and kabsa.
  sa: {
    countryId: 'sa',
    placeWords: [
      'Olaya', 'Al Malaz', 'Al Nakheel', 'Al Sulaimaniyah', 'Al Rawdah', 'Al Hamra', 'Al Balad', 'Al Shati',
      'Al Faisaliyah', 'Diriyah', 'Al Aziziyah', 'Al Wurud', 'Al Murabba', 'Al Naseem',
    ],
    honorees: [
      'King Abdulaziz', 'King Faisal', 'Omar ibn al-Khattab', 'Khalid ibn al-Walid', 'Abu Bakr al-Siddiq',
      'Aisha bint Abi Bakr', 'Ibn Sina', 'Al-Farabi', 'Ibn Khaldun',
    ],
    schoolNames: {
      primary: ['{honoree} Primary School', 'Primary School No. {n} in {city}'],
      middle: ['{honoree} Intermediate School', 'Intermediate School No. {n} in {city}'],
      high: ['{honoree} Secondary School', 'Secondary School No. {n} in {city}', '{place} International School'],
    },
    universityNames: [
      'King Saud University', 'King Abdulaziz University', 'King Fahd University of Petroleum and Minerals',
      'Umm Al-Qura University',
    ],
    streetNames: ['{honoree} Road', '{place} Street', 'Tahlia Street', 'King Fahd Road'],
    terms: {
      primary: 'primary school',
      middle: 'intermediate school',
      high: 'secondary school',
      university: 'university',
      finalExam: 'the Qudurat and Tahsili exams',
      schoolDance: 'the graduation party',
      licenseOffice: 'the Muroor',
      emergencyNumber: '911',
    },
    getaways: ['AlUla', 'Abha', 'Jeddah', 'Taif', 'Umluj', 'Al Soudah', 'Bahrain', 'Dubai'],
    holidays: ['Ramadan', 'Eid al-Fitr', 'Eid al-Adha', 'National Day', 'Founding Day'],
    foods: [
      'kabsa', 'mandi', 'jareesh', 'mutabbaq', 'saleeg', 'shawarma', 'harees', 'masoub', 'ful and tamees', 'luqaimat',
      'dates',
    ],
    drinks: ['Saudi coffee with dates', 'Saudi champagne', 'laban', 'karak tea'],
    sports: ['football', 'basketball', 'volleyball', 'padel'],
    transport: ['a taxi', 'the bus', 'the Haramain train', 'a big SUV'],
    climate: 'arid',
    snow: false,
    landmarks: [
      'the Kingdom Centre', 'Hegra in AlUla', 'the Edge of the World', 'Diriyah', 'the Jeddah Corniche', 'Al Balad',
      "King Fahd's Fountain", 'the Masmak Fortress',
    ],
    hangouts: ['the mall', 'the Boulevard', 'a desert camp', 'a specialty coffee shop', 'an istiraha', 'the Corniche'],
    dateSpots: ['the Boulevard', 'a specialty coffee shop', 'the Jeddah Corniche', 'Al Balad', 'a desert camp'],
  },

  // Syria: preparatory school, the bakaloria, microbuses, Qasioun at night and Aleppo kebab.
  sy: {
    countryId: 'sy',
    placeWords: [
      'Mezzeh', 'Malki', 'Abu Rummaneh', 'Bab Touma', 'Qassaa', 'Midan', 'Muhajirin', 'Rukn al-Din', 'Kafr Sousa',
      'Salihiya', 'Aziziyeh', 'Jamiliyeh', 'Barada', 'Qasioun',
    ],
    honorees: [
      'Salah al-Din', 'Youssef al-Azmeh', 'Sultan al-Atrash', 'Ibrahim Hanano', 'Nizar Qabbani', 'Abu al-Ala al-Maarri',
      'Ibn al-Nafis', 'Khalid ibn al-Walid', 'Al-Mutanabbi', 'Jawdat al-Hashimi',
    ],
    schoolNames: {
      primary: ['{honoree} Primary School', '{place} Primary School'],
      middle: ['{honoree} Preparatory School', '{place} Preparatory School'],
      high: ['{honoree} Secondary School', '{place} Secondary School'],
    },
    universityNames: ['{city} University', 'Damascus University', 'University of Aleppo'],
    streetNames: ['{honoree} Street', '{place} Street', 'Straight Street'],
    terms: {
      primary: 'primary school',
      middle: 'preparatory school',
      high: 'secondary school',
      university: 'university',
      finalExam: 'the bakaloria',
      schoolDance: 'the graduation party',
      licenseOffice: 'the traffic directorate',
      emergencyNumber: '110',
    },
    getaways: ['Latakia', 'Tartus', 'Bloudan', 'Kassab', 'Slunfeh', 'Wadi al-Nasara', 'Zabadani', 'Beirut'],
    holidays: ['Ramadan', 'Eid al-Fitr', 'Eid al-Adha', 'Christmas', 'Easter', 'Mawlid', 'Evacuation Day', "Mother's Day"],
    foods: [
      'shawarma', 'kibbeh', 'fatteh', 'muhammara', 'yabraq', 'kabab karaz', 'shakriyeh', 'maamoul', 'mastic ice cream',
      'manakish', 'ful', 'barazek',
    ],
    drinks: ['mate', 'Arabic coffee with cardamom', 'jallab', 'tamarind juice'],
    sports: ['football', 'basketball', 'weightlifting', 'volleyball'],
    transport: ['a microbus', 'a yellow taxi', 'the bus'],
    climate: 'mediterranean',
    snow: false,
    landmarks: [
      'the Umayyad Mosque', 'the Citadel of Aleppo', 'Krak des Chevaliers', 'Palmyra', 'the Old City of Damascus',
      'Mount Qasioun', 'the waterwheels of Hama', 'Maaloula',
    ],
    hangouts: ['Souq al-Hamidiyah', 'a café in Bab Touma', 'Mount Qasioun', 'a nargileh café', 'the Latakia Corniche'],
    dateSpots: [
      'Mount Qasioun at night', 'a courtyard café in the Old City', 'an ice cream parlor in Souq al-Hamidiyah',
      'Tishreen Park', 'the Latakia Corniche',
    ],
  },

  // Turkey: ilkokul, ortaokul, Anadolu Lisesi, the YKS, dolmuşes, ferries and çay.
  tr: {
    countryId: 'tr',
    placeWords: [
      'Kadıköy', 'Beşiktaş', 'Üsküdar', 'Moda', 'Cihangir', 'Bebek', 'Nişantaşı', 'Bakırköy', 'Kızılay', 'Çankaya',
      'Bahçelievler', 'Alsancak', 'Karşıyaka', 'Bornova', 'Yeşilköy',
    ],
    honorees: [
      'Atatürk', 'Cumhuriyet', 'Yunus Emre', 'Mimar Sinan', 'Fatih Sultan Mehmet', 'Mehmet Akif Ersoy', 'Namık Kemal',
      'Nazım Hikmet', 'Barbaros Hayrettin Paşa', 'Piri Reis',
    ],
    schoolNames: {
      primary: ['{honoree} İlkokulu', '{place} İlkokulu'],
      middle: ['{honoree} Ortaokulu', '{place} Ortaokulu'],
      high: ['{honoree} Anadolu Lisesi', '{place} Anadolu Lisesi', '{city} Fen Lisesi'],
    },
    universityNames: ['{city} University', 'Boğaziçi University', 'Middle East Technical University', 'İstanbul Technical University'],
    streetNames: ['{honoree} Caddesi', '{honoree} Bulvarı', '{place} Caddesi', 'Bağdat Caddesi'],
    terms: {
      primary: 'primary school',
      middle: 'middle school',
      high: 'high school',
      university: 'university',
      finalExam: 'the YKS',
      schoolDance: 'the graduation ball',
      licenseOffice: 'the driving course',
      emergencyNumber: '112',
    },
    getaways: ['Bodrum', 'Antalya', 'Cappadocia', 'Çeşme', 'Fethiye', 'Kaş', 'Bozcaada', 'Uludağ'],
    holidays: ['Ramadan', 'Şeker Bayramı', 'Kurban Bayramı', 'Republic Day', "New Year's Eve", "Children's Day", 'Hıdırellez'],
    foods: [
      'döner', 'lahmacun', 'simit', 'mantı', 'kumpir', 'menemen', 'İskender kebab', 'börek', 'baklava', 'kokoreç',
      'midye dolma', 'lentil soup',
    ],
    drinks: ['çay', 'ayran', 'rakı', 'Turkish coffee'],
    sports: ['football', 'basketball', 'volleyball', 'wrestling'],
    transport: ['a dolmuş', 'the ferry', 'the metrobüs', 'the Marmaray', 'the tram'],
    climate: 'temperate',
    snow: true,
    landmarks: [
      'Hagia Sophia', 'the Blue Mosque', 'Cappadocia', 'Pamukkale', 'Ephesus', 'Anıtkabir', 'the Galata Tower',
      'the Grand Bazaar',
    ],
    hangouts: ['a tea garden', 'the mall', 'İstiklal Avenue', 'Bağdat Avenue', 'a nargile café', 'the Moda seaside'],
    dateSpots: ['a tea garden by the Bosphorus', 'the Moda seaside', 'a meyhane', 'Ortaköy', 'the Kordon'],
  },

  // United Arab Emirates: private schools, abras across the Creek, karak and malls in 45°C.
  ae: {
    countryId: 'ae',
    placeWords: [
      'Jumeirah', 'Deira', 'Bur Dubai', 'Al Barsha', 'Al Karama', 'Al Quoz', 'Satwa', 'Mirdif', 'Al Nahda',
      'Khalifa City', 'Al Mushrif', 'Al Khalidiya', 'Al Majaz', 'Al Qusais', 'Al Rashidiya',
    ],
    honorees: [
      'Sheikh Zayed', 'Sheikh Rashid', 'Sheikh Khalifa', 'Ahmed bin Majid', 'Al Ittihad', 'Al Khansaa',
      'Omar bin Al Khattab', 'Khalid bin Al Waleed', 'Ibn Khaldoun',
    ],
    schoolNames: {
      primary: ['{honoree} Primary School', '{place} Private School', '{place} British School'],
      middle: ['{honoree} School for Basic Education', '{place} Private School'],
      high: ['{honoree} Secondary School', '{place} Private School', '{honoree} Educational Complex'],
    },
    universityNames: ['United Arab Emirates University', 'Khalifa University', 'Zayed University', 'American University of Sharjah'],
    streetNames: ['{honoree} Road', '{honoree} Street', '{place} Street', 'Al Wasl Road'],
    terms: {
      primary: 'primary school',
      middle: 'middle school',
      high: 'high school',
      university: 'university',
      finalExam: 'the EmSAT',
      schoolDance: 'the graduation ceremony',
      licenseOffice: 'the driving institute',
      emergencyNumber: '998',
    },
    getaways: ['Hatta', 'Ras Al Khaimah', 'Fujairah', 'the Liwa Oasis', 'Musandam', 'Jebel Jais', 'the Maldives', 'Salalah'],
    holidays: ['Ramadan', 'Eid al-Fitr', 'Eid al-Adha', 'National Day', 'Haq Al Laila', 'Diwali', "New Year's Eve"],
    foods: [
      'machboos', 'harees', 'luqaimat', 'shawarma', 'chebab', 'balaleet', 'saloona', 'biryani', 'camel burgers',
      'khameer',
    ],
    drinks: ['karak chai', 'gahwa with dates', 'camel milk', 'laban'],
    sports: ['football', 'cricket', 'padel', 'basketball'],
    transport: ['the metro', 'an abra', 'a taxi', 'the tram', 'a big SUV'],
    climate: 'arid',
    snow: false,
    landmarks: [
      'the Burj Khalifa', 'the Sheikh Zayed Grand Mosque', 'the Dubai Fountain', 'the Palm Jumeirah',
      'the Museum of the Future', 'the Burj Al Arab', 'the Al Fahidi Historical District', 'Jebel Jais',
    ],
    hangouts: ['the mall', 'JBR beach', 'Kite Beach', 'a karak stand', 'Global Village', 'a majlis'],
    dateSpots: ['Kite Beach', 'Global Village', 'the Dubai Fountain', 'a café in Al Seef', 'the Abu Dhabi Corniche'],
  },
}
