const mongoose = require('mongoose');

const { Schema, Types } = mongoose;

const ProductoSchema = new Schema(
  {
    empresaId: {
      type: Types.ObjectId,
      ref: 'Empresa',
      required: true
    },
    nombre: {
      type: String,
      required: true
    },
    precio: {
      type: Number,
      required: true
    },
    categoria: {
      type: String,
      default: ''
    },
    descripcion: {
      type: String,
      default: ''
    },
    toppings: {
      type: [String],
      default: []
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Producto', ProductoSchema, 'productos');
