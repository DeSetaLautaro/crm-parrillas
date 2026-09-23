const MAX_CONCURRENCIA = parseInt(process.env.IA_MAX_CONCURRENCIA || '10', 10);
const MAX_COLA = parseInt(process.env.IA_MAX_COLA || '100', 10);

class IASemaphore {
  constructor({ concurrency = MAX_CONCURRENCIA, queueLimit = MAX_COLA } = {}) {
    this.concurrency = Math.max(1, concurrency);
    this.queueLimit = Math.max(0, queueLimit);
    this.active = 0;
    this.waiting = [];
    this.totalLanzadas = 0;
    this.totalCompletadas = 0;
    this.totalDescartadas = 0;
    this.totalErrores = 0;
  }

  async ejecutar(fn) {
    if (this.active >= this.concurrency) {
      if (this.waiting.length >= this.queueLimit) {
        this.waiting.shift()();
        this.totalDescartadas++;
      }
      await new Promise(resolve => this.waiting.push(resolve));
    }
    this.active++;
    this.totalLanzadas++;
    try {
      const result = await fn();
      this.totalCompletadas++;
      return result;
    } catch (error) {
      this.totalErrores++;
      throw error;
    } finally {
      this.active--;
      if (this.waiting.length > 0) {
        const next = this.waiting.shift();
        next();
      }
    }
  }

  obtenerEstado() {
    return {
      concurrencia: this.concurrency,
      colaMax: this.queueLimit,
      activas: this.active,
      enEspera: this.waiting.length,
      lanzadas: this.totalLanzadas,
      completadas: this.totalCompletadas,
      descartadas: this.totalDescartadas,
      errores: this.totalErrores
    };
  }
}

const colaIA = new IASemaphore();

module.exports = { colaIA, IASemaphore };
