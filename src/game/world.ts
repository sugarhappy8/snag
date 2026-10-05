// Countries, cities and name pools.
import { pick, weightedPick } from './rng'
import type { GameState, Gender } from './types'

export type NameRegion =
  | 'anglo'
  | 'hispanic'
  | 'portuguese'
  | 'french'
  | 'german'
  | 'dutch'
  | 'italian'
  | 'nordic'
  | 'slavic'
  | 'greek'
  | 'turkish'
  | 'arabic'
  | 'persian'
  | 'south_asian'
  | 'chinese'
  | 'japanese'
  | 'korean'
  | 'southeast_asian'
  | 'filipino'
  | 'west_african'
  | 'east_african'
  | 'southern_african'
  | 'hebrew'
  | 'irish'

export interface NamePool {
  male: string[]
  female: string[]
  last: string[]
}

export interface Country {
  id: string
  name: string
  demonym: string
  flag: string
  cities: string[]
  names: NameRegion
  /** Multiplier on salaries/prices relative to the US (1). */
  wealth: number
  drivingAge: number
  drinkingAge: number
  freeUniversity: boolean
  universalHealthcare: boolean
  deathPenalty: boolean
  monarchy: boolean
  /** Mandatory military service for 18 year olds. */
  conscription: boolean
  /** Typical avatar skin tones (indexes 1-5), weighted by repetition. */
  skinTones: number[]
  /** Relative chance of being born here in a random life. */
  weight: number
  religions: string[]
}

export const COUNTRIES: Country[] = [
  {
    id: 'us',
    name: 'United States',
    demonym: 'American',
    flag: '\u{1F1FA}\u{1F1F8}',
    cities: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'Austin', 'Seattle', 'Denver', 'Boston', 'Miami', 'Atlanta', 'Nashville', 'Portland', 'Las Vegas', 'Detroit', 'Minneapolis'],
    names: 'anglo',
    wealth: 1,
    drivingAge: 16,
    drinkingAge: 21,
    freeUniversity: false,
    universalHealthcare: false,
    deathPenalty: true,
    monarchy: false,
    conscription: false,
    skinTones: [1, 1, 2, 2, 3, 4, 5],
    weight: 10,
    religions: ['Christianity', 'Judaism', 'Islam', 'Buddhism', 'None'],
  },
  {
    id: 'gb',
    name: 'United Kingdom',
    demonym: 'British',
    flag: '\u{1F1EC}\u{1F1E7}',
    cities: ['London', 'Manchester', 'Birmingham', 'Liverpool', 'Leeds', 'Glasgow', 'Edinburgh', 'Bristol', 'Cardiff', 'Belfast', 'Newcastle', 'Brighton'],
    names: 'anglo',
    wealth: 0.9,
    drivingAge: 17,
    drinkingAge: 18,
    freeUniversity: false,
    universalHealthcare: true,
    deathPenalty: false,
    monarchy: true,
    conscription: false,
    skinTones: [1, 1, 1, 2, 3, 4, 5],
    weight: 4,
    religions: ['Christianity', 'Islam', 'Hinduism', 'None'],
  },
  {
    id: 'fr',
    name: 'France',
    demonym: 'French',
    flag: '\u{1F1EB}\u{1F1F7}',
    cities: ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg', 'Bordeaux', 'Lille', 'Montpellier'],
    names: 'french',
    wealth: 0.85,
    drivingAge: 18,
    drinkingAge: 18,
    freeUniversity: true,
    universalHealthcare: true,
    deathPenalty: false,
    monarchy: false,
    conscription: false,
    skinTones: [1, 1, 2, 2, 3, 4],
    weight: 3,
    religions: ['Christianity', 'Islam', 'None'],
  },
  {
    id: 'jp',
    name: 'Japan',
    demonym: 'Japanese',
    flag: '\u{1F1EF}\u{1F1F5}',
    cities: ['Tokyo', 'Osaka', 'Yokohama', 'Nagoya', 'Sapporo', 'Kobe', 'Kyoto', 'Fukuoka', 'Hiroshima', 'Sendai'],
    names: 'japanese',
    wealth: 0.85,
    drivingAge: 18,
    drinkingAge: 20,
    freeUniversity: false,
    universalHealthcare: true,
    deathPenalty: true,
    monarchy: true,
    conscription: false,
    skinTones: [1, 2],
    weight: 3,
    religions: ['Shinto', 'Buddhism', 'None'],
  },
  {
    id: 'mx',
    name: 'Mexico',
    demonym: 'Mexican',
    flag: '\u{1F1F2}\u{1F1FD}',
    cities: ['Mexico City', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'Cancún', 'Mérida', 'León', 'Oaxaca'],
    names: 'hispanic',
    wealth: 0.4,
    drivingAge: 18,
    drinkingAge: 18,
    freeUniversity: true,
    universalHealthcare: true,
    deathPenalty: false,
    monarchy: false,
    conscription: false,
    skinTones: [2, 3, 3, 4],
    weight: 3,
    religions: ['Christianity', 'None'],
  },
  {
    id: 'in',
    name: 'India',
    demonym: 'Indian',
    flag: '\u{1F1EE}\u{1F1F3}',
    cities: ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Jaipur', 'Ahmedabad', 'Lucknow'],
    names: 'south_asian',
    wealth: 0.25,
    drivingAge: 18,
    drinkingAge: 21,
    freeUniversity: false,
    universalHealthcare: false,
    deathPenalty: true,
    monarchy: false,
    conscription: false,
    skinTones: [3, 4, 4, 5],
    weight: 4,
    religions: ['Hinduism', 'Islam', 'Sikhism', 'Christianity', 'Buddhism'],
  },
]

export const NAME_POOLS: Record<NameRegion, NamePool> = {
  anglo: {
    male: ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Steven', 'Andrew', 'Joshua', 'Ethan', 'Noah', 'Liam', 'Mason', 'Logan', 'Lucas', 'Oliver', 'Jack', 'Henry', 'Owen', 'Wyatt', 'Caleb', 'Ryan', 'Nathan', 'Tyler', 'Brandon', 'Kevin', 'Justin', 'Austin', 'Dylan', 'Hunter', 'Connor', 'Elijah'],
    female: ['Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Emily', 'Emma', 'Olivia', 'Ava', 'Sophia', 'Isabella', 'Mia', 'Charlotte', 'Amelia', 'Harper', 'Abigail', 'Madison', 'Chloe', 'Grace', 'Lily', 'Hannah', 'Ashley', 'Brittany', 'Samantha', 'Rachel', 'Megan', 'Lauren', 'Taylor', 'Hailey', 'Zoe', 'Natalie', 'Ella', 'Avery', 'Scarlett', 'Victoria'],
    last: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Martin', 'Jackson', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Hill', 'Green', 'Adams', 'Baker', 'Nelson', 'Carter', 'Mitchell', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards'],
  },
  hispanic: {
    male: ['José', 'Juan', 'Luis', 'Carlos', 'Jorge', 'Miguel', 'Alejandro', 'Diego', 'Santiago', 'Mateo', 'Javier', 'Fernando', 'Ricardo', 'Andrés', 'Pablo', 'Rafael', 'Emilio', 'Sebastián', 'Gabriel', 'Antonio'],
    female: ['María', 'Guadalupe', 'Sofía', 'Valentina', 'Camila', 'Isabella', 'Lucía', 'Ximena', 'Daniela', 'Fernanda', 'Gabriela', 'Ana', 'Paola', 'Andrea', 'Carmen', 'Rosa', 'Elena', 'Mariana', 'Renata', 'Regina'],
    last: ['García', 'Hernández', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Cruz', 'Flores', 'Gómez', 'Morales', 'Vázquez', 'Reyes', 'Jiménez', 'Torres', 'Díaz', 'Gutiérrez', 'Ruiz'],
  },
  portuguese: { male: ['João', 'Pedro', 'Lucas', 'Gabriel', 'Rafael'], female: ['Ana', 'Beatriz', 'Mariana', 'Júlia', 'Larissa'], last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira'] },
  french: {
    male: ['Lucas', 'Hugo', 'Louis', 'Gabriel', 'Arthur', 'Jules', 'Léo', 'Raphaël', 'Adam', 'Nathan', 'Thomas', 'Mathis', 'Antoine', 'Pierre', 'Julien', 'Nicolas', 'Maxime', 'Baptiste', 'Théo', 'Clément'],
    female: ['Emma', 'Jade', 'Louise', 'Alice', 'Chloé', 'Lina', 'Léa', 'Manon', 'Camille', 'Inès', 'Sarah', 'Juliette', 'Margaux', 'Clara', 'Zoé', 'Élise', 'Amélie', 'Céline', 'Pauline', 'Mathilde'],
    last: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier'],
  },
  german: { male: ['Lukas', 'Leon', 'Finn', 'Jonas', 'Paul'], female: ['Mia', 'Hannah', 'Lena', 'Lea', 'Anna'], last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber'] },
  dutch: { male: ['Daan', 'Sem', 'Lucas', 'Levi', 'Finn'], female: ['Emma', 'Julia', 'Tess', 'Sophie', 'Zoë'], last: ['de Jong', 'Jansen', 'de Vries', 'van den Berg', 'Bakker'] },
  italian: { male: ['Leonardo', 'Francesco', 'Alessandro', 'Lorenzo', 'Mattia'], female: ['Sofia', 'Giulia', 'Aurora', 'Alice', 'Ginevra'], last: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi'] },
  nordic: { male: ['William', 'Oscar', 'Lucas', 'Elias', 'Erik'], female: ['Alice', 'Maja', 'Elsa', 'Astrid', 'Freja'], last: ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Hansen'] },
  slavic: { male: ['Aleksandr', 'Dmitri', 'Ivan', 'Mikhail', 'Sergei'], female: ['Anastasia', 'Maria', 'Daria', 'Sofia', 'Anna'], last: ['Ivanov', 'Smirnov', 'Kuznetsov', 'Popov', 'Novak'] },
  greek: { male: ['Georgios', 'Dimitrios', 'Konstantinos', 'Nikolaos', 'Ioannis'], female: ['Maria', 'Eleni', 'Katerina', 'Sofia', 'Anna'], last: ['Papadopoulos', 'Pappas', 'Georgiou', 'Nikolaidis', 'Oikonomou'] },
  turkish: { male: ['Mehmet', 'Mustafa', 'Ahmet', 'Ali', 'Emir'], female: ['Zeynep', 'Elif', 'Ayşe', 'Fatma', 'Defne'], last: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik'] },
  arabic: { male: ['Mohammed', 'Ahmed', 'Omar', 'Ali', 'Youssef'], female: ['Fatima', 'Aisha', 'Mariam', 'Layla', 'Noor'], last: ['Al-Sayed', 'Haddad', 'Khalil', 'Hassan', 'Mansour'] },
  persian: { male: ['Ali', 'Reza', 'Amir', 'Hossein', 'Dariush'], female: ['Fatemeh', 'Zahra', 'Maryam', 'Shirin', 'Parisa'], last: ['Hosseini', 'Mohammadi', 'Rezaei', 'Ahmadi', 'Karimi'] },
  south_asian: {
    male: ['Aarav', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan', 'Rahul', 'Amit', 'Vikram', 'Raj', 'Sanjay', 'Anil', 'Deepak', 'Kabir', 'Aditya', 'Nikhil', 'Pranav', 'Siddharth'],
    female: ['Saanvi', 'Aanya', 'Aadhya', 'Ananya', 'Diya', 'Priya', 'Pooja', 'Neha', 'Anjali', 'Kavya', 'Isha', 'Riya', 'Sneha', 'Meera', 'Lakshmi', 'Divya', 'Shreya', 'Nisha', 'Aditi', 'Tara'],
    last: ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Reddy', 'Iyer', 'Nair', 'Joshi', 'Mehta', 'Rao', 'Das', 'Chopra', 'Malhotra', 'Bose', 'Kapoor', 'Verma', 'Agarwal', 'Pillai', 'Mishra'],
  },
  chinese: { male: ['Wei', 'Hao', 'Jun', 'Ming', 'Yong'], female: ['Mei', 'Li', 'Xiu', 'Ying', 'Fang'], last: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen'] },
  japanese: {
    male: ['Haruto', 'Sota', 'Yuto', 'Hinata', 'Riku', 'Ren', 'Takumi', 'Kaito', 'Hiroshi', 'Kenji', 'Takeshi', 'Daiki', 'Sho', 'Yuki', 'Kenta', 'Ryo', 'Shota', 'Kazuki', 'Naoki', 'Tatsuya'],
    female: ['Yui', 'Hina', 'Sakura', 'Mei', 'Aoi', 'Yuna', 'Rin', 'Haruka', 'Akari', 'Emi', 'Yuko', 'Naomi', 'Ayumi', 'Keiko', 'Mio', 'Saki', 'Nanami', 'Misaki', 'Kana', 'Hana'],
    last: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Yamaguchi', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi', 'Shimizu', 'Mori'],
  },
  korean: { male: ['Min-jun', 'Seo-jun', 'Ji-ho', 'Do-yun', 'Ha-jun'], female: ['Seo-yeon', 'Ji-woo', 'Ha-eun', 'Min-seo', 'Su-a'], last: ['Kim', 'Lee', 'Park', 'Choi', 'Jung'] },
  southeast_asian: { male: ['Minh', 'Anh', 'Somchai', 'Budi', 'Arif'], female: ['Linh', 'Mai', 'Siti', 'Dewi', 'Nok'], last: ['Nguyen', 'Tran', 'Le', 'Santoso', 'Wongsa'] },
  filipino: { male: ['Jose', 'Mark', 'John Paul', 'Christian', 'Angelo'], female: ['Maria', 'Angel', 'Princess', 'Mary Grace', 'Kristine'], last: ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia'] },
  west_african: { male: ['Chinedu', 'Kwame', 'Emeka', 'Oluwaseun', 'Kofi'], female: ['Ngozi', 'Amara', 'Adaeze', 'Ama', 'Folake'], last: ['Okafor', 'Adeyemi', 'Mensah', 'Okonkwo', 'Boateng'] },
  east_african: { male: ['Baraka', 'Juma', 'Abebe', 'Otieno', 'Kipchoge'], female: ['Amani', 'Wanjiru', 'Aisha', 'Makena', 'Hiwot'], last: ['Mwangi', 'Otieno', 'Kamau', 'Tesfaye', 'Odhiambo'] },
  southern_african: { male: ['Thabo', 'Sipho', 'Bongani', 'Lwazi', 'Tendai'], female: ['Nomvula', 'Thandiwe', 'Lerato', 'Zanele', 'Naledi'], last: ['Nkosi', 'Dlamini', 'Ndlovu', 'Khumalo', 'Mokoena'] },
  hebrew: { male: ['Noam', 'David', 'Ariel', 'Yosef', 'Eitan'], female: ['Noa', 'Tamar', 'Maya', 'Yael', 'Shira'], last: ['Cohen', 'Levi', 'Mizrahi', 'Peretz', 'Friedman'] },
  irish: { male: ['Jack', 'Seán', 'Conor', 'Darragh', 'Cian'], female: ['Saoirse', 'Aoife', 'Niamh', 'Ciara', 'Siobhán'], last: ["Murphy", "Kelly", "O'Sullivan", 'Walsh', "O'Brien"] },
}

export function getCountry(id: string): Country {
  return COUNTRIES.find((c) => c.id === id) ?? COUNTRIES[0]
}

export function randomCountry(g: GameState): Country {
  return weightedPick(g, COUNTRIES, (c) => c.weight)
}

export function randomCity(g: GameState, country: Country): string {
  return pick(g, country.cities)
}

export function randomFirstName(g: GameState, countryId: string, gender: Gender): string {
  const pool = NAME_POOLS[getCountry(countryId).names] ?? NAME_POOLS.anglo
  return pick(g, gender === 'male' ? pool.male : pool.female)
}

export function randomLastName(g: GameState, countryId: string): string {
  const pool = NAME_POOLS[getCountry(countryId).names] ?? NAME_POOLS.anglo
  return pick(g, pool.last)
}

export function randomSkinTone(g: GameState, country: Country): number {
  return pick(g, country.skinTones)
}
