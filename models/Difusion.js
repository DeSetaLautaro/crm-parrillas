const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const DifusionDestinatarioSchema = new Schema(
  {
    contactoId: { type: Types.ObjectId, ref: 'Cliente', default: null },
    telefono: { type: String, required: true },
    nombre: { type: String, default: '' },
    estado: { type: String, enum: ['pendiente','enviado','error'], default: 'pendiente' },
    error: { type: String, default: '' }
  },
  { _id: false }
);

const DifusionSchema = new Schema(
  {
    empresaId: { type: Types.ObjectId, ref: 'Empresa', required: true },
    usuarioAppId: { type: String, default: '' },
    mensaje: { type: String, required: true },
    contactos: { type: [DifusionDestinatarioSchema], default: [] },
    estado: { type: String, enum: ['borrador','programada','enviando','completada','error'], default: 'borrador' },
    fechaProgramacion: { type: Date, default: null },
    fechaEnvio: { type: Date, default: null },
    destinatariosTotal: { type: Number, default: 0 },
    destinatariosEnviados: { type: Number, default: 0 },
    errores: { type: [String], default: [] }
  },
  { timestamps: true }
);

DifusionSchema.index({ empresaId: 1, createdAt: -1 });
DifusionSchema.index({ estado: 1, fechaProgramacion: 1 });

module.exports = mongoose.model('Difusion', DifusionSchema);
