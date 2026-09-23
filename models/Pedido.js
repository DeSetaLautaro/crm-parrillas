const mongoose = require('mongoose');

const { Schema, Types } = mongoose;

const itemPedidoSchema = new Schema(
  {
    nombre: {
      type: String,
      default: ''
    },
    nombrePlato: {
      type: String,
      default: ''
    },
    cantidad: {
      type: Number,
      required: true,
      default: 1
    },
    precioUnitario: {
      type: Number,
      default: 0
    },
    precio: {
      type: Number,
      default: 0
    },
    enPromocion: {
      type: Boolean,
      default: false
    },
    porcentajeDescuento: {
      type: Number,
      default: 0
    },
    toppings: {
      type: [Schema.Types.Mixed],
      default: []
    }
  },
  { _id: false }
);

const PedidoSchema = new Schema(
  {
    // Referencia a la cuenta principal (dueño/local)
    localId: {
      type: Types.ObjectId,
      ref: 'Usuario',
      default: null
    },
    // Datos del cliente
    cliente: {
      type: String,
      default: ''
    },
    telefonoCliente: {
      type: String,
      default: ''
    },
    // Ítems del carrito
    items: {
      type: [itemPedidoSchema],
      default: []
    },
    total: {
      type: Number,
      default: 0
    },
    metodoPago: {
      type: String,
      default: ''
    },
    estado: {
      type: String,
      enum: ['Borrador', 'Pendiente', 'confirmado', 'en_preparacion', 'en_camino', 'Entregado', 'Cancelado', 'entregado', 'cancelado'],
      default: 'Borrador'
    },
    fechaEstado: {
      type: Date,
      default: null
    },
    fechaEntrega: {
      type: Date,
      default: null
    },
    direccion: {
      type: String,
      default: ''
    },
    notas: {
      type: String,
      default: ''
    },
    fechaTurno: {
      type: String,
      default: ''
    },
    fecha: {
      type: Date,
      default: Date.now
    },
    estadoDelivery: {
      type: String,
      default: 'pendiente'
    },
    numeroDiario: {
      type: Number,
      default: 0
    },
    // Campos adicionales para mantener compatibilidad con el sistema actual
    empresaId: {
      type: Types.ObjectId,
      ref: 'Empresa',
      default: null
    },
    conversacionId: {
      type: Types.ObjectId,
      ref: 'Conversacion',
      default: null
    },
    contactoId: {
      type: Types.ObjectId,
      ref: 'Cliente',
      default: null
    },
    direccionEntrega: {
      type: String,
      default: ''
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

PedidoSchema.index({ empresaId: 1, contactoId: 1, createdAt: -1 });
PedidoSchema.index({ conversacionId: 1, estado: 1 });
PedidoSchema.index({ telefonoCliente: 1, createdAt: -1 });

module.exports = mongoose.model('Pedido', PedidoSchema);
