// Real brands: stocks. The listed companies of every exchange, for the investments engine
// (invest/engine.ts fills each exchange's listing slots with them; see invest/real.ts). Category
// 'stock', segment = the engine's sector id, hq = the exchange's home country, `founded` = the
// listing year, `ended` = the last year-end it had a quote, data = { exchange, aka (names by year),
// fate, arc, size, label }. The data lives in invest/stocks-*.ts, one file per region. Facts are
// approximate public knowledge; read the brand rules in data/brands.ts before adding to them.
import { STOCKS_AMERICAS } from '../invest/stocks-americas'
import { STOCKS_ASIA } from '../invest/stocks-asia'
import { STOCKS_EUROPE } from '../invest/stocks-europe'
import { STOCKS_MEA } from '../invest/stocks-mea'
import { STOCKS_MORE } from '../invest/stocks-more'
import type { Brand } from './brands'

export const STOCK_BRANDS: Brand[] = [...STOCKS_AMERICAS, ...STOCKS_EUROPE, ...STOCKS_ASIA, ...STOCKS_MEA, ...STOCKS_MORE]
