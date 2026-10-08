// Real listed companies of smaller exchanges (see stocks-data.ts for the conventions): a handful of
// the best-known names each. Everything else on these exchanges stays made-up small caps.
import type { Brand } from '../data/brands'
import { stock } from './stocks-data'

export const STOCKS_MORE: Brand[] = [
  stock('at', 'VSE', 'OMV', 'oil', 1987, 5, 'Oil and gas'),
  stock('at', 'VSE', 'Erste Group Bank', 'banks', 1997, 5, 'Banking and financial services'),
  stock('at', 'VSE', 'voestalpine', 'industrials', 1995, 4, 'Steel and metal technology', { label: 'Steel' }),
  stock('at', 'VSE', 'Verbund', 'utilities', 1988, 4, 'Hydropower and electricity'),
  stock('be', 'EBR', 'KBC Group', 'banks', 1998, 5, 'Banking and insurance'),
  stock('be', 'EBR', 'Solvay', 'industrials', 1900, 5, 'Chemicals and advanced materials', { label: 'Chemicals' }),
  stock('be', 'EBR', 'Proximus', 'telecom', 2004, 4, 'Telephone and broadband', { aka: [[2004, 'Belgacom'], [2014, 'Proximus']] }),
  stock('ie', 'ISE', 'CRH', 'construction', 1970, 6, 'Building materials'),
  stock('ie', 'ISE', 'Ryanair', 'airlines', 1997, 6, 'Low-cost airline'),
  stock('ie', 'ISE', 'Kerry Group', 'food', 1986, 4, 'Food ingredients and flavours'),
  stock('pt', 'ELI', 'EDP', 'utilities', 1997, 5, 'Electricity and renewables'),
  stock('pt', 'ELI', 'Galp', 'oil', 2006, 4, 'Oil, gas and refining'),
  stock('pt', 'ELI', 'Jerónimo Martins', 'supermarkets', 1989, 4, 'Supermarkets'),
  stock('pl', 'GPW', 'PKO Bank Polski', 'banks', 2004, 5, 'Banking and financial services'),
  stock('pl', 'GPW', 'PKN Orlen', 'oil', 1999, 5, 'Oil refining and fuel stations'),
  stock('pl', 'GPW', 'KGHM', 'mining', 1997, 4, 'Copper and silver mining'),
  stock('pl', 'GPW', 'PZU', 'insurance', 2010, 4, 'Insurance'),
  stock('cz', 'PSE', 'ČEZ', 'utilities', 1993, 5, 'Electricity generation'),
  stock('cz', 'PSE', 'Komerční banka', 'banks', 1992, 4, 'Banking and financial services'),
  stock('hu', 'BSE', 'MOL', 'oil', 1995, 5, 'Oil and gas'),
  stock('hu', 'BSE', 'OTP Bank', 'banks', 1995, 5, 'Banking and financial services'),
  stock('eg', 'EGX', 'Telecom Egypt', 'telecom', 2005, 4, 'Telephone and broadband'),
  stock('eg', 'EGX', 'Commercial International Bank', 'banks', 1993, 5, 'Banking and financial services'),
  stock('ma', 'BVC', 'Maroc Telecom', 'telecom', 2004, 5, 'Telephone and mobile services'),
  stock('ma', 'BVC', 'Attijariwafa Bank', 'banks', 2004, 5, 'Banking and financial services'),
  stock('cl', 'BCS', 'Falabella', 'supermarkets', 1993, 5, 'Department stores and retail', { label: 'Retail' }),
  stock('ar', 'BYMA', 'Telecom Argentina', 'telecom', 1992, 4, 'Telephone and broadband'),
  stock('qa', 'QSE', 'Qatar National Bank', 'banks', 1997, 5, 'Banking and financial services'),
]
