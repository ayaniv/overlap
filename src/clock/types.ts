export type Location = {
  id: string;
  label: string;
  timezoneId: string;
  color: string;
  workStart: number;
  workEnd: number;
};

export type Meeting = {
  id: string;
  startISO: string;
  title: string;
};

export type ClockConfig = {
  home: Location;
  rings: Location[];
  meetings: Meeting[];
};

export type Mode = 'view' | 'edit' | 'schedule';
