/**
 * Example DATEX II files for the Open URL dialog. Every address here is an open publication whose server sends an
 * Access-Control-Allow-Origin header, so the browser can download it from the viewer, and whose records the viewer
 * draws on the map. Checked on 2026-11-18; the licence, provider and title are the ones on the publisher's public
 * dataset page.
 */

export interface UrlExample {
  /** The data provider, as the dataset page names it. */
  provider: string
  /** The data source title, as the dataset page names it. */
  title: string
  /** The licence, as the dataset page names it. */
  licence: string
  /** The public dataset page on the publisher's portal. */
  portalUrl: string
  /** The address that the Open button downloads. */
  url: string
}

export const URL_EXAMPLES: readonly UrlExample[] = [
  {
    provider: 'Administration des Ponts et Chaussées, Luxembourg (CITA)',
    title: 'PCH : Les chantiers actuels',
    licence: 'Creative Commons Zero (CC0 1.0)',
    portalUrl: 'https://data.public.lu/en/datasets/pch-les-chantiers-actuels/',
    url: 'https://www.cita.lu/info_trafic/datex/chantierActuelDatex.xml',
  },
  {
    provider: 'Administration des Ponts et Chaussées, Luxembourg (CITA)',
    title: 'PCH : Les futurs chantiers',
    licence: 'Creative Commons Zero (CC0 1.0)',
    portalUrl: 'https://data.public.lu/en/datasets/pch-les-futurs-chantiers/',
    url: 'https://www.cita.lu/info_trafic/datex/chantierFuturDatex.xml',
  },
  {
    provider: 'Verkehrsministerium Baden-Württemberg (MobiData BW)',
    title: 'Gebündelte Daten Baustelleninformationen Baden-Württemberg',
    licence: 'Datenlizenz Deutschland – Namensnennung – Version 2.0',
    portalUrl: 'https://mobidata-bw.de/dataset/baustelleninformationen-baden-wurttemberg',
    url: 'https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_svzbw.datex2.xml',
  },
]
