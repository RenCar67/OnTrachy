export class CarrierNotFoundException extends Error {
  constructor(message) {
    super(message);
    this.name = 'CarrierNotFoundException';
  }
}
