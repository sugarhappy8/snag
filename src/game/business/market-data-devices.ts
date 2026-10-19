// Real rivals, part 3: phones, computers and other devices (a world market). See market-rows.ts for
// the row format. Names identify companies only. `since` is the year a company began selling
// devices, `end` the year a real company stopped trading in this market (never after 2025). Rows
// carry no arcs and no quality overrides, and nothing negative is written about anyone.
import type { RivalRow } from './market-rows'

const B = 'budget'
const M = 'mass'
const P = 'premium'

export const DEVICE_ROWS: RivalRow[] = [
  // ---- Device and Platform Company: alive in 2026 ---------------------------------------
  ['devices', 'apple-devices', 'Apple', 'us', 1976, P, 14, { since: 1977 }],
  ['devices', 'samsung-devices', 'Samsung', 'kr', 1969, M, 13, { since: 1988 }],
  ['devices', 'lenovo', 'Lenovo', 'cn', 1984, M, 8],
  ['devices', 'hp', 'HP', 'us', 1939, M, 7, { since: 1980 }],
  ['devices', 'dell', 'Dell', 'us', 1984, M, 6.5],
  ['devices', 'xiaomi', 'Xiaomi', 'cn', 2010, M, 7, { since: 2011 }],
  ['devices', 'huawei', 'Huawei', 'cn', 1987, M, 6, { since: 2004 }],
  ['devices', 'oppo', 'Oppo', 'cn', 2004, M, 4.5, { since: 2008 }],
  ['devices', 'vivo', 'Vivo', 'cn', 2009, M, 4.5, { since: 2011 }],
  ['devices', 'oneplus', 'OnePlus', 'cn', 2013, M, 1.2],
  ['devices', 'acer', 'Acer', 'tw', 1976, M, 3.2, { since: 1981 }],
  ['devices', 'asus', 'Asus', 'tw', 1989, M, 3.5, { since: 1995 }],
  ['devices', 'htc', 'HTC', 'tw', 1997, M, 1.4, { since: 2006 }],
  ['devices', 'sony-devices', 'Sony', 'jp', 1946, P, 3.5, { since: 1996 }],
  ['devices', 'google-devices', 'Google', 'us', 1998, P, 3, { since: 2010 }],
  ['devices', 'microsoft-devices', 'Microsoft', 'us', 1975, P, 3, { since: 2012 }],
  ['devices', 'motorola', 'Motorola', 'us', 1928, M, 3, { since: 1983 }],
  ['devices', 'meta-devices', 'Meta', 'us', 2004, B, 3, { since: 2014 }],
  ['devices', 'amazon-devices', 'Amazon', 'us', 1994, B, 2.5, { since: 2011 }],

  // ---- Ended ---------------------------------------------------------------------------
  ['devices', 'lg-mobile', 'LG', 'kr', 1958, M, 4, { since: 1998, end: 2021, fate: 'closed' }],
  ['devices', 'nokia', 'Nokia', 'fi', 1865, M, 8, { since: 1982, end: 2013, fate: 'acquired' }],
  ['devices', 'ibm-pc', 'IBM', 'us', 1911, P, 6, { since: 1981, end: 2004, fate: 'acquired' }],
  ['devices', 'compaq', 'Compaq', 'us', 1982, M, 4, { end: 2001, fate: 'acquired' }],
  ['devices', 'palm', 'Palm', 'us', 1992, M, 1.5, { end: 2009, fate: 'acquired' }],
]
