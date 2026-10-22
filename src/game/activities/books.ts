// Mind & Body > Book: pick a book from this year's shelf and read it cover to cover.
// The shelf only holds books that had been published by the current year (no Harry Potter in
// 1950), so a childhood in 1905 gets Peter Rabbit and the Wizard of Oz.
import { addStat, count, counter, log } from '../core'
import { chance, randInt } from '../rng'
import { pickLine, pickSite } from '../text/pick'
import { hasTalent, talentHint, talentMult } from '../talents'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { gate, result, stablePick } from './common'

type Genre =
  | "Children's Picture Book"
  | "Children's Novel"
  | 'Young Adult Novel'
  | 'Novel'
  | 'Historical Fiction'
  | 'Science Fiction'
  | 'Fantasy'
  | 'Horror Novel'
  | 'Crime Fiction'
  | 'Mystery'
  | 'Non-Fiction'
  | 'Self-Help'
  | 'Autobiography'
  | 'Biography'
  | 'Comedy'
  | 'Poetry'
  | 'Tragedy'
  | 'Romance Novel'
  | 'Reference'
  | 'Cookbook'

interface Book {
  title: string
  author: string
  genre: Genre
  pages: number
  minAge: number
}

const B = (title: string, author: string, genre: Genre, pages: number, minAge: number): Book => ({ title, author, genre, pages, minAge })

export const BOOKS: Book[] = [
  B('Brown Bear, Brown Bear, What Do You See?', 'Bill Martin Jr.', "Children's Picture Book", 32, 6),
  B('Corduroy', 'Don Freeman', "Children's Picture Book", 32, 6),
  B('Goodnight Moon', 'Margaret Wise Brown', "Children's Picture Book", 32, 6),
  B('If You Give a Mouse a Cookie', 'Laura Numeroff', "Children's Picture Book", 32, 6),
  B('The Very Hungry Caterpillar', 'Eric Carle', "Children's Picture Book", 22, 6),
  B('Where the Wild Things Are', 'Maurice Sendak', "Children's Picture Book", 56, 6),
  B('The Cat in the Hat', 'Dr. Seuss', "Children's Picture Book", 73, 6),
  B('The Snowy Day', 'Ezra Jack Keats', "Children's Picture Book", 40, 6),
  B('The Little Engine That Could', 'Watty Piper', "Children's Picture Book", 48, 6),
  B('Stellaluna', 'Janell Cannon', "Children's Picture Book", 48, 6),
  B('Charlie and the Chocolate Factory', 'Roald Dahl', "Children's Novel", 178, 7),
  B("Charlotte's Web", 'E.B. White', "Children's Novel", 196, 8),
  B('Ramona Quimby, Age 8', 'Beverly Cleary', "Children's Novel", 192, 8),
  B('Goosebumps', 'R.L. Stine', "Children's Novel", 122, 9),
  B('The Secret Garden', 'Frances Hodgson Burnett', "Children's Novel", 331, 9),
  B("Harry Potter and the Sorcerer's Stone", 'J.K. Rowling', 'Fantasy', 309, 9),
  B("Alice's Adventures in Wonderland", 'Lewis Carroll', 'Fantasy', 239, 10),
  B('A Wrinkle in Time', "Madeleine L'Engle", 'Fantasy', 260, 10),
  B('Diary of a Wimpy Kid', 'Jeff Kinney', "Children's Novel", 221, 10),
  B('Where the Red Fern Grows', 'Wilson Rawls', "Children's Novel", 273, 10),
  B('Holes', 'Louis Sachar', 'Young Adult Novel', 251, 11),
  B('Treasure Island', 'Robert Louis Stevenson', 'Young Adult Novel', 311, 11),
  B('The Lion, the Witch and the Wardrobe', 'C.S. Lewis', 'Fantasy', 208, 11),
  B('Little Women', 'Louisa May Alcott', 'Novel', 449, 11),
  B('Tales of a Fourth Grade Nothing', 'Judy Blume', "Children's Novel", 130, 11),
  B('The Book Thief', 'Markus Zusak', 'Historical Fiction', 584, 12),
  B('Hatchet', 'Gary Paulsen', 'Young Adult Novel', 195, 13),
  B('The Hunger Games', 'Suzanne Collins', 'Fantasy', 374, 13),
  B('The Lord of the Rings', 'J.R.R. Tolkien', 'Fantasy', 1216, 13),
  B("The Hitchhiker's Guide to the Galaxy", 'Douglas Adams', 'Science Fiction', 216, 13),
  B('Frankenstein', 'Mary Shelley', 'Horror Novel', 335, 13),
  B('Dracula', 'Bram Stoker', 'Horror Novel', 488, 13),
  B('Sherlock Holmes', 'Arthur Conan Doyle', 'Mystery', 1059, 13),
  B('The Odyssey', 'Homer', 'Poetry', 541, 13),
  B('Twenty Thousand Leagues Under the Sea', 'Jules Verne', 'Science Fiction', 394, 13),
  B('The Time Machine', 'H.G. Wells', 'Science Fiction', 84, 13),
  B('The Joy of Cooking', 'Irma S. Rombauer', 'Cookbook', 1152, 13),
  B('The Merriam-Webster Dictionary', 'Merriam-Webster', 'Reference', 3350, 13),
  B('Ready Player One', 'Ernest Cline', 'Science Fiction', 386, 13),
  B('A Tree Grows in Brooklyn', 'Betty Smith', 'Novel', 493, 13),
  B('To Kill a Mockingbird', 'Harper Lee', 'Novel', 324, 14),
  B('Lord of the Flies', 'William Golding', 'Young Adult Novel', 182, 14),
  B('Pride and Prejudice', 'Jane Austen', 'Romance Novel', 279, 14),
  B('The Diary of a Young Girl', 'Anne Frank', 'Autobiography', 283, 14),
  B('The Adventures of Huckleberry Finn', 'Mark Twain', 'Young Adult Novel', 327, 14),
  B('The Importance of Being Earnest', 'Oscar Wilde', 'Comedy', 76, 14),
  B('Moby-Dick', 'Herman Melville', 'Novel', 654, 15),
  B('Jane Eyre', 'Charlotte Brontë', 'Romance Novel', 532, 15),
  B('Jurassic Park', 'Michael Crichton', 'Science Fiction', 400, 15),
  B('I, Robot', 'Isaac Asimov', 'Science Fiction', 253, 15),
  B('Life of Pi', 'Yann Martel', 'Novel', 354, 15),
  B('The Catcher in the Rye', 'J.D. Salinger', 'Novel', 277, 15),
  B('Becoming', 'Michelle Obama', 'Autobiography', 463, 15),
  B('How to Win Friends and Influence People', 'Dale Carnegie', 'Self-Help', 291, 15),
  B('The 7 Habits of Highly Effective People', 'Stephen R. Covey', 'Self-Help', 420, 15),
  B('Rich Dad, Poor Dad', 'Robert Kiyosaki', 'Self-Help', 196, 15),
  B('Tuesdays with Morrie', 'Mitch Albom', 'Biography', 192, 15),
  B('The Power of Now', 'Eckhart Tolle', 'Self-Help', 236, 15),
  B('Long Walk to Freedom', 'Nelson Mandela', 'Autobiography', 684, 16),
  B('Fahrenheit 451', 'Ray Bradbury', 'Science Fiction', 194, 16),
  B('Flowers for Algernon', 'Daniel Keyes', 'Science Fiction', 311, 16),
  B('The Great Gatsby', 'F. Scott Fitzgerald', 'Novel', 200, 16),
  B('Of Mice and Men', 'John Steinbeck', 'Novel', 187, 16),
  B('The Old Man and the Sea', 'Ernest Hemingway', 'Novel', 132, 16),
  B('The Count of Monte Cristo', 'Alexandre Dumas', 'Historical Fiction', 1276, 16),
  B('The Metamorphosis', 'Franz Kafka', 'Novel', 201, 16),
  B('The Da Vinci Code', 'Dan Brown', 'Crime Fiction', 466, 16),
  B('Wuthering Heights', 'Emily Brontë', 'Romance Novel', 464, 16),
  B('1984', 'George Orwell', 'Science Fiction', 237, 17),
  B('A Brief History of Time', 'Stephen Hawking', 'Non-Fiction', 256, 17),
  B('Brave New World', 'Aldous Huxley', 'Science Fiction', 288, 17),
  B('Cosmos', 'Carl Sagan', 'Non-Fiction', 365, 17),
  B('The Alchemist', 'Paulo Coelho', 'Novel', 179, 17),
  B('The Art of War', 'Sun Tzu', 'Non-Fiction', 25, 17),
  B('The Wealth of Nations', 'Adam Smith', 'Non-Fiction', 950, 17),
  B('On the Origin of Species', 'Charles Darwin', 'Non-Fiction', 502, 17),
  B('Slaughterhouse-Five', 'Kurt Vonnegut Jr.', 'Science Fiction', 275, 17),
  B('One Hundred Years of Solitude', 'Gabriel García Márquez', 'Fantasy', 417, 17),
  B('Don Quixote', 'Miguel de Cervantes', 'Novel', 1023, 17),
  B('Gone with the Wind', 'Margaret Mitchell', 'Historical Fiction', 1037, 17),
  B('A Tale of Two Cities', 'Charles Dickens', 'Historical Fiction', 489, 17),
  B('The Girl with the Dragon Tattoo', 'Stieg Larsson', 'Crime Fiction', 672, 17),
  B('The Tipping Point', 'Malcolm Gladwell', 'Non-Fiction', 209, 17),
  B('Think and Grow Rich', 'Napoleon Hill', 'Self-Help', 238, 17),
  B('A Game of Thrones', 'George R.R. Martin', 'Fantasy', 694, 18),
  B('Crime and Punishment', 'Fyodor Dostoyevsky', 'Crime Fiction', 671, 18),
  B('Hamlet', 'William Shakespeare', 'Tragedy', 289, 18),
  B('War and Peace', 'Leo Tolstoy', 'Historical Fiction', 1225, 18),
  B('The Godfather', 'Mario Puzo', 'Crime Fiction', 448, 18),
  B('The Total Money Makeover', 'Dave Ramsey', 'Self-Help', 289, 18),
  B('The Tale of Peter Rabbit', 'Beatrix Potter', "Children's Picture Book", 72, 6),
  B('Just So Stories', 'Rudyard Kipling', "Children's Picture Book", 249, 6),
  B("Grimms' Fairy Tales", 'The Brothers Grimm', "Children's Picture Book", 400, 6),
  B('The Wonderful Wizard of Oz', 'L. Frank Baum', "Children's Novel", 259, 8),
  B('The Wind in the Willows', 'Kenneth Grahame', "Children's Novel", 302, 9),
]

/** Year each book first came out (the shelf hides books that don't exist yet). Missing: ancient. */
const PUBLISHED: Record<string, number> = {
  'Brown Bear, Brown Bear, What Do You See?': 1967,
  Corduroy: 1968,
  'Goodnight Moon': 1947,
  'If You Give a Mouse a Cookie': 1985,
  'The Very Hungry Caterpillar': 1969,
  'Where the Wild Things Are': 1963,
  'The Cat in the Hat': 1957,
  'The Snowy Day': 1962,
  'The Little Engine That Could': 1930,
  Stellaluna: 1993,
  'Charlie and the Chocolate Factory': 1964,
  "Charlotte's Web": 1952,
  'Ramona Quimby, Age 8': 1981,
  Goosebumps: 1992,
  'The Secret Garden': 1911,
  "Harry Potter and the Sorcerer's Stone": 1998,
  "Alice's Adventures in Wonderland": 1865,
  'A Wrinkle in Time': 1962,
  'Diary of a Wimpy Kid': 2007,
  'Where the Red Fern Grows': 1961,
  Holes: 1998,
  'Treasure Island': 1883,
  'The Lion, the Witch and the Wardrobe': 1950,
  'Little Women': 1868,
  'Tales of a Fourth Grade Nothing': 1972,
  'The Book Thief': 2005,
  Hatchet: 1987,
  'The Hunger Games': 2008,
  'The Lord of the Rings': 1955,
  "The Hitchhiker's Guide to the Galaxy": 1979,
  Frankenstein: 1818,
  Dracula: 1897,
  'Sherlock Holmes': 1892,
  'Twenty Thousand Leagues Under the Sea': 1870,
  'The Time Machine': 1895,
  'The Joy of Cooking': 1931,
  'The Merriam-Webster Dictionary': 1847,
  'Ready Player One': 2011,
  'A Tree Grows in Brooklyn': 1943,
  'To Kill a Mockingbird': 1960,
  'Lord of the Flies': 1954,
  'Pride and Prejudice': 1813,
  'The Diary of a Young Girl': 1947,
  'The Adventures of Huckleberry Finn': 1884,
  'The Importance of Being Earnest': 1895,
  'Moby-Dick': 1851,
  'Jane Eyre': 1847,
  'Jurassic Park': 1990,
  'I, Robot': 1950,
  'Life of Pi': 2001,
  'The Catcher in the Rye': 1951,
  Becoming: 2018,
  'How to Win Friends and Influence People': 1936,
  'The 7 Habits of Highly Effective People': 1989,
  'Rich Dad, Poor Dad': 1997,
  'Tuesdays with Morrie': 1997,
  'The Power of Now': 1997,
  'Long Walk to Freedom': 1994,
  'Fahrenheit 451': 1953,
  'Flowers for Algernon': 1966,
  'The Great Gatsby': 1925,
  'Of Mice and Men': 1937,
  'The Old Man and the Sea': 1952,
  'The Count of Monte Cristo': 1844,
  'The Metamorphosis': 1915,
  'The Da Vinci Code': 2003,
  'Wuthering Heights': 1847,
  '1984': 1949,
  'A Brief History of Time': 1988,
  'Brave New World': 1932,
  Cosmos: 1980,
  'The Alchemist': 1988,
  'The Wealth of Nations': 1776,
  'On the Origin of Species': 1859,
  'Slaughterhouse-Five': 1969,
  'One Hundred Years of Solitude': 1967,
  'Don Quixote': 1605,
  'Gone with the Wind': 1936,
  'A Tale of Two Cities': 1859,
  'The Girl with the Dragon Tattoo': 2005,
  'The Tipping Point': 2000,
  'Think and Grow Rich': 1937,
  'A Game of Thrones': 1996,
  'Crime and Punishment': 1866,
  Hamlet: 1603,
  'War and Peace': 1869,
  'The Godfather': 1969,
  'The Total Money Makeover': 2003,
  'The Tale of Peter Rabbit': 1902,
  'Just So Stories': 1902,
  "Grimms' Fairy Tales": 1812,
  'The Wonderful Wizard of Oz': 1900,
  'The Wind in the Willows': 1908,
}

/** Had this book been published by the current year? */
export function publishedBy(book: Book, year: number): boolean {
  return year >= (PUBLISHED[book.title] ?? 0)
}

const GENRE_EFFECTS: Record<Genre, { h: [number, number]; s: [number, number] }> = {
  "Children's Picture Book": { h: [3, 8], s: [1, 3] },
  "Children's Novel": { h: [3, 7], s: [1, 4] },
  'Young Adult Novel': { h: [2, 6], s: [1, 4] },
  Novel: { h: [0, 5], s: [2, 5] },
  'Historical Fiction': { h: [-4, 2], s: [2, 6] },
  'Science Fiction': { h: [1, 5], s: [2, 5] },
  Fantasy: { h: [3, 8], s: [1, 4] },
  'Horror Novel': { h: [-3, 4], s: [1, 3] },
  'Crime Fiction': { h: [1, 5], s: [2, 4] },
  Mystery: { h: [2, 6], s: [2, 5] },
  'Non-Fiction': { h: [-2, 2], s: [3, 7] },
  'Self-Help': { h: [2, 8], s: [2, 5] },
  Autobiography: { h: [0, 4], s: [2, 5] },
  Biography: { h: [0, 4], s: [2, 5] },
  Comedy: { h: [5, 10], s: [0, 2] },
  Poetry: { h: [-2, 3], s: [2, 5] },
  Tragedy: { h: [-5, 1], s: [3, 6] },
  'Romance Novel': { h: [3, 8], s: [0, 3] },
  Reference: { h: [-5, 0], s: [10, 15] },
  Cookbook: { h: [1, 4], s: [1, 2] },
}

/** Pages you have time to read in a year. */
function pageBudget(g: GameState): number {
  const a = g.character.age
  if (a < 10) return 600
  if (a < 13) return 1500
  if (g.character.prison) return 4000
  return 3000
}

const PAGES_KEY = 'act.book.pages'

function pagesRead(g: GameState): number {
  return g.yearActions[PAGES_KEY] ?? 0
}

function shelf(g: GameState): Book[] {
  const age = g.character.age
  const eligible = BOOKS.filter((b) => b.minAge <= age && (age >= 13 || b.genre.startsWith('Children') || b.minAge <= 11) && publishedBy(b, g.year))
  return stablePick(g, `books:${counter(g, 'booksRead')}`, eligible, 7)
}

const LOVED = [
  'You devoured {title} by {author}. You could not put it down.',
  'You finished {title} by {author} and immediately wanted to start it over.',
  "{title} by {author} was a masterpiece. You're telling everyone about it whether they like it or not.",
]
const FINE = [
  'You finished {title} by {author}. It was pretty good.',
  "You read {title} by {author}. Solid. You'd give it a B+.",
  'You made it through all {pages} pages of {title}. You feel a little smarter.',
]
const DEPRESSING = [
  "You finished {title} by {author}. It left you staring at the ceiling for an hour.",
  '{title} by {author} was brilliant and devastating. You need a hug.',
  'You read {title}. You are now emotionally compromised.',
]

function readBook(g: GameState, book: Book): void {
  const budget = pageBudget(g)
  const used = pagesRead(g)
  if (used + book.pages > budget) {
    result(
      g,
      'No Time',
      used === 0
        ? `${book.title} is ${book.pages.toLocaleString('en-US')} pages long. You don't have time to read all of that this year.`
        : pickSite(g, [
            `You've already read ${used.toLocaleString('en-US')} pages this year. Your eyes need a break before you tackle ${book.title}.`,
            `You opened ${book.title}, read one sentence, and fell asleep. You've read enough this year.`,
          ], 0xf4e6539d),
      '\u{1F634}',
    )
    return
  }
  g.yearActions[PAGES_KEY] = used + book.pages
  const c = g.character
  // Long, dense books can be abandoned by impatient readers.
  if (book.pages > 500 && c.stats.smarts < 45 && book.genre !== 'Reference' && !hasTalent(g, 'Academics') && chance(g, 0.3)) {
    const page = randInt(g, 20, Math.floor(book.pages / 2))
    addStat(g, 'smarts', 1)
    log(g, `I gave up on ${book.title} on page ${page}.`, 'neutral')
    result(g, 'Abandoned', `You gave up on ${book.title} on page ${page}. ${g.year >= 1930 ? "Maybe you'll watch the movie instead." : 'Maybe someone will read it aloud to you instead.'}`, '\u{1F4D5}')
    return
  }
  const eff = GENRE_EFFECTS[book.genre]
  const h = randInt(g, eff.h[0], eff.h[1])
  // Academics talent: every book sticks.
  const s = Math.round((randInt(g, eff.s[0], eff.s[1]) + Math.floor(book.pages / 450) + (c.age < 13 ? 1 : 0)) * talentMult(g, 'Academics', 1.5))
  addStat(g, 'happiness', h)
  addStat(g, 'smarts', s)
  if (book.genre === 'Cookbook') addStat(g, 'health', 1)
  count(g, 'booksRead')
  if (book.genre === 'Reference') {
    g.flags.readDictionary = true
    log(g, `I read the entire ${book.title}. Cover to cover.`, 'good')
    result(g, 'Human Dictionary', `You read all ${book.pages.toLocaleString('en-US')} pages of ${book.title}. You now know what "defenestration" means and you will tell people.`, '\u{1F4D6}', 'good')
    return
  }
  const vars = { title: book.title, author: book.author, pages: book.pages }
  const text = h >= 5 ? pickLine(g, LOVED) : h <= -1 ? pickLine(g, DEPRESSING) : pickLine(g, FINE)
  log(g, h >= 5 ? `I read ${book.title} and loved it.` : `I read ${book.title} by ${book.author}.`, h >= 0 ? 'good' : 'neutral')
  result(g, book.title, text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k as keyof typeof vars])), '\u{1F4DA}', h >= 0 ? 'good' : undefined)
}

/** Academics talent hint: the book on the shelf that fits this year and teaches the most. */
function mostEducational(g: GameState, books: Book[]): Book | null {
  const left = pageBudget(g) - pagesRead(g)
  let best: Book | null = null
  let bestScore = -Infinity
  for (const b of books) {
    if (b.pages > left) continue
    const eff = GENRE_EFFECTS[b.genre]
    const score = (eff.s[0] + eff.s[1]) / 2 + Math.floor(b.pages / 450)
    if (score > bestScore) {
      bestScore = score
      best = b
    }
  }
  return best
}

export const bookMenu: MenuGroup = {
  type: 'menu',
  id: 'mb.book',
  label: 'Book',
  emoji: '\u{1F4DA}',
  subtitle: 'Find a good book',
  disabledReason: (g) => gate(g, { minAge: 6, prison: true }),
  header: (g) => {
    const left = Math.max(0, pageBudget(g) - pagesRead(g))
    return `Pick a book from the shelf. You have time for about ${left.toLocaleString('en-US')} more pages this year.`
  },
  children: (g): MenuNode[] => {
    const books = shelf(g)
    const best = hasTalent(g, 'Academics') ? mostEducational(g, books) : null
    return books.map(
      (book): MenuAction => ({
        type: 'action',
        id: `mb.book.${book.title}`,
        label: book.title,
        emoji: book.genre === 'Reference' ? '\u{1F4D6}' : book.genre.startsWith('Children') ? '\u{1F4D8}' : '\u{1F4D5}',
        subtitle: `${book.author} · ${book.genre} · ${book.pages.toLocaleString('en-US')} pages`,
        hint: (gg) => (best === book ? talentHint(gg, 'Academics', 'You will learn the most from this one.') : null),
        run: (draft) => readBook(draft, book),
      }),
    )
  },
}
