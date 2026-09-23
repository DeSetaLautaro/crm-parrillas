class CircuitBreaker {
  constructor({ errorThreshold = 5, resetTimeout = 30000 } = {}) {
    this.errorThreshold = errorThreshold;
    this.resetTimeout = resetTimeout;
    this.failures = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = null;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    try {
      const result = await fn();
      this.failures = 0;
      this.state = 'CLOSED';
      return result;
    } catch (error) {
      this.failures++;
      if (this.failures >= this.errorThreshold) {
        this.state = 'OPEN';
        this.lastFailureTime = Date.now();
      }
      throw error;
    }
  }
}

module.exports = CircuitBreaker;
