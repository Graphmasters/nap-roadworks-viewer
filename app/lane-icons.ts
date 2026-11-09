// Small lane-status-viewer icons for the lane categories (filter chips, Situation tab).

import { renderLaneStatusElement } from 'lane-status-viewer'
import { LANE_CATEGORIES, type LaneCategory, type LaneCategorySpec } from '../src/index'

export const LANE_CATEGORY_BY_ID = new Map<LaneCategory, LaneCategorySpec>(LANE_CATEGORIES.map((c) => [c.id, c]))

/** The category's lane-status icon, `size` pixels high (width follows the icon's aspect ratio). */
export function laneCategoryIcon(id: LaneCategory, size: number, opts: { title?: boolean } = {}): SVGSVGElement | null {
  const spec = LANE_CATEGORY_BY_ID.get(id)
  if (!spec) return null
  const svg = renderLaneStatusElement(spec.icon, { ariaLabel: spec.label })
  if (!svg) return null
  const [, , w, h] = (svg.getAttribute('viewBox') ?? '0 0 34 34').split(/\s+/).map(Number)
  svg.setAttribute('height', String(size))
  svg.setAttribute('width', String(Math.round((size * (w || 34)) / (h || 34))))
  svg.classList.add('lane-icon')
  if (opts.title) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title')
    t.textContent = spec.label
    svg.prepend(t)
  } else svg.setAttribute('aria-hidden', 'true')
  return svg
}
