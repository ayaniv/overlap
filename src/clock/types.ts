export type RingCity = {
  id: string;
  name: string;
  timezoneId: string;
  color: string;
};

export type WorldClockProps = {
  now: Date;
  homeCity: RingCity;
  worldCities: RingCity[];
  workStart?: number;
  workEnd?: number;
};
