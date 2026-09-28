export class ScraperStructureException extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScraperStructureException';
  }
}
