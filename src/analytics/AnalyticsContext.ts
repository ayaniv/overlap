import { createContext } from 'react';
import { analytics } from './analytics';
import type { AnalyticsService } from './AnalyticsService';

export const AnalyticsContext = createContext<AnalyticsService>(analytics);
