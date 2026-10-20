/**
 * Followers on a main social account that aren't bought. Pure, and safe on any saved
 * value: a bad `followers` reads as 0, a bad `fake` as none, and the bought share can
 * never exceed the followers there. Readers outside the social module use this so
 * bought followers never count as an audience (sales odds, campaigns, ribbons, the CV).
 */
export function realFollowers(social: { followers?: unknown; fake?: unknown } | null | undefined): number {
  if (!social) return 0
  const followers = typeof social.followers === 'number' && Number.isFinite(social.followers) ? Math.max(0, Math.round(social.followers)) : 0
  const fake = typeof social.fake === 'number' && Number.isFinite(social.fake) ? Math.max(0, Math.round(social.fake)) : 0
  return followers - Math.min(followers, fake)
}
