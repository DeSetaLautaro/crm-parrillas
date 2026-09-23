const mongoose = require('mongoose');

const { Schema, Types } = mongoose;

const MensajeSchema = new Schema(
  {
    conversacionId: {
      type: Types.ObjectId,
      ref: 'Conversacion',
      required: true
    },
    remitente: {
      type: String,
      enum: ['cliente', 'bot', 'ia', 'humano', 'nota_interna', 'empresa'],
      required: true
    },
    whatsappMsgId: {
      type: String,
      default: ''
    },
    contenido: {
      type: String,
      required: true
    },
    tipo: {
      type: String,
      enum: ['texto', 'imagen', 'audio', 'video', 'documento'],
      default: 'texto'
    },
    urlArchivo: {
      type: String,
      default: ''
    },
    estado: {
      type: String,
      enum: ['enviado', 'entregado', 'leido', 'fallido'],
      default: 'enviado'
    },
    errorDetalle: {
      type: String,
      default: ''
    },
    fechaEstado: {
      type: Date,
      default: null
    },
    // ===== Reintentos automáticos =====
    intentosReintento: {
      type: Number,
      default: 0
    },
    proximoReintento: {
      type: Date,
      default: null
    },
    ultimoError: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

MensajeSchema.index({ conversacionId: 1, createdAt: -1 });
MensajeSchema.index({ whatsappMsgId: 1 }, { unique: true, sparse: true });
MensajeSchema.index({ conversacionId: 1, remitente: 1, createdAt: -1 });

module.exports = mongoose.model('Mensaje', MensajeSchema);
