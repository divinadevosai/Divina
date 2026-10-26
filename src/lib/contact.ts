/**
 * Divina's public contact, as published on the website. Sent to data sources
 * that require an app to identify itself (MET Norway, OpenStreetMap), and
 * shown in legal pages. Never a personal address.
 */
export const CONTACT = process.env.NEXT_PUBLIC_DIVINA_CONTACT || 'dev@divinaos.site';
