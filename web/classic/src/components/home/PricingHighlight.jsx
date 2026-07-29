// Compatibility re-export: the hardcoded pricing comparison UI has been
// replaced by the live Marketplace section (design H28 / REWORK-2 H33).
// This file is intentionally kept (not deleted) and now points at
// MarketplaceSection so any remaining imports resolve to the live
// marketplace implementation.
export { default } from './MarketplaceSection';
