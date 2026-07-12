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
  // the Google Calendar event id, so a later delete knows which remote event to
  // remove; absent for meetings created before this field existed, or synced in
  // from a share link authored by someone else
  googleEventId?: string;
};

export type ClockConfig = {
  home: Location;
  rings: Location[];
  meetings: Meeting[];
};

export type Mode = 'view' | 'edit';
