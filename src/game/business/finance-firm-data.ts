// Financial institutions are balance-sheet businesses, never product factories.
import type { IndustryDef } from './industries'

const common = {
  model: 'finance' as const, unit: 'clients', unitOne: 'client', site: 'office', sitePlural: 'offices',
  price: 0, unitCost: 0, localShare: 1, tradable: .2, demand: 1, elasticity: 0, incomeSens: .5,
  capitalLocal: .3, staffScale: 0, maint: .01, capMult: 1, multiple: 8, growth: .6,
  perMillion: 1, taxShare: 0, perishable: 1, marketingShare: .04, products: [],
}

export const FINANCE_INDUSTRIES: Record<'investmentFirm' | 'bank' | 'onlineBank', IndustryDef> = {
  investmentFirm: { ...common, id: 'investmentFirm', label: 'Investment Firm', emoji: '📈',
    blurb: 'Manage client portfolios. Earn fees, not ownership of their money; skill and risk control matter.',
    capital: 750_000, staff: 3, wage: 55_000, rent: 40_000,
    roles: [{ title: 'Portfolio Manager', focus: 'finance', pay: 105_000 }, { title: 'Investment Researcher', focus: 'quality', pay: 85_000 }, { title: 'Client Relations Director', focus: 'sales', pay: 80_000 }, { title: 'Compliance Officer', focus: 'ops', pay: 85_000 }],
    suffixes: ['Capital', 'Asset Management', 'Investment Partners'],
  },
  bank: { ...common, id: 'bank', label: 'Bank', emoji: '🏦',
    blurb: 'Take deposits, underwrite loans, maintain reserves. Deposits belong to customers, not shareholders.',
    capital: 5_000_000, staff: 8, wage: 60_000, rent: 120_000,
    roles: [{ title: 'Chief Credit Officer', focus: 'finance', pay: 130_000 }, { title: 'Risk Officer', focus: 'quality', pay: 110_000 }, { title: 'Deposit Relations Director', focus: 'sales', pay: 100_000 }, { title: 'Bank Operations Director', focus: 'ops', pay: 120_000 }],
    suffixes: ['Bank', 'Commercial Bank', 'Banking Group'],
  },
  onlineBank: { ...common, id: 'onlineBank', label: 'Online Bank', emoji: '💳',
    blurb: 'A branchless bank with digital reach, technology overhead and fast-moving withdrawals.',
    capital: 2_000_000, staff: 5, wage: 85_000, rent: 30_000,
    roles: [{ title: 'Chief Credit Officer', focus: 'finance', pay: 130_000 }, { title: 'Risk & Security Officer', focus: 'quality', pay: 125_000 }, { title: 'Digital Growth Director', focus: 'sales', pay: 105_000 }, { title: 'Platform Operations Director', focus: 'ops', pay: 135_000 }],
    suffixes: ['Digital Bank', 'Online Banking', 'Direct Bank'],
  },
}
