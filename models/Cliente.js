const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const ClienteSchema = new Schema(
  {
    localId: {
      type: Types.ObjectId,
      ref: 'Usuario',
      default: null
    },
    empresaId: {
      type: Types.ObjectId,
      ref: 'Empresa',
      required: true
    },
    telefono: {
      type: String,
      required: true
    },
    nombre: {
      type: String,
      default: ''
    },
    direccion: {
      type: String,
      default: ''
    },
    pisoDepto: {
      type: String,
      default: ''
    },
    codigoPostal: {
      type: String,
      default: ''
    },
    fotoPerfil: {
      type: String,
      default: ''
    },
    etiquetas: {
      type: [
        {
          nombre: { type: String, default: '' },
          aplicadaPor: { type: String, default: '' },
          fecha: { type: Date, default: Date.now },
          sucursal: { type: String, default: '' }
        }
      ],
      default: []
    },
    notas: {
      type: [String],
      default: []
    },
    cantidadPedidos: {
      type: Number,
      default: 0
    },
    direcciones: {
      type: [String],
      default: []
    },
    ultimaFechaPedido: {
      type: Date,
      default: null
    },
    bloqueado: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

ClienteSchema.index({ empresaId: 1, telefono: 1 }, { unique: true });
ClienteSchema.index({ localId: 1 });
ClienteSchema.index({ bloqueado: 1 });

module.exports = mongoose.model('Cliente', ClienteSchema, 'clientes');
