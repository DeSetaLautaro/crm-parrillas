const mongoose = require('mongoose');

const { Schema, Types } = mongoose;

const ProductoSchema = new Schema(
  {
    empresaId: {
      type: Types.ObjectId,
      ref: 'Empresa',
      required: true,
      index: true
    },
    nombre: {
      type: String,
      required: true
    },
    precio: {
      type: Number,
      required: true
    },
    fotoUrl: {
      type: String,
      default: ''
    },
    extras: {
      type: [String],
      default: []
    },
    envio: {
      tipo: {
        type: String,
        enum: ['gratis', 'a_consultar', 'fijo'],
        default: 'a_consultar'
      },
      costo: {
        type: Number,
        default: 0
      }
    },
    dimensions: {
      widthCm: Number,
      depthCm: Number,
      heightCm: Number,
      diametroCm: Number,
      emparrilladoWidthCm: Number,
      emparrilladoDepthCm: Number,
      displayString: {
        type: String,
        required: true
      }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Producto', ProductoSchema, 'productos');
