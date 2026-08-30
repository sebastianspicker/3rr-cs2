/** Applies formatted live status to the DOM while preserving unknown states. */
import type { LiveStatusResponse } from './manageShared';
import { formatLiveStatus } from './manageLiveStatusFormat';
import {
  renderPageTitle,
  renderStatusFeedback,
  renderStatusIndicators,
  renderStatusMetrics,
  renderTruthRail,
} from './manageLiveStatusRenderers';

export function renderLiveStatus(data: LiveStatusResponse): void {
  const view = formatLiveStatus(data);
  renderStatusMetrics(view);
  renderStatusFeedback(view);
  renderTruthRail(data, view);
  renderStatusIndicators(data, view);
  renderPageTitle(view);
}
