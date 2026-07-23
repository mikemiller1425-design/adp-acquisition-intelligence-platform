import {
  chooseRecommendation,
  type RecommendationCandidate,
} from '../domain/recommendation-policy.js';

export class RecommendationService {
  recommend(candidates: readonly RecommendationCandidate[]) {
    return chooseRecommendation(candidates);
  }
}
