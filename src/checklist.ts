import type { IconName } from './components/Icon'
import * as shared from '../shared/checklist'

export type { CheckItem } from '../shared/checklist'
export interface Zone extends Omit<shared.Zone, 'icon'> {
  icon: IconName
}
export const ZONES = shared.ZONES as Zone[]
export const { ALL_ITEMS, itemByKey, MEASURES, COMMON_PARTS, DEFECT_DELAY } = shared
