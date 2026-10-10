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
    // Galería de fotos de la parrilla (hasta 5). `fotoUrl` refleja la primera.
    fotos: {
      type: [String],
      default: []
    },
    fbAdId: {
      type: String,
      default: '',
      trim: true,
      index: true
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
        default: 0,
        validate: {
          validator: function (v) {
            // Solo exigimos un costo mayor a 0 cuando el envío es de tipo fijo
            if (this.envio?.tipo === 'fijo') return v > 0;
            return true; // gratis y a_consultar ignoran el costo
          },
          message: 'Si el envío es fijo, el costo debe ser mayor a 0'
        }
      }
    },
    dimensions: {
      widthCm: Number,
      depthCm: Number,
      heightCm: Number,
      diametroCm: Number,
      emparrilladoWidthCm: Number,
      emparrilladoDepthCm: Number,
      // Generado automáticamente en el backend a partir de los números de arriba.
      displayString: {
        type: String,
        default: ''
      }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Producto', ProductoSchema, 'productos');
