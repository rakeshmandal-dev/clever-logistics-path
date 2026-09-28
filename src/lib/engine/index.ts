// Engine singleton. Only import this dynamically from inside server handlers.
import { RouteRecommender } from "./recommender";

let instance: RouteRecommender | undefined;
export function getRecommender() {
  if (!instance) instance = new RouteRecommender();
  return instance;
}
export { HUBS } from "./network";
export { getAllScenarios, getDisruptions } from "./scenarios";
export { getRankedSuppliers, getProcurementAdvice } from "./suppliers";
export { default as LOCATIONS } from "./data/canonical_locations.json";
