// Real listed companies of the Middle East and Africa (see stocks-data.ts for the conventions).
import type { Brand } from '../data/brands'
import { stock } from './stocks-data'

export const STOCKS_MEA: Brand[] = [
  stock('il', 'TASE', 'Teva', 'pharma', 1951, 7, 'Generic medicines'),
  stock('il', 'TASE', 'Bank Leumi', 'banks', 1953, 6, 'Banking and financial services'),
  stock('sa', 'TADAWUL', 'Saudi Aramco', 'oil', 2019, 10, 'Oil and gas'),
  stock('sa', 'TADAWUL', 'SABIC', 'industrials', 1984, 8, 'Chemicals and plastics', { label: 'Chemicals' }),
  stock('sa', 'TADAWUL', 'Saudi National Bank', 'banks', 2014, 6, 'Banking and financial services', { aka: [[2014, 'National Commercial Bank'], [2021, 'Saudi National Bank']] }),
  stock('sa', 'TADAWUL', 'stc', 'telecom', 2003, 6, 'Telecommunications', { aka: [[2003, 'Saudi Telecom Company'], [2020, 'stc']] }),
  stock('sa', 'TADAWUL', 'Almarai', 'food', 2005, 5, 'Dairy and packaged foods'),
  stock('ae', 'DFM', 'Emaar Properties', 'property', 2000, 6, 'Property developer'),
  stock('ae', 'DFM', 'Emirates NBD', 'banks', 2007, 5, 'Banking and financial services'),
  stock('za', 'JSE', 'Sasol', 'oil', 1979, 6, 'Synthetic fuels and chemicals'),
  stock('za', 'JSE', 'MTN Group', 'telecom', 2002, 6, 'Mobile telecommunications'),
  stock('za', 'JSE', 'De Beers', 'mining', 1900, 7, 'Diamond mining', { ended: 2000 }),
  stock('za', 'JSE', 'AngloGold Ashanti', 'mining', 1998, 6, 'Gold mining', { aka: [[1998, 'AngloGold'], [2004, 'AngloGold Ashanti']] }),
  stock('za', 'JSE', 'Sanlam', 'insurance', 1998, 5, 'Insurance and financial services'),
  stock('za', 'JSE', 'Naspers', 'media', 1994, 6, 'Media and internet investments'),
  stock('ng', 'NGX', 'Dangote Cement', 'construction', 2010, 7, 'Cement'),
  stock('ng', 'NGX', 'Zenith Bank', 'banks', 2004, 6, 'Banking and financial services'),
  stock('ng', 'NGX', 'Guaranty Trust', 'banks', 1996, 5, 'Banking and financial services', { aka: [[1996, 'Guaranty Trust Bank'], [2021, 'Guaranty Trust']] }),
  stock('ng', 'NGX', 'MTN Nigeria', 'telecom', 2019, 6, 'Mobile telecommunications'),
  stock('ng', 'NGX', 'Seplat Energy', 'oil', 2014, 5, 'Oil and gas', { aka: [[2014, 'Seplat Petroleum'], [2020, 'Seplat Energy']] }),
  stock('ke', 'NSE', 'Safaricom', 'telecom', 2008, 8, 'Mobile telecommunications and mobile money'),
  stock('ke', 'NSE', 'Equity Group', 'banks', 2006, 6, 'Banking and financial services'),
  stock('ke', 'NSE', 'Kenya Airways', 'airlines', 1996, 5, 'Airline'),
]
