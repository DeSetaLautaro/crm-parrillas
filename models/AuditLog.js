const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const AuditLogSchema = new Schema(
  {
    empresaId: {
      type: Types.ObjectId,
      ref: 'Empresa',
      default: null
    },
    usuarioId: {
      type: String,
      default: ''
    },
    usuarioNombre: {
      type: String,
      default: ''
    },
    rol: {
      type: String,
      default: ''
    },
    accion: {
      type: String,
      required: true
    },
    descripcion: {
      type: String,
      default: ''
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    },
    ip: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

AuditLogSchema.index({ empresaId: 1, createdAt: -1 });
AuditLogSchema.index({ accion: 1 });
AuditLogSchema.index({ usuarioId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
