import { CorrelationConfig } from "@/lib/types";

export const correlationConfig: CorrelationConfig = {
  weights: {
    headerWeight: 0.3,
    valueWeight: 0.45,
    typeWeight: 0.2,
    metadataWeight: 0.05
  },
  strongThreshold: 80,
  mediumThreshold: 60,
  weakThreshold: 40,
  ambiguousDelta: 8
};
