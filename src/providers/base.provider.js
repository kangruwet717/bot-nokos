class BaseProvider {
  getBalance() {
    throw new Error('Not implemented');
  }

  getCountries() {
    throw new Error('Not implemented');
  }

  getServices() {
    throw new Error('Not implemented');
  }

  getPrices() {
    throw new Error('Not implemented');
  }

  getPriceOptions() {
    throw new Error('Not implemented');
  }

  createActivation() {
    throw new Error('Not implemented');
  }

  checkActivationStatus() {
    throw new Error('Not implemented');
  }

  cancelActivation() {
    throw new Error('Not implemented');
  }

  finishActivation() {
    throw new Error('Not implemented');
  }
}

module.exports = BaseProvider;
