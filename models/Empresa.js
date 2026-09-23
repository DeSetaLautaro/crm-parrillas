const mongoose = require('mongoose');
const { Schema } = mongoose;

const EmpresaSchema = new Schema(
  {
    nombre: {
      type: String,
      required: true
    },
    
    // 1. EL PUENTE: Conecta este bot con el usuario dueño en la App de Delivery
    usuarioAppId: { 
      type: String, 
      ref: 'Usuario', // O como se llame tu modelo en la App Delivery
      required: true 
    },

    // 3. WHATSAPP: Para saber a qué número le escribieron
    whatsappPhoneId: {
      type: String,
      required: true
    },

    // 4. WHATSAPP: El token de acceso de Meta para poder enviar mensajes
    tokenMeta: {
      type: String,
      required: true
    },

    // 5. IA: El contexto o personalidad de la IA para este local
    promptIA: {
      type: String,
      default: ''
    },

    // Atajos: comandos rápidos que detecta el bot
    atajos: [
      {
        comando: { type: String, default: '' },
        respuesta: { type: String, default: '' }
      }
    ],

    // 6. ESTADO: Para prender o apagar el bot
    botActivo: {
      type: Boolean,
      default: true
    },
    fotoPerfil: {
      type: String,
      default: ''
    },
    fotoPosicion: {
      type: String,
      default: '50% 50%'
    },
    estado: {
      type: String,
      default: ''
    },
    bienvenida: {
      type: String,
      default: ''
    },
    horariosEstructurados: [{
      dia: { type: String },
      apertura: { type: String },
      cierre: { type: String }
    }],
    abierto: {
      type: Boolean,
      default: true
    },
    procesarImagenes: {
      type: Boolean,
      default: false
    },
    procesarAudios: {
      type: Boolean,
      default: false
    },

    // Contador de conversaciones iniciadas en las últimas 24 horas
    conversacionesUsadas24h: {
      type: Number,
      default: 0
    },
    limiteConversaciones24h: {
      type: Number,
      default: 250
    },
    wabaId: {
      type: String,
      default: ''
    },
    metaCostoTotal: {
      type: Number,
      default: 0
    },
    metaUltimaActualizacion: {
      type: Date,
      default: null
    }
 
  },
  
  { timestamps: true }
  
);

// Podes seguir llamándolo 'Empresa' o 'BotCRM', para Mongoose es lo mismo

EmpresaSchema.index({ whatsappPhoneId: 1 }, { unique: true });
EmpresaSchema.index({ usuarioAppId: 1 });
EmpresaSchema.index({ botActivo: 1 });

module.exports = mongoose.model('Empresa', EmpresaSchema);
