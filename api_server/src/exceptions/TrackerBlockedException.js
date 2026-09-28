export class TrackerBlockedException extends Error {
  constructor(message) {
    super(message);
    this.name = 'TrackerBlockedException';
  }
}
