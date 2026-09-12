// The published package omits its type entry from the exports map.
declare module "@toast-ui/calendar" {
  const Calendar: typeof import("../../node_modules/@toast-ui/calendar/types/index").default;
  type Calendar = InstanceType<typeof Calendar>;
  export default Calendar;
}
