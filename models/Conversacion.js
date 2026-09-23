const mongoose = require('mongoose');

const { Schema, Types } = mongoose;

const ConversacionSchema = new Schema(
  {
    empresaId: {
      type: Types.ObjectId,
      ref: 'Empresa',
      required: true
    },
    contactoId: {
      type: Types.ObjectId,
      ref: 'Cliente',
      required: true
    },
    lineaReceptora: {
      type: String,
      default: ''
    },
    numeroReceptor: {
      type: String,
      default: ''
    },
    botActivo: {
      type: Boolean,
      default: true
    },
    estado: {
      type: String,
      enum: ['Abierto', 'Resuelto', 'Cerrado'],
      default: 'Abierto'
    },
    ultimoMensaje: {
      type: String,
      default: ''
    },
    carrito: {
      type: [
        {
          nombre: { type: String, default: '' },
          cantidad: { type: Number, default: 1 },
          precioUnitario: { type: Number, default: 0 }
        }
      ],
      default: []
    },
    carritoTotal: {
      type: Number,
      default: 0
    },
    carritoActualizadoAt: {
      type: Date,
      default: null
    },
    latitud: {
      type: Number,
      default: null
    },
    longitud: {
      type: Number,
      default: null
    }
  },
  { timestamps: true }
);

ConversacionSchema.index({ empresaId: 1, updatedAt: -1 });
ConversacionSchema.index({ empresaId: 1, contactoId: 1 }, { unique: true });
ConversacionSchema.index({ empresaId: 1, botActivo: 1, estado: 1 });

module.exports = mongoose.model('Conversacion', ConversacionSchema, 'conversaciones');
